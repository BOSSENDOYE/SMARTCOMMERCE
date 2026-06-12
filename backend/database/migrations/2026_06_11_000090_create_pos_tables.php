<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workstations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 100);
            $table->enum('type', ['pos', 'tablet', 'kds', 'backoffice'])->default('pos');
            $table->string('ip_address', 45)->nullable();
            $table->string('mac_address', 17)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('workstation_id')->nullable()->constrained('workstations')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->decimal('opening_balance', 15, 2)->default(0);
            $table->decimal('closing_balance_expected', 15, 2)->nullable();
            $table->decimal('closing_balance_actual', 15, 2)->nullable();
            $table->decimal('closing_balance_variance', 15, 2)->nullable();
            $table->json('opening_count')->nullable();
            $table->json('closing_count')->nullable();
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status']);
        });

        Schema::create('cash_session_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_session_id')->constrained('cash_sessions')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('type', ['deposit', 'withdrawal', 'expense'])->default('expense');
            $table->decimal('amount', 15, 2);
            $table->string('motive', 200);
            $table->string('receipt_ref', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('workstation_id')->nullable()->constrained('workstations')->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_sessions')->nullOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 50)->unique();
            $table->enum('status', ['draft', 'on_hold', 'completed', 'cancelled', 'refunded'])->default('draft');
            $table->enum('channel', ['pos', 'takeaway', 'delivery', 'online'])->default('pos');
            $table->decimal('subtotal_ht', 15, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('total_ttc', 15, 2)->default(0);
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->decimal('change_amount', 15, 2)->default(0);
            $table->decimal('loyalty_points_earned', 12, 2)->default(0);
            $table->decimal('loyalty_points_used', 12, 2)->default(0);
            $table->string('offline_id', 100)->nullable()->unique();
            $table->boolean('is_synced')->default(true);
            $table->timestamp('synced_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status', 'created_at']);
            $table->index('reference');
        });

        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('lot_id')->nullable()->constrained('product_lots')->nullOnDelete();
            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price_ttc', 15, 2);
            $table->decimal('unit_price_ht', 15, 2);
            $table->decimal('vat_rate', 5, 2)->default(18.00);
            $table->decimal('discount_pct', 5, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('total_ht', 15, 2);
            $table->decimal('total_ttc', 15, 2);
            $table->decimal('cost_price', 15, 2)->default(0);
            $table->decimal('margin_amount', 15, 2)->storedAs('total_ht - (qty * cost_price)');
            $table->json('promotion_applied')->nullable();
            $table->timestamps();
        });

        Schema::create('sale_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->enum('payment_method', [
                'cash', 'card', 'wave', 'orange_money', 'free_money',
                'check', 'credit', 'voucher', 'loyalty_points'
            ])->default('cash');
            $table->decimal('amount', 15, 2);
            $table->string('reference', 100)->nullable();
            $table->string('voucher_code', 50)->nullable();
            $table->boolean('is_confirmed')->default(true);
            $table->timestamps();
        });

        Schema::create('sale_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->enum('type', ['receipt', 'invoice', 'pro_forma'])->default('receipt');
            $table->string('number', 50)->unique();
            $table->string('qr_code', 255)->nullable();
            $table->integer('print_count')->default(0);
            $table->boolean('is_emailed')->default(false);
            $table->boolean('is_whatsapp_sent')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_tickets');
        Schema::dropIfExists('sale_payments');
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('cash_session_movements');
        Schema::dropIfExists('cash_sessions');
        Schema::dropIfExists('workstations');
    }
};
