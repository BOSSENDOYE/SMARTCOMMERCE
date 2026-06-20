<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_reminder_queue', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rule_id')->nullable()->constrained('invoice_reminder_rules')->nullOnDelete();
            $table->enum('channel', ['whatsapp', 'email'])->default('whatsapp');
            $table->string('phone', 30)->nullable();
            $table->string('client_name', 100)->nullable();
            $table->text('message');
            $table->date('scheduled_date');
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('status', ['pending', 'sent', 'skipped'])->default('pending');
            $table->timestamps();

            $table->index(['store_id', 'status']);
            $table->index('invoice_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_reminder_queue');
    }
};
