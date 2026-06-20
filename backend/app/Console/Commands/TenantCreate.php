<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\TenantManager;
use Illuminate\Console\Command;

class TenantCreate extends Command
{
    protected $signature   = 'tenant:create {store_id : ID du magasin}';
    protected $description = 'Crée le schéma PostgreSQL et migre les tables pour un magasin';

    public function handle(TenantManager $tm): int
    {
        $storeId = (int) $this->argument('store_id');

        if (!Store::find($storeId)) {
            $this->error("Magasin #{$storeId} introuvable en base.");
            return 1;
        }

        $schema = $tm->schemaName($storeId);
        $this->info("Création du schéma {$schema}…");

        $tm->create($storeId);

        $this->info("✓ Schéma {$schema} prêt.");
        return 0;
    }
}
