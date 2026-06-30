<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\BackupLog;
use App\Models\BackupSetting;
use App\Services\GoogleDriveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class BackupController extends Controller
{
    // ── GET /superadmin/backup/settings ──────────────────────────────────────

    public function settings(): JsonResponse
    {
        $s = BackupSetting::instance();

        return response()->json([
            'schedule'             => $s->schedule,
            'schedule_time'        => $s->schedule_time,
            'schedule_day'         => $s->schedule_day,
            'retention_count'      => $s->retention_count,
            'drive_enabled'        => $s->drive_enabled,
            'drive_folder_id'      => $s->drive_folder_id,
            'has_drive_credentials' => !empty($s->drive_credentials),
            'drive_service_account' => $this->saEmail($s),
            'pg_dump_path'         => $s->pg_dump_path,
            'last_run_at'          => $s->last_run_at?->toIso8601String(),
            'next_run_at'          => $s->nextRunAt(),
        ]);
    }

    // ── PUT /superadmin/backup/settings ──────────────────────────────────────

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'schedule'        => 'sometimes|in:never,daily,weekly,monthly',
            'schedule_time'   => ['sometimes', 'regex:/^\d{2}:\d{2}$/'],
            'schedule_day'    => 'sometimes|integer|min:0|max:31',
            'retention_count' => 'sometimes|integer|min:1|max:365',
            'drive_enabled'   => 'sometimes|boolean',
            'drive_folder_id' => 'sometimes|nullable|string|max:500',
            'drive_credentials' => 'sometimes|nullable|string',
            'pg_dump_path'    => 'sometimes|nullable|string|max:500',
        ]);

        $s = BackupSetting::instance();

        // Valider le JSON des credentials si fourni
        if (!empty($data['drive_credentials'])) {
            $json = json_decode($data['drive_credentials'], true);
            if (!$json || empty($json['private_key']) || empty($json['client_email'])) {
                return response()->json(['message' => 'JSON de compte de service invalide.'], 422);
            }
        } elseif (array_key_exists('drive_credentials', $data) && $data['drive_credentials'] === null) {
            // Explicit null = clear credentials
        } else {
            unset($data['drive_credentials']); // Ne pas écraser si pas fourni
        }

        $s->update($data);

        return $this->settings();
    }

    // ── GET /superadmin/backup/logs ───────────────────────────────────────────

    public function logs(): JsonResponse
    {
        $logs = BackupLog::orderByDesc('created_at')->limit(50)->get();

        $totalSize  = BackupLog::where('status', 'success')->sum('size_bytes');
        $lastSuccess = BackupLog::where('status', 'success')->latest()->first();

        return response()->json([
            'logs'        => $logs,
            'total_size'  => $totalSize,
            'total_count' => $logs->where('status', 'success')->count(),
            'last_success' => $lastSuccess?->created_at?->toIso8601String(),
        ]);
    }

    // ── POST /superadmin/backup/run ───────────────────────────────────────────

    public function run(): JsonResponse
    {
        $log = BackupLog::create([
            'filename'     => 'en cours…',
            'status'       => 'running',
            'destinations' => [],
        ]);

        try {
            Artisan::call('backup:run', ['--force' => true, '--log-id' => $log->id]);
        } catch (\Throwable $e) {
            $log->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
            return response()->json(['message' => $e->getMessage()], 500);
        }

        $log->refresh();
        return response()->json($log);
    }

    // ── POST /superadmin/backup/test-drive ───────────────────────────────────

    public function testDrive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'drive_folder_id'   => 'required|string',
            'drive_credentials' => 'required|string',
        ]);

        try {
            $drive = new GoogleDriveService($data['drive_credentials']);
            $ok    = $drive->testConnection($data['drive_folder_id']);

            return response()->json([
                'success' => $ok,
                'message' => $ok ? 'Connexion réussie !' : 'Dossier inaccessible. Vérifiez l\'ID et les permissions.',
                'service_account' => $drive->getServiceAccountEmail(),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    // ── POST /superadmin/backup/optimize-indexes ─────────────────────────────

    public function optimizeIndexes(): JsonResponse
    {
        ob_start();
        Artisan::call('db:optimize-indexes');
        $output = ob_get_clean() . Artisan::output();

        return response()->json(['output' => $output]);
    }

    // ── DELETE /superadmin/backup/logs/{id} ──────────────────────────────────

    public function destroyLog(int $id): JsonResponse
    {
        $log = BackupLog::findOrFail($id);

        // Supprimer le fichier local si il existe
        $path = storage_path('app/backups/' . $log->filename);
        if (file_exists($path)) @unlink($path);

        $log->delete();
        return response()->json(['ok' => true]);
    }

    // ── GET /superadmin/backup/stats ─────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $s = BackupSetting::instance();

        $localFiles = glob(storage_path('app/backups/backup_*.sql.gz')) ?: [];
        $localSize  = array_sum(array_map('filesize', $localFiles));

        return response()->json([
            'local_count'  => count($localFiles),
            'local_size'   => $localSize,
            'last_run_at'  => $s->last_run_at?->toIso8601String(),
            'next_run_at'  => $s->nextRunAt(),
            'schedule'     => $s->schedule,
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function saEmail(BackupSetting $s): ?string
    {
        if (empty($s->drive_credentials)) return null;
        try {
            $j = json_decode((string) $s->drive_credentials, true);
            return $j['client_email'] ?? null;
        } catch (\Throwable) {
            return null;
        }
    }
}
