<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_containers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained()->restrictOnDelete();
            $table->string('label', 100)->nullable();               // "Carton de 5 douzaines"
            $table->decimal('conversion_factor', 15, 4)->default(1); // nb d'unités de base = 1 de ceci
            $table->boolean('is_purchase_unit')->default(false);
            $table->boolean('is_sale_unit')->default(false);
            $table->boolean('is_stock_unit')->default(false);        // unité de base (factor=1)
            $table->decimal('price_a', 15, 2)->nullable();
            $table->decimal('price_b', 15, 2)->nullable();
            $table->decimal('price_c', 15, 2)->nullable();
            $table->string('barcode', 100)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        if (!Schema::hasColumn('products', 'stock_appro')) {
            Schema::table('products', function (Blueprint $table) {
                $table->decimal('stock_appro', 10, 3)->nullable()->after('max_stock');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('product_containers');
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('stock_appro');
        });
    }
};
