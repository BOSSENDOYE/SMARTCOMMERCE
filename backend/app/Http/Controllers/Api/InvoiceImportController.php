<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\InvoicePayment;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InvoiceImportController extends Controller
{
    // Mapping modepaye source → méthode SmartCommerce
    private const METHOD_MAP = [
        'espece'        => 'cash',
        'espèce'        => 'cash',
        'especes'       => 'cash',
        'espèces'       => 'cash',
        'cash'          => 'cash',
        'cheque'        => 'check',
        'chèque'        => 'check',
        'check'         => 'check',
        'mobile'        => 'mobile_money',
        'mobile_money'  => 'mobile_money',
        'wave'          => 'mobile_money',
        'orange'        => 'mobile_money',
        'virement'      => 'bank_transfer',
        'bank_transfer' => 'bank_transfer',
    ];

    // ─── Template ────────────────────────────────────────────────────────────────

    public function template(): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Factures');

        $headers = [
            'A' => 'full_name *',
            'B' => 'NumeroFC',
            'C' => 'DateFC',
            'D' => 'montantapaye *',
            'E' => 'dejapaye',
            'F' => 'etatFC',
            'G' => 'modepaye',
            'H' => 'numcheque',
            'I' => 'notes',
        ];

        foreach ($headers as $col => $value) {
            $sheet->setCellValue("{$col}1", $value);
        }

        $sheet->getStyle('A1:I1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1A56DB']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        foreach (array_keys($headers) as $col) {
            $sheet->getColumnDimension($col)->setWidth(22);
        }

        $sheet->setCellValue('A2', 'MOUNINA MME SECK NDOYE');
        $sheet->setCellValue('B2', '23');
        $sheet->setCellValue('C2', '31/07/2025');
        $sheet->setCellValue('D2', 52000);
        $sheet->setCellValue('E2', 0);
        $sheet->setCellValue('F2', 'Non payé');
        $sheet->setCellValue('G2', '');
        $sheet->setCellValue('H2', '');

        $sheet->setCellValue('A3', 'BINTOU WADE');
        $sheet->setCellValue('B3', '460');
        $sheet->setCellValue('C3', '04/12/2025');
        $sheet->setCellValue('D3', 420500);
        $sheet->setCellValue('E3', 320000);
        $sheet->setCellValue('F3', 'À compléter');
        $sheet->setCellValue('G3', 'ESPECE');

        $sheet->getStyle('A2:I3')->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'EFF6FF']],
        ]);

        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, 'modele_import_factures.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    // ─── Preview ─────────────────────────────────────────────────────────────────

    public function preview(Request $request)
    {
        $request->validate(['file' => 'required|file|max:10240']);

        $file = $request->file('file');
        $ext  = strtolower($file->getClientOriginalExtension());

        if (!in_array($ext, ['xlsx', 'xls', 'csv', 'txt'])) {
            return response()->json([
                'message' => "Format non supporté : «{$ext}». Utilisez .xlsx, .xls ou .csv",
            ], 422);
        }

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

        $rawHeaders = array_map(fn($h) => $this->normalizeHeader($h), $rows[0]);
        $headerMap  = array_flip($rawHeaders);
        $col = fn(string $key): ?int => $headerMap[$key] ?? null;

        $storeId = $request->user()->store_id;
        $userId  = $request->user()->id;

        // Lookup clients by normalized name
        $clientByName = [];
        Client::where('store_id', $storeId)
            ->whereNull('deleted_at')
            ->select('id', 'name')
            ->get()
            ->each(function ($c) use (&$clientByName) {
                $norm = $this->normalizeName($c->name);
                $clientByName[$norm] = $c->id;
            });

        // Lookup existing invoice references to detect duplicates
        $existingRefs = Invoice::where('store_id', $storeId)
            ->whereNull('deleted_at')
            ->pluck('reference')
            ->map(fn($r) => strtolower(trim($r)))
            ->flip()
            ->toArray();

        $results = [];

        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            $fullName  = $this->cell($row, $col('full_name'), '');
            $numeroFC  = $this->cell($row, $col('numerofc') ?? $col('numero_fc') ?? $col('reference'), '');
            $dateFC    = $this->cell($row, $col('datefc') ?? $col('date_fc') ?? $col('date'), '');
            $montant   = $this->number($this->cell($row, $col('montantapaye') ?? $col('montant') ?? $col('total'), '0'));
            $dejapaye  = $this->number($this->cell($row, $col('dejapaye') ?? $col('deja_paye') ?? $col('paye'), '0'));
            $etatFC    = $this->cell($row, $col('etatfc') ?? $col('etat_fc') ?? $col('statut') ?? $col('etat'), '');
            $modepaye  = $this->cell($row, $col('modepaye') ?? $col('mode_paye') ?? $col('mode'), '');
            $numCheque = $this->cell($row, $col('numcheque') ?? $col('num_cheque') ?? $col('cheque'), '');
            $notes     = $this->cell($row, $col('notes') ?? $col('note'), '');

            if ($fullName === '' && $montant == 0) continue;

            $errors   = [];
            $warnings = [];

            if ($fullName === '') {
                $errors[] = 'Nom client obligatoire';
            }

            if ($montant <= 0) {
                $errors[] = 'Montant invalide ou manquant';
            }

            // Client lookup
            $clientId = null;
            $clientName = null;
            if ($fullName !== '') {
                $norm = $this->normalizeName($fullName);
                if (isset($clientByName[$norm])) {
                    $clientId = $clientByName[$norm];
                    $clientName = $fullName;
                } else {
                    // Try partial match (first word)
                    foreach ($clientByName as $n => $id) {
                        if (str_contains($n, $norm) || str_contains($norm, $n)) {
                            $clientId = $id;
                            $clientName = $fullName;
                            $warnings[] = "Client «{$fullName}» trouvé par correspondance partielle";
                            break;
                        }
                    }
                    if (!$clientId) {
                        $errors[] = "Client «{$fullName}» introuvable dans le système";
                    }
                }
            }

            // Date parsing
            $parsedDate = $this->parseDate($dateFC);
            if ($dateFC !== '' && $parsedDate === null) {
                $warnings[] = "Date «{$dateFC}» invalide → date du jour sera utilisée";
            }
            $issueDate = $parsedDate ?? now()->toDateString();

            // Status mapping
            $status = $this->mapStatus($etatFC, $dejapaye, $montant, $issueDate);

            // Reference collision check
            $reference = $numeroFC ?: null;
            $action = 'create';
            if ($reference && isset($existingRefs[strtolower(trim($reference))])) {
                $action = 'skip';
                $warnings[] = "Référence «{$reference}» déjà importée → sera ignorée";
            }

            // Payment method
            $method = $this->mapMethod($modepaye);

            $results[] = [
                'row'         => $i + 1,
                'action'      => $action,
                'full_name'   => $fullName,
                'client_id'   => $clientId,
                'client_name' => $clientName,
                'reference'   => $reference,
                'issue_date'  => $issueDate,
                'total_ttc'   => $montant,
                'deja_paye'   => $dejapaye,
                'reste'       => round($montant - $dejapaye, 2),
                'status'      => $status,
                'method'      => $method,
                'num_cheque'  => $numCheque ?: null,
                'notes'       => $notes ?: null,
                'errors'      => $errors,
                'warnings'    => $warnings,
                'row_status'  => count($errors) > 0 ? 'error' : ($action === 'skip' ? 'skip' : 'ok'),
            ];
        }

        $ok      = count(array_filter($results, fn($r) => $r['row_status'] === 'ok'));
        $errCount = count(array_filter($results, fn($r) => $r['row_status'] === 'error'));
        $skipped = count(array_filter($results, fn($r) => $r['row_status'] === 'skip'));

        return response()->json([
            'rows'    => $results,
            'total'   => count($results),
            'ok'      => $ok,
            'errors'  => $errCount,
            'skipped' => $skipped,
        ]);
    }

    // ─── Confirm ─────────────────────────────────────────────────────────────────

    public function confirm(Request $request)
    {
        $request->validate([
            'rows'             => 'required|array|min:1',
            'rows.*.client_id' => 'required|integer',
            'rows.*.total_ttc' => 'required|numeric|min:0.01',
        ]);

        $storeId = $request->user()->store_id;
        $userId  = $request->user()->id;
        $created = 0;
        $skipped = 0;
        $importErrors = [];

        // Re-check existing refs to avoid duplicates during batch
        $existingRefs = Invoice::where('store_id', $storeId)
            ->whereNull('deleted_at')
            ->pluck('reference')
            ->map(fn($r) => strtolower(trim($r)))
            ->flip()
            ->toArray();

        foreach ($request->rows as $row) {
            if (($row['row_status'] ?? 'ok') !== 'ok') {
                $skipped++;
                continue;
            }

            try {
                // Double-check reference uniqueness
                $reference = $row['reference'] ?? null;
                if ($reference && isset($existingRefs[strtolower(trim($reference))])) {
                    $skipped++;
                    continue;
                }

                // Generate reference if not provided
                if (!$reference) {
                    $reference = $this->generateReference($storeId);
                }

                $totalTtc  = (float) $row['total_ttc'];
                $dejaPaye  = (float) ($row['deja_paye'] ?? 0);
                $issueDate = $row['issue_date'] ?? now()->toDateString();
                $status    = $row['status'] ?? 'sent';

                // Create invoice (no line items — direct amount import)
                $invoice = Invoice::create([
                    'store_id'        => $storeId,
                    'client_id'       => $row['client_id'],
                    'created_by'      => $userId,
                    'reference'       => $reference,
                    'object'          => 'Import',
                    'status'          => $status,
                    'issue_date'      => $issueDate,
                    'due_date'        => $issueDate,
                    'subtotal_ht'     => $totalTtc,
                    'vat_amount'      => 0,
                    'discount_amount' => 0,
                    'total_ttc'       => $totalTtc,
                    'paid_amount'     => 0,
                    'notes'           => $row['notes'] ?? null,
                    'sent_at'         => now(),
                ]);

                // Record historical payment if any
                if ($dejaPaye > 0) {
                    InvoicePayment::create([
                        'invoice_id'  => $invoice->id,
                        'amount'      => $dejaPaye,
                        'method'      => $row['method'] ?? 'cash',
                        'reference'   => $row['num_cheque'] ?? null,
                        'paid_at'     => $issueDate,
                        'notes'       => 'Import — paiement historique',
                        'recorded_by' => $userId,
                    ]);

                    // Sync paid_amount and status
                    $invoice->refreshPaidAmount();
                }

                // Mark in local set to avoid same-batch duplicates
                $existingRefs[strtolower(trim($reference))] = true;
                $created++;
            } catch (\Exception $e) {
                $importErrors[] = "Ligne {$row['row']}: " . $e->getMessage();
                $skipped++;
            }
        }

        return response()->json([
            'created' => $created,
            'skipped' => $skipped,
            'errors'  => $importErrors,
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private function mapStatus(string $etat, float $deja, float $total, string $issueDate): string
    {
        $etatNorm = strtolower(trim(Str::ascii($etat)));
        if (str_contains($etatNorm, 'paye') && !str_contains($etatNorm, 'non') && !str_contains($etatNorm, 'a ')) {
            if ($deja >= $total) return 'paid';
        }
        if ($deja > 0 && $deja < $total) return 'partial';
        if ($deja <= 0) {
            $isOverdue = strtotime($issueDate) < strtotime('-30 days');
            return $isOverdue ? 'overdue' : 'sent';
        }
        return 'sent';
    }

    private function mapMethod(string $mode): string
    {
        $norm = strtolower(trim(Str::ascii($mode)));
        return self::METHOD_MAP[$norm] ?? 'cash';
    }

    private function parseDate(string $date): ?string
    {
        if ($date === '') return null;

        // Handle numeric Excel date serial
        if (is_numeric($date)) {
            $unix = (\PhpOffice\PhpSpreadsheet\Shared\Date::excelToTimestamp((float)$date));
            return date('Y-m-d', $unix);
        }

        // Common formats
        $formats = ['d/m/Y', 'Y-m-d', 'd-m-Y', 'm/d/Y', 'd.m.Y'];
        foreach ($formats as $fmt) {
            $dt = \DateTime::createFromFormat($fmt, $date);
            if ($dt) return $dt->format('Y-m-d');
        }

        return null;
    }

    private function generateReference(int $storeId): string
    {
        $year  = now()->year;
        $last  = Invoice::where('store_id', $storeId)
            ->where('reference', 'like', "IMP-{$year}-%")
            ->orderByDesc('id')
            ->value('reference');

        $next = 1;
        if ($last && preg_match('/IMP-\d{4}-(\d+)/', $last, $m)) {
            $next = (int) $m[1] + 1;
        }

        return sprintf('IMP-%d-%06d', $year, $next);
    }

    private function normalizeName(string $name): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', Str::ascii($name)) ?? ''));
    }

    private function cell(array $row, ?int $idx, mixed $default): string
    {
        if ($idx === null) return (string) $default;
        $val = $row[$idx] ?? $default;
        return trim((string) ($val ?? $default));
    }

    private function normalizeHeader(mixed $header): string
    {
        $header = Str::ascii(strtolower((string) ($header ?? '')));
        $header = preg_replace('/[^a-z0-9]+/', '_', $header) ?? '';
        $header = preg_replace('/_+/', '_', $header) ?? '';
        return trim($header, '_');
    }

    private function number(string $value): float
    {
        $value = trim(str_replace(["\xc2\xa0", ' '], '', $value));
        if ($value === '') return 0.0;
        if (str_contains($value, ',') && str_contains($value, '.')) {
            $value = str_replace(',', '', $value);
        } elseif (str_contains($value, ',')) {
            $value = str_replace(',', '.', $value);
        }
        return (float) $value;
    }
}
