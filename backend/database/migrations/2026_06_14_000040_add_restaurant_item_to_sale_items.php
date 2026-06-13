<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Make product_id nullable on sale_items (currently NOT NULL FK)
        DB::statement('ALTER TABLE sale_items MODIFY product_id BIGINT UNSIGNED NULL');

        // 2) Add restaurant_item_id nullable FK
        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedBigInteger('restaurant_item_id')->nullable()->after('product_id');
            $table->foreign('restaurant_item_id')
                  ->references('id')->on('restaurant_items')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropForeign(['restaurant_item_id']);
            $table->dropColumn('restaurant_item_id');
        });

        DB::statement('ALTER TABLE sale_items MODIFY product_id BIGINT UNSIGNED NOT NULL');
    }
};
