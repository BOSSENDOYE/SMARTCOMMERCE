<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Rendre product_id nullable via Blueprint (cross-database)
        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable()->change();
        });

        if (Schema::hasColumn('sale_items', 'restaurant_item_id')) {
            return;
        }

        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedBigInteger('restaurant_item_id')->nullable()->after('product_id');
            $table->foreign('restaurant_item_id')
                  ->references('id')->on('restaurant_items')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('sale_items', 'restaurant_item_id')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->dropForeign(['restaurant_item_id']);
                $table->dropColumn('restaurant_item_id');
            });
        }

        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable(false)->change();
        });
    }
};
