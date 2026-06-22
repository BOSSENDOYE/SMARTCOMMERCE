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
<<<<<<< HEAD
        Schema::table('stores', function (Blueprint $table) {
            $table->string('business_type', 50)->default('grande_surface')->change();
        });
=======
        // SQLite stocke déjà tout en varchar — MODIFY COLUMN n'existe pas.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type VARCHAR(50) NOT NULL DEFAULT 'grande_surface'");
        }
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9
    }

    public function down(): void
    {
<<<<<<< HEAD
        // On repasse en string — on ne peut pas revenir à un ENUM de façon portable
        Schema::table('stores', function (Blueprint $table) {
            $table->string('business_type', 50)->default('grande_surface')->change();
        });
=======
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type ENUM('grande_surface','restaurant','depot','mixte') NOT NULL DEFAULT 'grande_surface'");
        }
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9
    }
};
