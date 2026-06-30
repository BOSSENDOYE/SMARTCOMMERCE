<?php

namespace App\Console\Commands;

use App\Models\BackupLog;
use App\Models\BackupSetting;
use App\Services\GoogleDriveService;
use Illuminate\Console\Command;

class RunBackupCommand extends Command
{
    protected $signature   = 'backup:run {--force : Ignorer le planning et forcer le backup} {--log-id= : ID du BackupLog existant}';
    protected $description = 'Sauvegarder la base de données et envoyer sur Google Drive si configuré';

    public function handle(): int
    {
        $settings = BackupSetting::instance();

        if (!$this->option('force') && !$settings->shouldRunNow()) {
            $this->line('Backup non planifié maintenant — aucune action.');
            return 0;
        }

        $logId = $this->option('log-id');
        $log   = $logId
            ? BackupLog::find($logId)
            : BackupLog::create(['filename' => '', 'status' => 'running', 'destinations' => []]);

        if (!$log) {
            $this->error('BackupLog introuvable.');
            return 1;
        }

        $this->info('Démarrage de la sauvegarde…');
        $start  = microtime(true);
        $errors = [];
        $dests  = [];

        try {
            // ── 1. Créer le répertoire de backup ─────────────────────────────
            $backupDir = storage_path('app/backups');
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0755, true);
            }

            // ── 2. Nom du fichier ─────────────────────────────────────────────
            $filename = 'backup_' . now()->format('Y-m-d_H-i-s') . '.sql.gz';
            $gzPath   = $backupDir . DIRECTORY_SEPARATOR . $filename;

            $log->update(['filename' => $filename]);

            // ── 3. pg_dump ────────────────────────────────────────────────────
            $this->info("Dump vers : $gzPath");
            $this->runPgDump($settings, $gzPath);

            $fileSize = filesize($gzPath);
            $dests[]  = 'local';
            $this->info('Dump local OK — taille : ' . $this->humanSize($fileSize));

            // ── 4. Google Drive ───────────────────────────────────────────────
            if ($settings->drive_enabled && $settings->drive_credentials && $settings->drive_folder_id) {
                try {
                    $this->info('Upload vers Google Drive…');
                    $drive = new GoogleDriveService((string) $settings->drive_credentials);
                    $drive->uploadFile($gzPath, $settings->drive_folder_id, $filename);
                    $dests[] = 'drive';
                    $this->info('Upload Drive OK.');
                } catch (\Throwable $e) {
                    $errors[] = 'Drive: ' . $e->getMessage();
                    $this->warn('Upload Drive échoué : ' . $e->getMessage());
                }
            }

            // ── 5. Rétention (supprimer les anciens fichiers) ─────────────────
            $this->applyRetention($settings, $backupDir);

            // ── 6. Mettre à jour le log ───────────────────────────────────────
            $duration = (int) round(microtime(true) - $start);
            $log->update([
                'status'           => empty($errors) ? 'success' : 'success',
                'size_bytes'       => $fileSize,
                'destinations'     => $dests,
                'duration_seconds' => $duration,
                'error_message'    => empty($errors) ? null : implode("\n", $errors),
            ]);

            $settings->update(['last_run_at' => now()]);

            $this->info("✅ Sauvegarde terminée en {$duration}s.");
            return 0;

        } catch (\Throwable $e) {
            $duration = (int) round(microtime(true) - $start);
            $log->update([
                'status'           => 'failed',
                'destinations'     => $dests,
                'duration_seconds' => $duration,
                'error_message'    => $e->getMessage(),
            ]);
            $this->error('❌ Erreur sauvegarde : ' . $e->getMessage());
            return 1;
        }
    }

    private function runPgDump(BackupSetting $settings, string $gzPath): void
    {
        $conn = config('database.connections.' . config('database.default'));
        $host = $conn['host']     ?? '127.0.0.1';
        $port = $conn['port']     ?? 5432;
        $db   = $conn['database'] ?? '';
        $user = $conn['username'] ?? '';
        $pass = $conn['password'] ?? '';

        $pgDump = $this->findPgDump($settings);

        $env = array_merge(getenv() ?: [], ['PGPASSWORD' => $pass]);

        $cmd  = [$pgDump, '-h', $host, '-p', (string) $port, '-U', $user, $db];
        $desc = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $proc = proc_open($cmd, $desc, $pipes, null, $env);
        if (!is_resource($proc)) {
            throw new \RuntimeException('Impossible de lancer pg_dump.');
        }

        fclose($pipes[0]);

        $gz = gzopen($gzPath, 'wb9');
        while (!feof($pipes[1])) {
            $chunk = fread($pipes[1], 65536);
            if ($chunk !== false && $chunk !== '') {
                gzwrite($gz, $chunk);
            }
        }
        gzclose($gz);

        $stderr   = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($proc);

        if ($exitCode !== 0) {
            @unlink($gzPath);
            throw new \RuntimeException("pg_dump a échoué (code $exitCode) : $stderr");
        }
    }

    private function findPgDump(BackupSetting $settings): string
    {
        if ($settings->pg_dump_path && is_executable($settings->pg_dump_path)) {
            return $settings->pg_dump_path;
        }

        $candidates = PHP_OS_FAMILY === 'Windows' ? [
            'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
            'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
            'C:\\xampp\\pgsql\\bin\\pg_dump.exe',
        ] : [
            '/usr/bin/pg_dump',
            '/usr/local/bin/pg_dump',
            '/opt/homebrew/bin/pg_dump',
        ];

        foreach ($candidates as $path) {
            if (is_executable($path)) return $path;
        }

        // Essai via PATH système
        $where = PHP_OS_FAMILY === 'Windows' ? 'where pg_dump' : 'which pg_dump';
        exec($where . ' 2>/dev/null', $out, $code);
        if ($code === 0 && !empty($out)) {
            return trim($out[0]);
        }

        throw new \RuntimeException(
            'pg_dump introuvable. Configurez son chemin dans les paramètres de sauvegarde.'
        );
    }

    private function applyRetention(BackupSetting $settings, string $dir): void
    {
        $keep  = max(1, $settings->retention_count);
        $files = glob($dir . DIRECTORY_SEPARATOR . 'backup_*.sql.gz') ?: [];
        rsort($files); // du plus récent au plus ancien

        foreach (array_slice($files, $keep) as $old) {
            @unlink($old);
            // Supprimer aussi le log si on veut (optionnel)
        }

        // Purger les logs sans fichier au-delà de la rétention
        BackupLog::where('status', 'success')
            ->orderByDesc('created_at')
            ->skip($keep)
            ->take(9999)
            ->get()
            ->each(fn ($l) => $l->delete());
    }

    private function humanSize(int $bytes): string
    {
        if ($bytes >= 1_073_741_824) return round($bytes / 1_073_741_824, 2) . ' GB';
        if ($bytes >= 1_048_576)     return round($bytes / 1_048_576, 2)     . ' MB';
        return round($bytes / 1024, 2) . ' KB';
    }
}
