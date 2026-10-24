<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Boulangerie — opérations quotidiennes :
 *  - production_plans       : plan de production par jour (fournées prévues par produit)
 *  - unsold_reports / lines : clôture des invendus (jeté, don, personnel, recyclé)
 *  - customer_orders / items / payments : commandes clients avec acompte
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('plan_date');
            $table->decimal('planned_batches', 12, 3);
            $table->foreignId('production_order_id')->nullable()->constrained('production_orders')->nullOnDelete();
            $table->timestamps();

            $table->unique(['store_id', 'plan_date', 'product_id']);
        });

        Schema::create('unsold_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 30)->unique();
            $table->date('report_date');
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'report_date']);
        });

        Schema::create('unsold_report_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unsold_report_id')->constrained('unsold_reports')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty', 12, 3);
            $table->string('destination', 20); // waste | donation | staff | recycle
            $table->decimal('unit_cost', 15, 4)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->foreignId('target_product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->decimal('target_qty', 12, 3)->nullable();
            $table->timestamps();
        });

        Schema::create('customer_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 30)->unique();
            $table->string('customer_name', 150);
            $table->string('customer_phone', 30)->nullable();
            $table->dateTime('pickup_at');
            $table->string('status', 20)->default('pending'); // pending | in_production | ready | delivered | cancelled
            $table->decimal('total_ttc', 15, 2)->default(0);
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason', 255)->nullable();
            $table->timestamps();

            $table->index(['store_id', 'pickup_at']);
            $table->index(['store_id', 'status']);
        });

        Schema::create('customer_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_order_id')->constrained('customer_orders')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price_ttc', 15, 2);
            $table->decimal('total_ttc', 15, 2);
            $table->string('details', 500)->nullable(); // inscription, parfum, décoration…
            $table->timestamps();
        });

        Schema::create('customer_order_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_order_id')->constrained('customer_orders')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_sessions')->nullOnDelete();
            $table->string('payment_method', 30);
            $table->decimal('amount', 15, 2); // négatif = remboursement
            $table->string('reference', 100)->nullable();
            $table->timestamp('paid_at')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_order_payments');
        Schema::dropIfExists('customer_order_items');
        Schema::dropIfExists('customer_orders');
        Schema::dropIfExists('unsold_report_lines');
        Schema::dropIfExists('unsold_reports');
        Schema::dropIfExists('production_plans');
    }
};
