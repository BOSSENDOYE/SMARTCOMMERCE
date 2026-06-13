<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // store_transfers may already exist — create only if missing
        if (! Schema::hasTable('store_transfers')) {
            Schema::create('store_transfers', function (Blueprint $table) {
                $table->id();
                $table->string('reference', 50)->unique();
                $table->foreignId('from_store_id')->constrained('stores')->cascadeOnDelete();
                $table->foreignId('to_store_id')->constrained('stores')->cascadeOnDelete();
                $table->enum('status', ['draft', 'pending', 'approved', 'rejected', 'shipped', 'received', 'cancelled'])
                      ->default('draft');
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('shipped_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('notes')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamp('validated_at')->nullable();
                $table->timestamp('shipped_at')->nullable();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();

                $table->index(['from_store_id', 'status']);
                $table->index(['to_store_id', 'status']);
            });
        } else {
            // Add missing columns if the table already exists
            Schema::table('store_transfers', function (Blueprint $table) {
                if (! Schema::hasColumn('store_transfers', 'shipped_by')) {
                    $table->foreignId('shipped_by')->nullable()->constrained('users')->nullOnDelete();
                }
                if (! Schema::hasColumn('store_transfers', 'received_by')) {
                    $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                }
                if (! Schema::hasColumn('store_transfers', 'rejection_reason')) {
                    $table->text('rejection_reason')->nullable();
                }
                if (! Schema::hasColumn('store_transfers', 'shipped_at')) {
                    $table->timestamp('shipped_at')->nullable();
                }
                if (! Schema::hasColumn('store_transfers', 'received_at')) {
                    $table->timestamp('received_at')->nullable();
                }
            });
        }

        // store_transfer_items — create only if missing
        if (! Schema::hasTable('store_transfer_items')) {
            Schema::create('store_transfer_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('store_transfer_id')->constrained('store_transfers')->cascadeOnDelete();
                $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
                $table->decimal('qty_requested', 12, 3);
                $table->decimal('qty_approved', 12, 3)->nullable();
                $table->decimal('qty_shipped', 12, 3)->nullable();
                $table->decimal('qty_received', 12, 3)->nullable();
                $table->decimal('unit_cost', 15, 2)->default(0);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique(['store_transfer_id', 'product_id']);
            });
        } else {
            Schema::table('store_transfer_items', function (Blueprint $table) {
                if (! Schema::hasColumn('store_transfer_items', 'qty_approved')) {
                    $table->decimal('qty_approved', 12, 3)->nullable();
                }
                if (! Schema::hasColumn('store_transfer_items', 'notes')) {
                    $table->text('notes')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('store_transfer_items');
        Schema::dropIfExists('store_transfers');
    }
};
