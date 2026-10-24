<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Convertit stock_movements.type de ENUM figé en VARCHAR(50) extensible.
     * Débloque les types déclarés dans BusinessTypeConfig (production_in,
     * production_consumption, prescription_out, waste_out, expired_out…).
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check");
            DB::statement("ALTER TABLE stock_movements ALTER COLUMN type TYPE VARCHAR(50) USING type::VARCHAR(50)");
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            DB::statement("ALTER TABLE stock_movements MODIFY COLUMN type VARCHAR(50) NOT NULL");
        }
        // SQLite : déjà stocké en texte, rien à faire
    }

    public function down(): void
    {
        // Pas de rollback — on ne revient pas à un ENUM restrictif
    }
};
