<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('original_sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 50)->unique();
            $table->enum('type', ['refund', 'voucher', 'exchange'])->default('refund');
            $table->boolean('has_ticket')->default(true);
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->text('reason')->nullable();
            $table->timestamps();
        });

        Schema::create('return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_id')->constrained('returns')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();
            $table->decimal('qty', 12, 3);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('total', 15, 2)->storedAs('qty * unit_price');
            $table->enum('condition', ['good', 'damaged', 'expired'])->default('good');
            $table->boolean('restock')->default(true);
            $table->timestamps();
        });

        Schema::create('losses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('lot_id')->nullable()->constrained('product_lots')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('validator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 50)->unique();
            $table->enum('type', ['breakage', 'expiry', 'theft', 'internal_use', 'commercial_gesture', 'other'])->default('other');
            $table->decimal('qty', 12, 3);
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('total_cost', 15, 2)->storedAs('qty * unit_cost');
            $table->string('notes', 500)->nullable();
            $table->string('photo', 255)->nullable();
            $table->enum('status', ['pending', 'validated', 'rejected'])->default('pending');
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('store_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('from_store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('to_store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 50)->unique();
            $table->enum('status', ['draft', 'sent', 'in_transit', 'received', 'partial', 'cancelled'])->default('draft');
            $table->text('notes')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();
        });

        Schema::create('store_transfer_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transfer_id')->constrained('store_transfers')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('lot_id')->nullable()->constrained('product_lots')->nullOnDelete();
            $table->decimal('qty_sent', 12, 3);
            $table->decimal('qty_received', 12, 3)->nullable();
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_transfer_items');
        Schema::dropIfExists('store_transfers');
        Schema::dropIfExists('losses');
        Schema::dropIfExists('return_items');
        Schema::dropIfExists('returns');
    }
};
