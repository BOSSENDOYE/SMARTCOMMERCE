<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->string('name');
            $table->enum('type', [
                'percentage', 'fixed_amount', 'special_price',
                'buy_x_get_y', 'tiered', 'happy_hour'
            ])->default('percentage');
            $table->decimal('value', 15, 2)->default(0);
            $table->decimal('min_amount', 15, 2)->default(0);
            $table->integer('buy_qty')->nullable();
            $table->integer('get_qty')->nullable();
            $table->json('tiers')->nullable();
            $table->time('happy_hour_start')->nullable();
            $table->time('happy_hour_end')->nullable();
            $table->boolean('stackable')->default(false);
            $table->boolean('applies_to_all')->default(true);
            $table->boolean('loyalty_only')->default(false);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('promotion_products', function (Blueprint $table) {
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->primary(['promotion_id', 'product_id']);
        });

        Schema::create('promotion_categories', function (Blueprint $table) {
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->primary(['promotion_id', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_categories');
        Schema::dropIfExists('promotion_products');
        Schema::dropIfExists('promotions');
    }
};
