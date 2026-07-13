<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('name', 150);
            $table->smallInteger('year')->unsigned();
            $table->string('period_type', 20)->default('monthly'); // monthly|quarterly|annual
            $table->string('status', 20)->default('draft');        // draft|active|closed
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['store_id', 'name', 'year']);
            $table->index(['store_id', 'year', 'status']);
        });

        Schema::create('budget_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('budget_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounting_accounts');
            $table->tinyInteger('month')->unsigned()->nullable();   // 1-12 (null si annual/quarterly)
            $table->tinyInteger('quarter')->unsigned()->nullable(); // 1-4 (null si annual/monthly)
            $table->decimal('amount', 15, 2)->default(0);
            $table->timestamps();

            $table->unique(['budget_id', 'account_id', 'month', 'quarter']);
            $table->index(['budget_id', 'account_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('budget_lines');
        Schema::dropIfExists('budgets');
    }
};
