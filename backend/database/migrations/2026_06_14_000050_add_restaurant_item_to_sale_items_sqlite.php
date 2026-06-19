<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasColumn('sale_items', 'restaurant_item_id')) {
            return;
        }

        Schema::table('sale_items', function (Blueprint $table) {
            $table->unsignedBigInteger('restaurant_item_id')->nullable()->after('product_id');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('sale_items', 'restaurant_item_id')) {
            return;
        }

        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('restaurant_item_id');
        });
    }
};
