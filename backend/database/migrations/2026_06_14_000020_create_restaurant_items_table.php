<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->foreignId('station_id')->nullable()->constrained('production_stations')->nullOnDelete();
            $table->enum('course', ['starter', 'main', 'dessert', 'drink', 'other'])->default('main');
            $table->decimal('price_ht', 15, 2)->default(0);
            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->decimal('price_ttc', 15, 2)->default(0);
            $table->decimal('cost_price', 15, 2)->default(0);
            $table->integer('preparation_time_minutes')->nullable();
            $table->string('image')->nullable();
            $table->boolean('is_available')->default(true);
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'course', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_items');
    }
};
