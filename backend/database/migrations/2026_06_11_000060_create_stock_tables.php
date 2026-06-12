<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_lots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('lot_number', 50);
            $table->date('manufacture_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->decimal('initial_qty', 12, 3)->default(0);
            $table->decimal('current_qty', 12, 3)->default(0);
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['store_id', 'product_id', 'lot_number']);
            $table->index('expiry_date');
        });

        Schema::create('stock_levels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty_on_hand', 12, 3)->default(0);
            $table->decimal('qty_reserved', 12, 3)->default(0);
            $table->decimal('qty_on_order', 12, 3)->default(0);
            $table->decimal('avg_cost', 15, 2)->default(0);
            $table->decimal('total_value', 15, 2)->storedAs('qty_on_hand * avg_cost');
            $table->timestamp('last_updated')->nullable();

            $table->unique(['store_id', 'product_id']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('lot_id')->nullable()->constrained('product_lots')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('type', [
                'purchase_in', 'sale_out', 'return_in', 'return_out',
                'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out',
                'loss', 'kitchen_consumption', 'inventory_adjustment', 'opening'
            ]);
            $table->decimal('qty', 12, 3);
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('total_cost', 15, 2)->storedAs('qty * unit_cost');
            $table->decimal('stock_after', 12, 3)->default(0);
            $table->string('reference_type', 50)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('reason', 100)->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();
            // Immutable — no updated_at

            $table->index(['store_id', 'product_id', 'created_at']);
            $table->index(['reference_type', 'reference_id']);
        });

        Schema::create('inventory_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('started_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('type', ['full', 'rotating'])->default('full');
            $table->enum('status', ['draft', 'counting', 'validating', 'completed', 'cancelled'])->default('draft');
            $table->string('name', 100)->nullable();
            $table->boolean('freeze_movements')->default(false);
            $table->decimal('total_variance_value', 15, 2)->nullable();
            $table->decimal('shrinkage_rate_pct', 7, 4)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('inventory_session_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('inventory_sessions')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('theoretical_qty', 12, 3)->default(0);
            $table->decimal('counted_qty', 12, 3)->nullable();
            $table->decimal('variance', 12, 3)->storedAs('CASE WHEN counted_qty IS NOT NULL THEN counted_qty - theoretical_qty ELSE NULL END')->nullable();
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('variance_value', 15, 2)->nullable();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();

            $table->unique(['session_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_session_items');
        Schema::dropIfExists('inventory_sessions');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_levels');
        Schema::dropIfExists('product_lots');
    }
};
