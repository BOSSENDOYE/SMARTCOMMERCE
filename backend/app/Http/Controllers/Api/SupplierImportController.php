<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupplierImportController extends Controller
{
    private const VALID_PAYMENT_TERMS = ['immediate', '30_days', '45_days', '60_days', '90_days'];

    // ─── Template ────────────────────────────────────────────────────────────────

    public function template(): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Fournisseurs');

        $headers = [
            'A' => 'raison_sociale *',
            'B' => 'ninea',
            'C' => 'rc',
            'D' => 'contact',
            'E' => 'telephone',
            'F' => 'email',
            'G' => 'adresse',
            'H' => 'conditions_paiement (immediate/30_days/45_days/60_days/90_days)',
            'I' => 'delai_livraison_jours',
            'J' => 'notes',
            'K' => 'solde_du',
        ];

        foreach ($headers as $col => $value) {
            $sheet->setCellValue("{$col}1", $value);
        }

        $sheet->getStyle('A1:K1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '047857']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        foreach (array_keys($headers) as $col) {
            $sheet->getColumnDimension($col)->setWidth($col === 'H' ? 46 : 24);
        }

        // Example rows
        $sheet->setCellValue('A2', 'SARL Distribord');
        $sheet->setCellValue('B2', 'SN-DKR-2024-A1234');
        $sheet->setCellValue('D2', 'Mamadou Fall');
        $sheet->setCellValue('E2', '77 123 45 67');
        $sheet->setCellValue('F2', 'info@distribord.sn');
        $sheet->setCellValue('G2', 'Dakar, Plateau');
        $sheet->setCellValue('H2', '30_days');
        $sheet->setCellValue('I2', 5);
        $sheet->setCellValue('K2', 0);

        $sheet->setCellValue('A3', 'SOCOPRIM');
        $sheet->setCellValue('D3', 'Jean Dupont');
        $sheet->setCellValue('E3', '33 867 12 34');
        $sheet->setCellValue('G3', 'Thiès');
        $sheet->setCellValue('H3', '60_days');
        $sheet->setCellValue('I3', 10);
        $sheet->setCellValue('J3', 'Fournisseur principal céréales');
        $sheet->setCellValue('K3', 250000);

        $sheet->getStyle('A2:K3')->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'ECFDF5']],
        ]);

        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, 'modele_import_fournisseurs.xlsx', [
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
                'message' => "Format non supporté : «{$ext}». Utilisez un fichier Excel (.xlsx, .xls) ou CSV (.csv).",
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

        // Build lookup tables for deduplication (by phone and by company name)
        $existingByPhone = [];
        $existingByName  = [];

        Supplier::where('store_id', $storeId)
            ->select('id', 'company_name', 'phone')
            ->get()
            ->each(function ($s) use (&$existingByPhone, &$existingByName) {
                if ($s->phone) {
                    $norm = $this->normalizePhone($s->phone);
                    if ($norm !== '') $existingByPhone[$norm] = $s->id;
                }
                $nameLower = strtolower(trim($s->company_name));
                if ($nameLower !== '') $existingByName[$nameLower] = $s->id;
            });

        $results = [];

        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            $raisonSociale  = $this->cell($row, $col('raison_sociale'), '');
            $ninea           = $this->cell($row, $col('ninea'), '');
            $rc              = $this->cell($row, $col('rc'), '');
            $contact         = $this->cell($row, $col('contact'), '');
            $telephone       = $this->cell($row, $col('telephone'), '');
            $email           = $this->cell($row, $col('email'), '');
            $adresse         = $this->cell($row, $col('adresse'), '');
            $condCol         = $col('conditions_paiement_immediate_30_days_45_days_60_days_90_days')
                            ?? $col('conditions_paiement')
                            ?? $col('payment_terms');
            $conditions      = $this->cell($row, $condCol, 'immediate');
            $delaiCol        = $col('delai_livraison_jours') ?? $col('delai_livraison') ?? $col('delivery_days_avg');
            $delai           = (int) $this->number($this->cell($row, $delaiCol, '0'));
            $notes           = $this->cell($row, $col('notes'), '');
            $soldeCol        = $col('solde_du') ?? $col('balance_due') ?? $col('solde');
            $solde           = $this->number($this->cell($row, $soldeCol, '0'));

            // Skip blank rows
            if ($raisonSociale === '' && $telephone === '') {
                continue;
            }

            $errors   = [];
            $warnings = [];

            if ($raisonSociale === '') {
                $errors[] = 'Raison sociale obligatoire';
            }

            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $warnings[] = "Email «{$email}» invalide → sera ignoré";
                $email = '';
            }

            if (!in_array($conditions, self::VALID_PAYMENT_TERMS)) {
                $warnings[] = "Conditions «{$conditions}» invalides → «immediate» sera utilisé";
                $conditions = 'immediate';
            }

            if ($delai < 0) {
                $warnings[] = "Délai négatif → 0 sera utilisé";
                $delai = 0;
            }

            // Deduplication: phone first, then company name
            $existingId = null;
            $action     = 'create';
            $telNorm    = $this->normalizePhone($telephone);

            if ($telNorm !== '' && isset($existingByPhone[$telNorm])) {
                $existingId = $existingByPhone[$telNorm];
                $action     = 'update';
                $warnings[] = "Fournisseur avec téléphone «{$telephone}» existe → sera mis à jour";
            } elseif ($raisonSociale !== '' && isset($existingByName[strtolower($raisonSociale)])) {
                $existingId = $existingByName[strtolower($raisonSociale)];
                $action     = 'update';
                $warnings[] = "Fournisseur «{$raisonSociale}» existe → sera mis à jour";
            }

            $results[] = [
                'row'            => $i + 1,
                'action'         => $action,
                'existing_id'    => $existingId,
                'raison_sociale' => $raisonSociale,
                'ninea'          => $ninea ?: null,
                'rc'             => $rc ?: null,
                'contact'        => $contact ?: null,
                'telephone'      => $telephone ?: null,
                'email'          => $email ?: null,
                'adresse'        => $adresse ?: null,
                'conditions'     => $conditions,
                'delai'          => $delai,
                'notes'          => $notes ?: null,
                'solde_du'       => $solde,
                'errors'         => $errors,
                'warnings'       => $warnings,
                'status'         => count($errors) > 0 ? 'error' : 'ok',
            ];
        }

        $ok       = count(array_filter($results, fn($r) => $r['status'] === 'ok'));
        $errCount = count(array_filter($results, fn($r) => $r['status'] === 'error'));
        $creates  = count(array_filter($results, fn($r) => $r['status'] === 'ok' && $r['action'] === 'create'));
        $updates  = count(array_filter($results, fn($r) => $r['status'] === 'ok' && $r['action'] === 'update'));

        return response()->json([
            'rows'    => $results,
            'total'   => count($results),
            'ok'      => $ok,
            'errors'  => $errCount,
            'creates' => $creates,
            'updates' => $updates,
        ]);
    }

    // ─── Confirm ─────────────────────────────────────────────────────────────────

    public function confirm(Request $request)
    {
        $request->validate([
            'rows'                   => 'required|array|min:1',
            'rows.*.raison_sociale'  => 'required|string',
            'rows.*.action'          => 'required|in:create,update',
        ]);

        $storeId = $request->user()->store_id;
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $importErrors = [];

        foreach ($request->rows as $row) {
            if (($row['status'] ?? 'ok') === 'error') {
                $skipped++;
                continue;
            }

            try {
                $supplierData = [
                    'company_name'      => $row['raison_sociale'],
                    'ninea'             => $row['ninea'] ?? null,
                    'rc'                => $row['rc'] ?? null,
                    'contact_name'      => $row['contact'] ?? null,
                    'phone'             => $row['telephone'] ?? null,
                    'email'             => $row['email'] ?? null,
                    'address'           => $row['adresse'] ?? null,
                    'payment_terms'     => $row['conditions'] ?? 'immediate',
                    'delivery_days_avg' => (int) ($row['delai'] ?? 0),
                    'notes'             => $row['notes'] ?? null,
                ];

                $soldeDu = (float) ($row['solde_du'] ?? 0);

                if ($row['action'] === 'update' && !empty($row['existing_id'])) {
                    $supplier = Supplier::find($row['existing_id']);
                    if (!$supplier) { $skipped++; continue; }

                    $supplier->update($supplierData);

                    if ($soldeDu != 0) {
                        $supplier->update(['balance_due' => $soldeDu]);
                    }

                    $updated++;
                } else {
                    Supplier::create(array_merge($supplierData, [
                        'store_id'    => $storeId,
                        'is_active'   => true,
                        'balance_due' => $soldeDu,
                    ]));

                    $created++;
                }
            } catch (\Exception $e) {
                $importErrors[] = "Ligne {$row['row']}: " . $e->getMessage();
                $skipped++;
            }
        }

        return response()->json([
            'created' => $created,
            'updated' => $updated,
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

    private function normalizeHeader(mixed $header): string
    {
        $header = Str::ascii(strtolower((string) ($header ?? '')));
        $header = preg_replace('/[^a-z0-9]+/', '_', $header) ?? '';
        $header = preg_replace('/_+/', '_', $header) ?? '';
        return trim($header, '_');
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D/', '', $phone) ?? '';
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
