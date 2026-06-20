<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── order_items : product_id nullable + restaurant_item_id ──────────
        Schema::table('order_items', function (Blueprint $table) {
            // Supprimer la contrainte FK avant de modifier la colonne
            $table->dropForeign(['product_id']);
            // Rendre nullable (Blueprint cross-database)
            $table->unsignedBigInteger('product_id')->nullable()->change();
            // Remettre la FK avec nullOnDelete
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
        });

        if (!Schema::hasColumn('order_items', 'restaurant_item_id')) {
            Schema::table('order_items', function (Blueprint $table) {
                $table->foreignId('restaurant_item_id')
                      ->nullable()
                      ->after('product_id')
                      ->constrained('restaurant_items')
                      ->nullOnDelete();
            });
        }

        // ── recipe_ingredients : product_id nullable + restaurant_item_id ───
        Schema::table('recipe_ingredients', function (Blueprint $table) {
            $table->dropUnique(['product_id', 'ingredient_id']);
            $table->dropForeign(['product_id']);
            $table->unsignedBigInteger('product_id')->nullable()->change();
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
        });

        if (!Schema::hasColumn('recipe_ingredients', 'restaurant_item_id')) {
            Schema::table('recipe_ingredients', function (Blueprint $table) {
                $table->foreignId('restaurant_item_id')
                      ->nullable()
                      ->after('product_id')
                      ->constrained('restaurant_items')
                      ->nullOnDelete();
                $table->unique(['restaurant_item_id', 'ingredient_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('recipe_ingredients', function (Blueprint $table) {
            $table->dropUnique(['restaurant_item_id', 'ingredient_id']);
            $table->dropForeign(['restaurant_item_id']);
            $table->dropColumn('restaurant_item_id');
            $table->dropForeign(['product_id']);
            $table->unsignedBigInteger('product_id')->nullable(false)->change();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->unique(['product_id', 'ingredient_id']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['restaurant_item_id']);
            $table->dropColumn('restaurant_item_id');
            $table->dropForeign(['product_id']);
            $table->unsignedBigInteger('product_id')->nullable(false)->change();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });
    }
};
