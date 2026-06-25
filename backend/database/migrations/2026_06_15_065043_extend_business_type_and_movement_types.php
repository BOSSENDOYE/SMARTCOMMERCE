<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Convertit stores.business_type de ENUM figé en varchar(50) extensible.
 * Permet d'ajouter de nouveaux types de commerce sans migration DDL.
 */
return new class extends Migration
{
    public function up(): void
    {
        // SQLite stocke déjà tout en varchar — MODIFY COLUMN n'existe pas.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type VARCHAR(50) NOT NULL DEFAULT 'grande_surface'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type ENUM('grande_surface','restaurant','depot','mixte') NOT NULL DEFAULT 'grande_surface'");
        }
    }
};
