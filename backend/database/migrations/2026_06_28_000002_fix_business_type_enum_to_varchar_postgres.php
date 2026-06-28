<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Convertit stores.business_type de ENUM/CHECK à VARCHAR(50) extensible.
     * Compatible PostgreSQL (contrairement à la migration précédente qui utilisait MODIFY COLUMN MySQL).
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            // Supprimer la contrainte CHECK générée par Laravel pour l'ENUM
            DB::statement("ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_business_type_check");
            // Passer à varchar extensible
            DB::statement("ALTER TABLE stores ALTER COLUMN business_type TYPE VARCHAR(50) USING business_type::VARCHAR(50)");
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type VARCHAR(50) NOT NULL DEFAULT 'grande_surface'");
        }
        // SQLite : déjà stocké en texte, rien à faire
    }

    public function down(): void
    {
        // Pas de rollback — on ne revient pas à un ENUM restrictif
    }
};
