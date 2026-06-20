<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_reminder_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['before_due', 'on_due', 'after_due', 'fixed_monthly']);
            $table->unsignedSmallInteger('offset_days')->nullable();
            $table->smallInteger('day_of_month')->nullable();
            $table->boolean('send_whatsapp')->default(true);
            $table->boolean('send_email')->default(false);
            $table->text('message_template')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['store_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_reminder_rules');
    }
};
