<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\StockLevel;
use App\Services\AuditService;
use App\Services\StockService;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductImportController extends Controller
{
    // ─── Template ────────────────────────────────────────────────────────────────

    public function template(): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Produits');

        $headers = [
            'A' => 'nom *',
            'B' => 'code_interne',
            'C' => 'code_barres',
            'D' => 'categorie',
            'E' => 'marque',
            'F' => 'unite',
            'G' => 'prix_vente_ttc *',
            'H' => 'tva (0 ou 18)',
            'I' => 'prix_achat_ht *',
            'J' => 'stock_initial',
            'K' => 'stock_min',
            'L' => 'description',
        ];

        foreach ($headers as $col => $value) {
            $sheet->setCellValue("{$col}1", $value);
        }

        // Header style
        $sheet->getStyle('A1:L1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1A56DB']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        // Column widths
        foreach (array_keys($headers) as $col) {
            $sheet->getColumnDimension($col)->setWidth(22);
        }

        // Example row
        $sheet->setCellValue('A2', 'Huile Végétale 1L');
        $sheet->setCellValue('C2', '6191234567890');
        $sheet->setCellValue('D2', 'Alimentaire');
        $sheet->setCellValue('E2', 'Dinor');
        $sheet->setCellValue('F2', 'Pièce');
        $sheet->setCellValue('G2', 1500);
        $sheet->setCellValue('H2', 18);
        $sheet->setCellValue('I2', 1200);
        $sheet->setCellValue('J2', 100);
        $sheet->setCellValue('K2', 10);
        $sheet->setCellValue('L2', 'Exemple de description');

        $sheet->getStyle('A2:L2')->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'EFF6FF']],
        ]);

        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, 'modele_import_produits.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    // ─── Preview ─────────────────────────────────────────────────────────────────

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
        $sheet = $spreadsheet->getActiveSheet();
        $rows  = $sheet->toArray(null, true, true, false);

        if (count($rows) < 2) {
            return response()->json(['message' => 'Le fichier est vide ou ne contient pas de données.'], 422);
        }

        // Normalize header row
        $rawHeaders = array_map(fn($h) => strtolower(trim(preg_replace('/[^a-z0-9_]/i', '', str_replace([' ', '*', '(', ')'], ['_', '', '', ''], strtolower($h ?? ''))))), $rows[0]);
        $headerMap  = array_flip($rawHeaders);

        $col = fn(string $key): ?int => $headerMap[$key] ?? null;

        $existingCodes    = Product::pluck('internal_code')->flip()->toArray();
        $existingBarcodes = ProductBarcode::pluck('barcode')->flip()->toArray();
        $categories       = Category::pluck('id', 'name')->toArray();
        $brands           = Brand::pluck('id', 'name')->toArray();
        $units            = \App\Models\Unit::pluck('id', 'name')->toArray();

        $results = [];

        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            $nom         = $this->cell($row, $col('nom'), '');
            $codeInterne = $this->cell($row, $col('code_interne'), '');
            $codeBarres  = $this->cell($row, $col('code_barres'), '');
            $categorie   = $this->cell($row, $col('categorie'), '');
            $marque      = $this->cell($row, $col('marque'), '');
            $unite       = $this->cell($row, $col('unite'), '');
            $prixVente   = floatval($this->cell($row, $col('prix_vente_ttc'), 0));
            $tvaCols     = $col('tva_0_ou_18') ?? $col('tva') ?? $col('tva0_ou_18');
            $tva         = intval($this->cell($row, $tvaCols, 18));
            $prixAchat   = floatval($this->cell($row, $col('prix_achat_ht'), 0));
            $stockInit   = floatval($this->cell($row, $col('stock_initial'), 0));
            $stockMin    = floatval($this->cell($row, $col('stock_min'), 0));
            $description = $this->cell($row, $col('description'), '');

            // Skip totally empty rows
            if ($nom === '' && $codeInterne === '' && $prixVente == 0) {
                continue;
            }

            $errors   = [];
            $warnings = [];

            if ($nom === '') $errors[] = 'Nom obligatoire';
            if ($prixVente <= 0) $errors[] = 'Prix vente TTC invalide ou manquant';
            if ($prixAchat < 0) $errors[] = 'Prix achat HT invalide';
            if (!in_array($tva, [0, 18])) {
                $warnings[] = 'TVA invalide, 18% sera appliqué';
                $tva = 18;
            }

            if ($codeInterne !== '' && isset($existingCodes[$codeInterne])) {
                $warnings[] = "Code interne «{$codeInterne}» déjà utilisé → sera ignoré";
            }
            if ($codeBarres !== '' && isset($existingBarcodes[$codeBarres])) {
                $warnings[] = "Code-barres «{$codeBarres}» déjà utilisé";
            }

            $categoryId = null;
            if ($categorie !== '') {
                $categoryId = $categories[$categorie] ?? null;
                if (!$categoryId) $warnings[] = "Catégorie «{$categorie}» introuvable → sera créée";
            }
            $brandId = null;
            if ($marque !== '') {
                $brandId = $brands[$marque] ?? null;
                if (!$brandId) $warnings[] = "Marque «{$marque}» introuvable → sera créée";
            }
            $unitId = null;
            if ($unite !== '') {
                $unitId = $units[$unite] ?? null;
                if (!$unitId) $warnings[] = "Unité «{$unite}» introuvable → laissée vide";
            }

            $results[] = [
                'row'          => $i + 1,
                'nom'          => $nom,
                'code_interne' => $codeInterne ?: null,
                'code_barres'  => $codeBarres  ?: null,
                'categorie'    => $categorie   ?: null,
                'categorie_id' => $categoryId,
                'marque'       => $marque      ?: null,
                'marque_id'    => $brandId,
                'unite'        => $unite       ?: null,
                'unite_id'     => $unitId,
                'prix_vente_ttc'    => $prixVente,
                'tva'               => $tva,
                'prix_achat_ht'     => $prixAchat,
                'stock_initial'     => $stockInit,
                'stock_min'         => $stockMin,
                'description'       => $description ?: null,
                'errors'   => $errors,
                'warnings' => $warnings,
                'status'   => count($errors) > 0 ? 'error' : 'ok',
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

    public function confirm(Request $request)
    {
        $request->validate([
            'rows'                  => 'required|array|min:1',
            'rows.*.nom'            => 'required|string',
            'rows.*.prix_vente_ttc' => 'required|numeric|min:0',
            'rows.*.prix_achat_ht'  => 'required|numeric|min:0',
        ]);

        $storeId      = $request->user()->store_id;
        $stockService = app(StockService::class);
        $created      = 0;
        $skipped      = 0;
        $importErrors = [];

        // Build lookup caches (will grow as we create on the fly)
        $categories = Category::pluck('id', 'name')->toArray();
        $brands     = Brand::pluck('id', 'name')->toArray();

        foreach ($request->rows as $row) {
            if (($row['status'] ?? 'ok') === 'error') {
                $skipped++;
                continue;
            }

            try {
                // Skip if code interne already exists
                $codeInterne = $row['code_interne'] ?? null;
                if ($codeInterne && Product::where('internal_code', $codeInterne)->exists()) {
                    $skipped++;
                    continue;
                }

                // Auto-create category
                $categoryId = $row['categorie_id'] ?? null;
                if (!$categoryId && !empty($row['categorie'])) {
                    $cat        = Category::firstOrCreate(['name' => $row['categorie']], ['type' => 'common']);
                    $categoryId = $cat->id;
                    $categories[$row['categorie']] = $categoryId;
                }

                // Auto-create brand
                $brandId = $row['marque_id'] ?? null;
                if (!$brandId && !empty($row['marque'])) {
                    $brand   = Brand::firstOrCreate(['name' => $row['marque']]);
                    $brandId = $brand->id;
                    $brands[$row['marque']] = $brandId;
                }

                // Generate internal code if missing
                if (!$codeInterne) {
                    $codeInterne = 'P' . str_pad(Product::max('id') + 1, 8, '0', STR_PAD_LEFT);
                }

                $product = Product::create([
                    'store_id'          => $storeId,
                    'internal_code'     => $codeInterne,
                    'name'              => $row['nom'],
                    'description'       => $row['description'] ?? null,
                    'category_id'       => $categoryId,
                    'brand_id'          => $brandId,
                    'unit_id'           => $row['unite_id'] ?? null,
                    'sale_price_ttc'    => $row['prix_vente_ttc'],
                    'purchase_price_ht' => $row['prix_achat_ht'],
                    'vat_rate'          => $row['tva'] ?? 18,
                    'alert_stock'       => $row['stock_min'] ?? 0,
                    'min_stock'         => $row['stock_min'] ?? 0,
                    'is_active'         => true,
                    'track_expiry'      => false,
                    'is_weight_based'   => false,
                ]);

                // Barcode
                if (!empty($row['code_barres'])) {
                    ProductBarcode::firstOrCreate(
                        ['barcode' => $row['code_barres']],
                        ['product_id' => $product->id, 'type' => 'ean13', 'is_primary' => true]
                    );
                }

                // Initial stock
                $stockQty = floatval($row['stock_initial'] ?? 0);

                StockLevel::firstOrCreate(
                    ['store_id' => $storeId, 'product_id' => $product->id],
                    [
                        'qty_on_hand'  => $stockQty > 0 ? 0 : 0, // move() will add it
                        'qty_reserved' => 0,
                        'qty_on_order' => 0,
                        'avg_cost'     => $row['prix_achat_ht'],
                        'last_updated' => now(),
                    ]
                );

                if ($stockQty > 0) {
                    $stockService->move(
                        $storeId,
                        $product->id,
                        'opening',
                        $stockQty,
                        floatval($row['prix_achat_ht']),
                        null,
                        $request->user()->id,
                        null,
                        null,
                        'Import catalogue'
                    );
                }

                $created++;
            } catch (\Exception $e) {
                $importErrors[] = "Ligne {$row['row']}: " . $e->getMessage();
                $skipped++;
            }
        }

        AuditService::log('products_imported', 'products', null, [
            'created' => $created,
            'skipped' => $skipped,
        ]);

        return response()->json([
            'created' => $created,
            'skipped' => $skipped,
            'errors'  => $importErrors,
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private function cell(array $row, ?int $idx, mixed $default): string
    {
        if ($idx === null) return (string) $default;
        $val = $row[$idx] ?? $default;
        return trim((string) ($val ?? $default));
    }
}
