<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL ne crée pas d'index automatiquement sur les FK (contrairement à MySQL).
        // Ces index accélèrent les jointures et les eager loads les plus fréquents.

        Schema::table('sale_items', function (Blueprint $table) {
            $table->index('sale_id');
            $table->index('product_id');
        });

        Schema::table('sale_payments', function (Blueprint $table) {
            $table->index('sale_id');
        });

        Schema::table('product_barcodes', function (Blueprint $table) {
            $table->index('product_id');
        });

        // Index composite pour la requête produits la plus courante :
        // WHERE store_id = ? AND is_active = ? ORDER BY name
        Schema::table('products', function (Blueprint $table) {
            $table->index(['store_id', 'is_active', 'name']);
        });

        // Achats : store + status + date
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->index(['store_id', 'status']);
            $table->index('supplier_id');
        });

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->index('purchase_order_id');
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropIndex(['sale_id']);
            $table->dropIndex(['product_id']);
        });

        Schema::table('sale_payments', function (Blueprint $table) {
            $table->dropIndex(['sale_id']);
        });

        Schema::table('product_barcodes', function (Blueprint $table) {
            $table->dropIndex(['product_id']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'is_active', 'name']);
        });

        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'status']);
            $table->dropIndex(['supplier_id']);
        });

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropIndex(['purchase_order_id']);
            $table->dropIndex(['product_id']);
        });
    }
};
