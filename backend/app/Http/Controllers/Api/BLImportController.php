<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\ProductLot;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReception;
use App\Models\PurchaseReceptionItem;
use App\Models\StockLevel;
use App\Services\AuditService;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;

class BLImportController extends Controller
{
    // ─── Preview ─────────────────────────────────────────────────────────────────

    /**
     * Parse BL file and return rows with product matching status.
     * Expected columns: reference_produit, designation, quantite, prix_achat_ht, tva, lot, date_expiration
     */
    public function preview(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv,txt|max:10240']);

        $file = $request->file('file');
        $ext  = strtolower($file->getClientOriginalExtension());

        if (in_array($ext, ['csv', 'txt'])) {
            $reader = IOFactory::createReader('Csv');
            $reader->setDelimiter(',');
            $reader->setEnclosure('"');
        } else {
            $reader = IOFactory::createReaderForFile($file->getPathname());
        }

        $reader->setReadDataOnly(true);
        $spreadsheet = $reader->load($file->getPathname());
        $sheet       = $spreadsheet->getActiveSheet();
        $rows        = $sheet->toArray(null, true, true, false);

        if (count($rows) < 2) {
            return response()->json(['message' => 'Le fichier est vide ou ne contient pas de données.'], 422);
        }

        $storeId = $request->user()->store_id;

        // Normalize headers
        $rawHeaders = array_map(
            fn($h) => preg_replace('/[^a-z0-9_]/', '_', strtolower(trim($h ?? ''))),
            $rows[0]
        );
        $headerMap = array_flip($rawHeaders);

        $col = fn(string ...$keys): ?int => collect($keys)->map(fn($k) => $headerMap[$k] ?? null)->filter()->first();

        $results = [];

        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            $ref         = $this->cell($row, $col('reference_produit', 'ref_produit', 'reference', 'code'), '');
            $designation = $this->cell($row, $col('designation', 'libelle', 'nom', 'produit'), '');
            $qty         = floatval($this->cell($row, $col('quantite', 'qte', 'qty', 'quantit_'), 0));
            $prixAchat   = floatval($this->cell($row, $col('prix_achat_ht', 'prix_ht', 'pu_ht', 'prix_unitaire'), 0));
            $tva         = intval($this->cell($row, $col('tva', 'taux_tva'), 18));
            $lot         = $this->cell($row, $col('lot', 'numero_lot', 'lot_number'), '');
            $dateExp     = $this->cell($row, $col('date_expiration', 'date_exp', 'expiration', 'dlc'), '');

            if ($ref === '' && $designation === '' && $qty == 0) continue;

            $errors   = [];
            $warnings = [];
            $product  = null;

            // Try to find product by internal_code or barcode
            if ($ref !== '') {
                $product = Product::forStore($storeId)
                    ->where('internal_code', $ref)
                    ->first();

                if (!$product) {
                    $bc = ProductBarcode::where('barcode', $ref)->first();
                    if ($bc) {
                        $product = Product::forStore($storeId)->find($bc->product_id);
                    }
                }

                if (!$product) {
                    $warnings[] = "Produit «{$ref}» introuvable — sera ignoré à la confirmation";
                }
            } else {
                $errors[] = 'Référence produit obligatoire';
            }

            if ($qty <= 0)       $errors[] = 'Quantité invalide ou manquante';
            if ($prixAchat < 0)  $errors[] = 'Prix achat invalide';
            if (!in_array($tva, [0, 18])) {
                $warnings[] = 'TVA invalide, 18% sera appliqué';
                $tva = 18;
            }

            // Validate date_expiration format
            $dateExpParsed = null;
            if ($dateExp !== '') {
                try {
                    $dateExpParsed = date('Y-m-d', strtotime($dateExp));
                    if (!$dateExpParsed || $dateExpParsed === '1970-01-01') {
                        $warnings[] = "Date d'expiration «{$dateExp}» non reconnue";
                        $dateExpParsed = null;
                    }
                } catch (\Exception $e) {
                    $warnings[] = "Date d'expiration invalide";
                }
            }

            $results[] = [
                'row'              => $i + 1,
                'reference'        => $ref ?: null,
                'designation'      => $designation ?: ($product?->name ?? null),
                'product_id'       => $product?->id,
                'product_name'     => $product?->name,
                'product_code'     => $product?->internal_code,
                'quantite'         => $qty,
                'prix_achat_ht'    => $prixAchat > 0 ? $prixAchat : ($product ? (float)$product->purchase_price_ht : 0),
                'tva'              => $tva,
                'lot'              => $lot  ?: null,
                'date_expiration'  => $dateExpParsed,
                'errors'           => $errors,
                'warnings'         => $warnings,
                'status'           => (count($errors) > 0 || !$product) ? 'error' : 'ok',
            ];
        }

        $ok     = count(array_filter($results, fn($r) => $r['status'] === 'ok'));
        $errors = count(array_filter($results, fn($r) => $r['status'] === 'error'));

        return response()->json([
            'rows'   => $results,
            'total'  => count($results),
            'ok'     => $ok,
            'errors' => $errors,
        ]);
    }

    // ─── Confirm ─────────────────────────────────────────────────────────────────

    /**
     * Create a PurchaseOrder + Reception from validated BL rows.
     * Automatically updates stock.
     */
    public function confirm(Request $request)
    {
        $request->validate([
            'supplier_id'            => 'nullable|exists:suppliers,id',
            'bl_reference'           => 'nullable|string|max:100',
            'rows'                   => 'required|array|min:1',
            'rows.*.product_id'      => 'required|exists:products,id',
            'rows.*.quantite'        => 'required|numeric|min:0.001',
            'rows.*.prix_achat_ht'   => 'required|numeric|min:0',
        ]);

        $storeId      = $request->user()->store_id;
        $stockService = app(StockService::class);

        // Only keep rows with product_id set (skip unmatched)
        $validRows = collect($request->rows)
            ->filter(fn($r) => !empty($r['product_id']) && ($r['status'] ?? 'ok') !== 'error')
            ->values();

        if ($validRows->isEmpty()) {
            return response()->json(['message' => 'Aucune ligne valide à importer.'], 422);
        }

        return DB::transaction(function () use ($request, $validRows, $storeId, $stockService) {
            // 1. Create a PurchaseOrder (type BL direct)
            $bcRef = 'BC-BL-' . date('Ymd') . '-' . str_pad(
                PurchaseOrder::whereDate('created_at', today())->count() + 1, 4, '0', STR_PAD_LEFT
            );

            $totalHt = $validRows->sum(fn($r) => floatval($r['quantite']) * floatval($r['prix_achat_ht']));

            $order = PurchaseOrder::create([
                'store_id'    => $storeId,
                'supplier_id' => $request->supplier_id ?? null,
                'reference'   => $bcRef,
                'status'      => 'received',
                'user_id'     => $request->user()->id,
                'total_ht'    => $totalHt,
                'total_ttc'   => $totalHt, // BL direct without TVA calc
                'notes'       => 'Import BL direct — ' . ($request->bl_reference ?? $bcRef),
            ]);

            // 2. Create PO items
            foreach ($validRows as $row) {
                PurchaseOrderItem::create([
                    'purchase_order_id' => $order->id,
                    'product_id'        => $row['product_id'],
                    'qty_ordered'       => $row['quantite'],
                    'unit_price_ht'     => $row['prix_achat_ht'],
                    'vat_rate'          => $row['tva'] ?? 18,
                    'total_ht'          => floatval($row['quantite']) * floatval($row['prix_achat_ht']),
                ]);
            }

            // 3. Create Reception
            $blRef = 'BR-' . date('Ymd') . '-' . str_pad(
                PurchaseReception::whereDate('created_at', today())->count() + 1, 4, '0', STR_PAD_LEFT
            );

            $reception = PurchaseReception::create([
                'purchase_order_id'     => $order->id,
                'store_id'              => $storeId,
                'user_id'               => $request->user()->id,
                'reference'             => $blRef,
                'supplier_delivery_ref' => $request->bl_reference ?? null,
                'received_at'           => now(),
                'status'                => 'complete',
                'notes'                 => 'Import BL',
            ]);

            $received = 0;

            foreach ($validRows as $row) {
                // Create lot if lot number provided
                $lotId = null;
                if (!empty($row['lot'])) {
                    $lot = ProductLot::firstOrCreate(
                        [
                            'product_id' => $row['product_id'],
                            'lot_number' => $row['lot'],
                        ],
                        [
                            'store_id'       => $storeId,
                            'current_qty'    => 0,
                            'expiry_date'    => $row['date_expiration'] ?? null,
                            'received_at'    => now(),
                        ]
                    );
                    $lotId = $lot->id;
                }

                PurchaseReceptionItem::create([
                    'reception_id'  => $reception->id,
                    'product_id'    => $row['product_id'],
                    'qty_ordered'   => $row['quantite'],
                    'qty_received'  => $row['quantite'],
                    'qty_rejected'  => 0,
                    'unit_price_ht' => $row['prix_achat_ht'],
                    'lot_number'    => $row['lot']            ?? null,
                    'expiry_date'   => $row['date_expiration'] ?? null,
                ]);

                // Move stock
                $stockService->move(
                    $storeId,
                    $row['product_id'],
                    'purchase_in',
                    floatval($row['quantite']),
                    floatval($row['prix_achat_ht']),
                    $lotId,
                    $request->user()->id,
                    null,
                    null,
                    "{$blRef} — Import BL " . ($request->bl_reference ?? '')
                );

                $received++;
            }

            AuditService::log('bl_imported', 'purchase_receptions', $reception->id, [
                'bl_reference' => $request->bl_reference,
                'lines'        => $received,
            ]);

            return response()->json([
                'reception_ref' => $blRef,
                'order_ref'     => $bcRef,
                'lines'         => $received,
                'reception_id'  => $reception->id,
            ], 201);
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private function cell(array $row, ?int $idx, mixed $default): string
    {
        if ($idx === null) return (string) $default;
        $val = $row[$idx] ?? $default;
        return trim((string) ($val ?? $default));
    }
}
