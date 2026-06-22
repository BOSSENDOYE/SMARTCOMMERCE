<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['price_gros', 'price_detail', 'price_distributeur']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('price_gros', 12, 2)->nullable()->after('sale_price_ttc');
            $table->decimal('price_detail', 12, 2)->nullable()->after('price_gros');
            $table->decimal('price_distributeur', 12, 2)->nullable()->after('price_detail');
        });
    }
};
