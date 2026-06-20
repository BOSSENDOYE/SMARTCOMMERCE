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
        Schema::table('stores', function (Blueprint $table) {
            $table->string('business_type', 50)->default('grande_surface')->change();
        });
    }

    public function down(): void
    {
        // On repasse en string — on ne peut pas revenir à un ENUM de façon portable
        Schema::table('stores', function (Blueprint $table) {
            $table->string('business_type', 50)->default('grande_surface')->change();
        });
    }
};
