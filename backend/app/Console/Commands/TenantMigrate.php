<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\TenantManager;
use Illuminate\Console\Command;

class TenantMigrate extends Command
{
    protected $signature   = 'tenant:migrate {--store= : ID du magasin (tous si absent)}';
    protected $description = 'Joue les migrations tenant sur un ou tous les magasins';

    public function handle(TenantManager $tm): int
    {
        $storeId = $this->option('store');

        if ($storeId) {
            $this->migrateSingle((int) $storeId, $tm);
        } else {
            $schemas = $tm->all();
            if (empty($schemas)) {
                $this->warn('Aucun schéma tenant trouvé.');
                return 0;
            }
            foreach ($schemas as $schema) {
                $id = (int) str_replace('tenant_', '', $schema);
                $this->migrateSingle($id, $tm);
            }
        }

        return 0;
    }

    private function migrateSingle(int $storeId, TenantManager $tm): void
    {
        $schema = $tm->schemaName($storeId);
        $this->line("  → Migration {$schema}…");
        $tm->migrate($storeId);
        $this->info("  ✓ {$schema} migré");
    }
}
