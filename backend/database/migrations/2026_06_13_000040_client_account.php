<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add account_balance column to clients
        // Positive = avoir (client has money with us)
        // Negative = dette (client owes us)
        Schema::table('clients', function (Blueprint $table) {
            $table->decimal('account_balance', 15, 2)->default(0)->after('credit_balance');
        });

        // Full transaction audit trail
        Schema::create('client_account_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // deposit | withdrawal | sale_debit | change_deposit | sale_refund | adjustment
            $table->string('type', 50);
            $table->decimal('amount', 15, 2);         // always positive absolute value
            $table->decimal('balance_before', 15, 2);
            $table->decimal('balance_after', 15, 2);
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_account_transactions');
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('account_balance');
        });
    }
};
