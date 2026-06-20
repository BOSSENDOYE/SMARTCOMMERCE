<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;

class TenantManager
{
    public function schemaName(int $storeId): string
    {
        return 'tenant_' . $storeId;
    }

    /** Crée le schéma PostgreSQL pour un magasin et joue ses migrations. */
    public function create(int $storeId): void
    {
        $schema = $this->schemaName($storeId);

        DB::statement("CREATE SCHEMA IF NOT EXISTS {$schema}");
        $this->migrate($storeId);
    }

    /** Joue les migrations tenant sur le schéma du magasin. */
    public function migrate(int $storeId, bool $fresh = false): void
    {
        $schema = $this->schemaName($storeId);

        DB::statement("SET search_path TO {$schema}, public");

        $command = $fresh ? 'migrate:fresh' : 'migrate';

        Artisan::call($command, [
            '--path'     => 'database/migrations/tenant',
            '--realpath' => false,
            '--force'    => true,
        ]);

        // Revenir au schéma public
        DB::statement("SET search_path TO public");
    }

    /** Supprime le schéma d'un magasin (danger — irréversible). */
    public function drop(int $storeId): void
    {
        $schema = $this->schemaName($storeId);
        DB::statement("DROP SCHEMA IF EXISTS {$schema} CASCADE");
    }

    /** Liste tous les schémas tenant existants. */
    public function all(): array
    {
        $rows = DB::select(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name LIKE 'tenant_%'
             ORDER BY schema_name"
        );

        return array_map(fn($r) => $r->schema_name, $rows);
    }
}
