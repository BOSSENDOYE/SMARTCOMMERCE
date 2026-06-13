<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Plan comptable (Chart of Accounts) — SYSCOHADA
        Schema::create('accounting_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name');
            $table->enum('class', ['1', '2', '3', '4', '5', '6', '7']);
            $table->enum('nature', ['actif', 'passif', 'charge', 'produit', 'tresorerie']);
            $table->boolean('is_system')->default(false);   // protégé, non supprimable
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['store_id', 'code']);
        });

        // Pièces comptables (Journal entries header)
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('reference', 50);
            $table->date('entry_date');
            $table->string('description');
            $table->enum('type', ['vente', 'achat', 'paiement', 'charge', 'ajustement', 'perte', 'autre']);
            $table->unsignedBigInteger('source_id')->nullable();    // sale_id, invoice_id…
            $table->string('source_type', 50)->nullable();          // 'sale', 'supplier_invoice'…
            $table->enum('status', ['brouillon', 'valide'])->default('brouillon');
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('validated_by')->nullable()->constrained('users');
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
            $table->unique(['store_id', 'reference']);
            $table->index(['store_id', 'entry_date']);
            $table->index(['source_type', 'source_id']);
        });

        // Lignes d'écriture (Debit / Credit lines)
        Schema::create('journal_entry_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounting_accounts');
            $table->string('label');
            $table->decimal('debit', 15, 2)->default(0);
            $table->decimal('credit', 15, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entry_lines');
        Schema::dropIfExists('journal_entries');
        Schema::dropIfExists('accounting_accounts');
    }
};
