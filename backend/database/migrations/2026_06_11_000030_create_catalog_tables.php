<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name');
            $table->string('slug', 100)->unique();
            $table->enum('type', ['common', 'grande_surface', 'restaurant'])->default('common');
            $table->string('color', 20)->nullable();
            $table->string('icon', 50)->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('abbreviation', 10);
            $table->boolean('is_weight_unit')->default(false);
            $table->timestamps();
        });

        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('logo')->nullable();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->string('internal_code', 50)->unique();
            $table->string('name');
            $table->string('short_name', 60)->nullable();
            $table->text('description')->nullable();
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->decimal('purchase_price_ht', 15, 2)->default(0);
            $table->decimal('sale_price_ttc', 15, 2)->default(0);
            $table->decimal('vat_rate', 5, 2)->default(18.00);
            $table->decimal('margin_pct', 7, 2)->storedAs(
                'CASE WHEN purchase_price_ht > 0 THEN ROUND((sale_price_ttc / 1.18 - purchase_price_ht) / purchase_price_ht * 100, 2) ELSE 0 END'
            )->nullable();
            $table->boolean('is_weight_based')->default(false);
            $table->decimal('price_per_kg', 15, 2)->nullable();
            $table->decimal('min_stock', 12, 3)->default(0);
            $table->decimal('max_stock', 12, 3)->default(0);
            $table->decimal('alert_stock', 12, 3)->default(0);
            $table->integer('packaging_qty')->default(1);
            $table->string('packaging_type', 30)->nullable();
            $table->string('image')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('track_expiry')->default(false);
            $table->boolean('is_recipe')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'is_active']);
            $table->index('category_id');
        });

        Schema::create('product_barcodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('barcode', 50);
            $table->enum('type', ['ean13', 'ean8', 'internal', 'weight_variable'])->default('ean13');
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->unique(['barcode', 'type']);
        });

        Schema::create('product_price_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('old_price_ttc', 15, 2);
            $table->decimal('new_price_ttc', 15, 2);
            $table->decimal('old_purchase_price', 15, 2)->nullable();
            $table->decimal('new_purchase_price', 15, 2)->nullable();
            $table->string('reason', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_price_history');
        Schema::dropIfExists('product_barcodes');
        Schema::dropIfExists('products');
        Schema::dropIfExists('brands');
        Schema::dropIfExists('units');
        Schema::dropIfExists('categories');
    }
};
