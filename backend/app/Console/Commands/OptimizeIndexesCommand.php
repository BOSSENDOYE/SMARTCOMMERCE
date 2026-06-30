<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class OptimizeIndexesCommand extends Command
{
    protected $signature   = 'db:optimize-indexes {--dry-run : Afficher sans créer}';
    protected $description = 'Analyser les tables PostgreSQL et créer les index manquants automatiquement';

    // Colonnes ciblées en priorité
    private array $singleColumns = [
        'store_id', 'organization_id', 'client_id', 'product_id',
        'user_id', 'supplier_id', 'created_at', 'status', 'deleted_at',
    ];

    // Index composites fréquents
    private array $compositeIndexes = [
        ['clients',      ['store_id', 'is_active']],
        ['clients',      ['store_id', 'deleted_at']],
        ['products',     ['store_id', 'deleted_at']],
        ['stock_levels', ['store_id', 'product_id']],
        ['sales',        ['store_id', 'created_at']],
        ['sales',        ['store_id', 'status']],
        ['sale_items',   ['sale_id', 'product_id']],
        ['invoices',     ['store_id', 'status']],
        ['invoices',     ['client_id', 'status']],
        ['purchases',    ['store_id', 'created_at']],
        ['expenses',     ['store_id', 'created_at']],
    ];

    public function handle(): int
    {
        $dry     = (bool) $this->option('dry-run');
        $created = 0;
        $skipped = 0;

        $this->info($dry ? '🔍 Mode aperçu (aucun index créé)' : '⚡ Optimisation des index en cours…');

        // ── Tables à fort taux de seq_scan ───────────────────────────────────
        $tables = DB::select("
            SELECT relname AS tablename, seq_scan, idx_scan, n_live_tup AS rows
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            AND n_live_tup > 50
            ORDER BY seq_scan DESC
            LIMIT 50
        ");

        foreach ($tables as $tbl) {
            $name    = $tbl->tablename;
            $columns = Schema::hasTable($name) ? Schema::getColumnListing($name) : [];

            foreach ($this->singleColumns as $col) {
                if (!in_array($col, $columns, true)) continue;
                if ($this->indexExists($name, $col)) { $skipped++; continue; }

                $idxName = "{$name}_{$col}_idx";
                if ($dry) {
                    $this->line("  → CREATE INDEX $idxName ON $name ($col)");
                } else {
                    DB::statement("CREATE INDEX CONCURRENTLY IF NOT EXISTS $idxName ON $name ($col)");
                    $this->line("  ✓ $idxName");
                    $created++;
                }
            }
        }

        // ── Index composites ─────────────────────────────────────────────────
        foreach ($this->compositeIndexes as [$tbl, $cols]) {
            if (!Schema::hasTable($tbl)) continue;
            $existingCols = Schema::getColumnListing($tbl);
            if (count(array_diff($cols, $existingCols)) > 0) continue;

            $idxName = $tbl . '_' . implode('_', $cols) . '_idx';
            if ($this->indexNameExists($tbl, $idxName)) { $skipped++; continue; }

            $colList = implode(', ', $cols);
            if ($dry) {
                $this->line("  → CREATE INDEX $idxName ON $tbl ($colList)");
            } else {
                DB::statement("CREATE INDEX CONCURRENTLY IF NOT EXISTS $idxName ON $tbl ($colList)");
                $this->line("  ✓ $idxName (composite)");
                $created++;
            }
        }

        $this->info("✅ Terminé — créés : $created | déjà présents : $skipped");
        return 0;
    }

    private function indexExists(string $table, string $column): bool
    {
        $result = DB::select("
            SELECT 1 FROM pg_indexes
            WHERE tablename = ? AND indexdef ILIKE ?
            LIMIT 1
        ", [$table, "%($column)%"]);
        return !empty($result);
    }

    private function indexNameExists(string $table, string $indexName): bool
    {
        $result = DB::select("
            SELECT 1 FROM pg_indexes
            WHERE tablename = ? AND indexname = ?
            LIMIT 1
        ", [$table, $indexName]);
        return !empty($result);
    }
}
