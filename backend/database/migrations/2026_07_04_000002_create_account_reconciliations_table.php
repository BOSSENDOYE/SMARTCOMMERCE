<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_reconciliations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounting_accounts');
            $table->foreignId('lettered_by')->constrained('users');
            $table->string('reference', 30);
            $table->timestamp('lettered_at');
            $table->decimal('amount_debit', 15, 2)->default(0);
            $table->decimal('amount_credit', 15, 2)->default(0);
            $table->decimal('difference', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'account_id']);
            $table->index(['store_id', 'reference']);
        });

        // Ajouter la colonne de lettrage sur les lignes d'écriture
        Schema::table('journal_entry_lines', function (Blueprint $table) {
            $table->unsignedBigInteger('reconciliation_id')->nullable()->after('credit');
            $table->foreign('reconciliation_id')
                  ->references('id')
                  ->on('account_reconciliations')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('journal_entry_lines', function (Blueprint $table) {
            $table->dropForeign(['reconciliation_id']);
            $table->dropColumn('reconciliation_id');
        });
        Schema::dropIfExists('account_reconciliations');
    }
};
