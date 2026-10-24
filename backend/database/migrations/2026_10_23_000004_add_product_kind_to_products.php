<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nature du produit : « finished » (produit fini / revendu) ou « raw_material »
 * (matière première consommée en production : farine, sel, beurre…).
 * Permet de séparer les deux dans le catalogue sans dépendre des catégories.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('product_kind', 20)->default('finished')->after('is_recipe');
            $table->index(['store_id', 'product_kind']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'product_kind']);
            $table->dropColumn('product_kind');
        });
    }
};
