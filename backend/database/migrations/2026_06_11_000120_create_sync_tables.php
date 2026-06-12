<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('model_type', 100);
            $table->unsignedBigInteger('model_id')->nullable();
            $table->string('offline_id', 100)->nullable();
            $table->enum('action', ['create', 'update', 'delete'])->default('create');
            $table->json('payload');
            $table->enum('status', ['pending', 'processing', 'synced', 'failed'])->default('pending');
            $table->integer('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['store_id', 'status']);
        });

        Schema::create('sync_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->enum('direction', ['push', 'pull'])->default('push');
            $table->integer('records_synced')->default(0);
            $table->integer('records_failed')->default(0);
            $table->text('errors')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('daily_summaries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->date('summary_date');
            $table->integer('transaction_count')->default(0);
            $table->decimal('total_sales_ttc', 15, 2)->default(0);
            $table->decimal('total_sales_ht', 15, 2)->default(0);
            $table->decimal('total_vat', 15, 2)->default(0);
            $table->decimal('total_discounts', 15, 2)->default(0);
            $table->decimal('total_returns', 15, 2)->default(0);
            $table->decimal('net_sales', 15, 2)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->decimal('gross_margin', 15, 2)->default(0);
            $table->decimal('avg_basket', 15, 2)->default(0);
            $table->json('payment_breakdown')->nullable();
            $table->boolean('is_finalized')->default(false);
            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();

            $table->unique(['store_id', 'summary_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_summaries');
        Schema::dropIfExists('sync_logs');
        Schema::dropIfExists('sync_queue');
    }
};
