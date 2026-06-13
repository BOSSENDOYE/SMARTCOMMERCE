<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Catégories de dépenses ──────────────────────────────────────────────
        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('default_account_code', 20)->nullable(); // code SYSCOHADA ex: "622"
            $table->foreignId('default_charge_account_id')->nullable()
                  ->constrained('accounting_accounts')->nullOnDelete();
            $table->boolean('is_vat_deductible')->default(true);
            $table->string('color', 20)->default('gray');   // couleur badge UI
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['store_id', 'is_active']);
        });

        // ── Dépenses ───────────────────────────────────────────────────────────
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('reference', 30)->unique();

            $table->date('expense_date');
            $table->foreignId('expense_category_id')->nullable()
                  ->constrained('expense_categories')->nullOnDelete();

            // Comptes SYSCOHADA
            $table->foreignId('charge_account_id')->nullable()
                  ->constrained('accounting_accounts')->nullOnDelete();
            $table->foreignId('treasury_account_id')->nullable()
                  ->constrained('accounting_accounts')->nullOnDelete();

            // Descriptif
            $table->string('description', 255);
            $table->string('beneficiary', 150)->nullable(); // qui est payé

            // Montants
            $table->decimal('amount_ht', 15, 2)->default(0);
            $table->decimal('vat_rate',   5, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('amount_ttc', 15, 2)->default(0);

            // Mode de paiement
            $table->string('payment_method', 30)->default('cash');
            // cash | wave | orange_money | free_money | card | virement | cheque

            // Traçabilité
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('journal_entry_id')->nullable()
                  ->constrained('journal_entries')->nullOnDelete();

            // Workflow
            $table->string('status', 20)->default('draft');
            // draft | validated | cancelled

            $table->text('notes')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason', 255)->nullable();

            $table->timestamps();

            $table->index(['store_id', 'expense_date']);
            $table->index(['store_id', 'status']);
            $table->index(['store_id', 'expense_category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_categories');
    }
};
