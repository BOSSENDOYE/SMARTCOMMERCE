<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fixed_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('asset_account_id')->constrained('accounting_accounts');
            $table->foreignId('depreciation_account_id')->constrained('accounting_accounts');
            $table->foreignId('accumulated_account_id')->constrained('accounting_accounts');
            $table->string('reference', 30)->unique();
            $table->string('name', 200);
            $table->text('description')->nullable();
            $table->date('acquisition_date');
            $table->decimal('acquisition_cost', 15, 2);
            $table->decimal('residual_value', 15, 2)->default(0);
            $table->string('depreciation_method', 20)->default('linear'); // linear|declining
            $table->tinyInteger('useful_life_years')->unsigned();
            $table->smallInteger('useful_life_months')->unsigned();
            $table->string('status', 20)->default('active'); // active|fully_depreciated|sold|scrapped
            $table->date('sold_at')->nullable();
            $table->date('scrapped_at')->nullable();
            $table->decimal('sale_price', 15, 2)->nullable();
            $table->decimal('gain_loss', 15, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'status']);
            $table->index(['store_id', 'acquisition_date']);
        });

        Schema::create('fixed_asset_depreciations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fixed_asset_id')->constrained()->cascadeOnDelete();
            $table->foreignId('journal_entry_id')->nullable()->constrained()->nullOnDelete();
            $table->smallInteger('period_year')->unsigned();
            $table->tinyInteger('period_month')->unsigned(); // 1-12
            $table->date('depreciation_date');
            $table->decimal('amount', 15, 2);
            $table->decimal('accumulated', 15, 2);
            $table->decimal('net_book_value', 15, 2);
            $table->boolean('posted')->default(false);
            $table->timestamps();

            $table->unique(['fixed_asset_id', 'period_year', 'period_month']);
            $table->index(['fixed_asset_id', 'posted']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fixed_asset_depreciations');
        Schema::dropIfExists('fixed_assets');
    }
};
