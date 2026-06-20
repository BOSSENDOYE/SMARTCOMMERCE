<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientAccountTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ClientImportController extends Controller
{
    // ─── Template ────────────────────────────────────────────────────────────────

    public function template(): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Clients');

        $headers = [
            'A' => 'nom *',
            'B' => 'telephone',
            'C' => 'email',
            'D' => 'adresse',
            'E' => 'type (individual/company)',
            'F' => 'ninea',
            'G' => 'notes',
            'H' => 'credit_en_cours',
            'I' => 'solde_compte',
            'J' => 'plafond_credit',
        ];

        foreach ($headers as $col => $value) {
            $sheet->setCellValue("{$col}1", $value);
        }

        $sheet->getStyle('A1:J1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1A56DB']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);

        foreach (array_keys($headers) as $col) {
            $sheet->getColumnDimension($col)->setWidth(24);
        }

        // Example rows
        $sheet->setCellValue('A2', 'Moussa Diallo');
        $sheet->setCellValue('B2', '77 123 45 67');
        $sheet->setCellValue('C2', 'moussa@example.com');
        $sheet->setCellValue('D2', 'Dakar, Médina');
        $sheet->setCellValue('E2', 'individual');
        $sheet->setCellValue('H2', 5000);
        $sheet->setCellValue('I2', 2000);
        $sheet->setCellValue('J2', 50000);

        $sheet->setCellValue('A3', 'SARL TechSénégal');
        $sheet->setCellValue('B3', '33 867 00 00');
        $sheet->setCellValue('E3', 'company');
        $sheet->setCellValue('F3', 'SN-DKR-2024-B1234');
        $sheet->setCellValue('J3', 200000);

        $sheet->getStyle('A2:J3')->applyFromArray([
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'EFF6FF']],
        ]);

        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, 'modele_import_clients.xlsx', [
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

        // Build normalized phone → client lookup (includes soft-deleted so we don't miss them)
        $existingByPhone = [];
        Client::withTrashed()
            ->where('store_id', $storeId)
            ->whereNotNull('phone')
            ->select('id', 'phone', 'deleted_at')
            ->get()
            ->each(function ($c) use (&$existingByPhone) {
                $norm = $this->normalizePhone($c->phone);
                if ($norm !== '') {
                    $existingByPhone[$norm] = ['id' => $c->id, 'trashed' => !is_null($c->deleted_at)];
                }
            });

        $results = [];

        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            $nom         = $this->cell($row, $col('nom'), '');
            $telephone   = $this->cell($row, $col('telephone'), '');
            $email       = $this->cell($row, $col('email'), '');
            $adresse     = $this->cell($row, $col('adresse'), '');
            $type        = $this->cell($row, $col('type_individual_company') ?? $col('type'), 'individual');
            $ninea       = $this->cell($row, $col('ninea'), '');
            $notes       = $this->cell($row, $col('notes'), '');
            $creditCols  = $col('credit_en_cours') ?? $col('credit') ?? $col('credit_balance');
            $credit      = $this->number($this->cell($row, $creditCols, 0));
            $soldeCols   = $col('solde_compte') ?? $col('account_balance') ?? $col('solde');
            $solde       = $this->number($this->cell($row, $soldeCols, 0));
            $plafondCols = $col('plafond_credit') ?? $col('credit_limit') ?? $col('plafond');
            $plafond     = $this->number($this->cell($row, $plafondCols, 0));

            // Skip blank rows
            if ($nom === '' && $telephone === '') {
                continue;
            }

            $errors   = [];
            $warnings = [];

            if ($nom === '') $errors[] = 'Nom obligatoire';

            if (!in_array($type, ['individual', 'company'])) {
                $warnings[] = "Type «{$type}» invalide → «individual» sera utilisé";
                $type = 'individual';
            }

            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $warnings[] = "Email «{$email}» invalide → sera ignoré";
                $email = '';
            }

            // Check if this is an update (normalized phone match, including soft-deleted)
            $existingId = null;
            $action     = 'create';
            $telNorm    = $this->normalizePhone($telephone);
            if ($telNorm !== '' && isset($existingByPhone[$telNorm])) {
                $existingId = $existingByPhone[$telNorm]['id'];
                $isTrashed  = $existingByPhone[$telNorm]['trashed'];
                $action     = 'update';
                $warnings[] = $isTrashed
                    ? "Client supprimé avec téléphone «{$telephone}» → sera restauré et mis à jour"
                    : "Client avec téléphone «{$telephone}» existe → sera mis à jour";
            }

            $results[] = [
                'row'            => $i + 1,
                'action'         => $action,
                'existing_id'    => $existingId,
                'nom'            => $nom,
                'telephone'      => $telephone ?: null,
                'email'          => $email ?: null,
                'adresse'        => $adresse ?: null,
                'type'           => $type,
                'ninea'          => $ninea ?: null,
                'notes'          => $notes ?: null,
                'credit_balance' => $credit,
                'account_balance'=> $solde,
                'credit_limit'   => $plafond,
                'errors'         => $errors,
                'warnings'       => $warnings,
                'status'         => count($errors) > 0 ? 'error' : 'ok',
            ];
        }

        $ok      = count(array_filter($results, fn($r) => $r['status'] === 'ok'));
        $errCount = count(array_filter($results, fn($r) => $r['status'] === 'error'));
        $creates = count(array_filter($results, fn($r) => $r['status'] === 'ok' && $r['action'] === 'create'));
        $updates = count(array_filter($results, fn($r) => $r['status'] === 'ok' && $r['action'] === 'update'));

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
            'rows'          => 'required|array|min:1',
            'rows.*.nom'    => 'required|string',
            'rows.*.action' => 'required|in:create,update',
        ]);

        $storeId = $request->user()->store_id;
        $userId  = $request->user()->id;
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
                $clientData = [
                    'name'         => $row['nom'],
                    'phone'        => $row['telephone'] ?? null,
                    'email'        => $row['email'] ?? null,
                    'address'      => $row['adresse'] ?? null,
                    'type'         => $row['type'] ?? 'individual',
                    'ninea'        => $row['ninea'] ?? null,
                    'notes'        => $row['notes'] ?? null,
                    'credit_limit' => (float) ($row['credit_limit'] ?? 0),
                ];

                $creditBalance  = (float) ($row['credit_balance'] ?? 0);
                $accountBalance = (float) ($row['account_balance'] ?? 0);

                if ($row['action'] === 'update' && !empty($row['existing_id'])) {
                    // withTrashed so soft-deleted clients can be restored on re-import
                    $client = Client::withTrashed()->find($row['existing_id']);
                    if (!$client) { $skipped++; continue; }

                    if ($client->trashed()) {
                        $client->restore();
                    }

                    $prevAccount = (float) $client->account_balance;
                    $client->update($clientData);

                    if ($accountBalance != 0 && $accountBalance != $prevAccount) {
                        $client->update(['account_balance' => $accountBalance]);
                        ClientAccountTransaction::create([
                            'client_id'      => $client->id,
                            'created_by'     => $userId,
                            'type'           => 'adjustment',
                            'amount'         => abs($accountBalance - $prevAccount),
                            'balance_before' => $prevAccount,
                            'balance_after'  => $accountBalance,
                            'note'           => 'Import fichier — solde compte',
                        ]);
                    }

                    if ($creditBalance != 0) {
                        $client->update(['credit_balance' => $creditBalance]);
                    }

                    $updated++;
                } else {
                    $client = Client::create(array_merge($clientData, [
                        'store_id'        => $storeId,
                        'is_active'       => true,
                        'credit_balance'  => $creditBalance,
                        'account_balance' => $accountBalance,
                    ]));

                    if ($accountBalance != 0) {
                        ClientAccountTransaction::create([
                            'client_id'      => $client->id,
                            'created_by'     => $userId,
                            'type'           => 'adjustment',
                            'amount'         => abs($accountBalance),
                            'balance_before' => 0,
                            'balance_after'  => $accountBalance,
                            'note'           => 'Import fichier — solde initial',
                        ]);
                    }

                    $created++;
                }
            } catch (\Illuminate\Database\QueryException $e) {
                // Unique phone violation — phone exists (possibly in another store or race condition)
                // Try to find by phone and update gracefully
                if ($e->getCode() === '23505' && !empty($row['telephone'])) {
                    $existing = Client::withTrashed()
                        ->where('phone', $row['telephone'])
                        ->where('store_id', $storeId)
                        ->first();

                    if ($existing) {
                        if ($existing->trashed()) $existing->restore();

                        $prevAccount = (float) $existing->account_balance;
                        $existing->update($clientData);

                        if ($accountBalance != 0 && $accountBalance != $prevAccount) {
                            $existing->update(['account_balance' => $accountBalance]);
                            ClientAccountTransaction::create([
                                'client_id'      => $existing->id,
                                'created_by'     => $userId,
                                'type'           => 'adjustment',
                                'amount'         => abs($accountBalance - $prevAccount),
                                'balance_before' => $prevAccount,
                                'balance_after'  => $accountBalance,
                                'note'           => 'Import fichier — solde compte (récupération doublon)',
                            ]);
                        }
                        if ($creditBalance != 0) $existing->update(['credit_balance' => $creditBalance]);
                        $updated++;
                    } else {
                        $importErrors[] = "Ligne {$row['row']}: Téléphone «{$row['telephone']}» déjà utilisé dans un autre magasin — ignoré";
                        $skipped++;
                    }
                } else {
                    $importErrors[] = "Ligne {$row['row']}: " . $e->getMessage();
                    $skipped++;
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
        // Keep only digits for comparison (strips spaces, dashes, dots, parentheses)
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
