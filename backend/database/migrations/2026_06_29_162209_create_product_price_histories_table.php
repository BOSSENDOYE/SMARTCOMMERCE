<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_price_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('old_price_ttc', 12, 2)->default(0);
            $table->decimal('new_price_ttc', 12, 2)->default(0);
            $table->decimal('old_purchase_price', 12, 2)->nullable();
            $table->decimal('new_purchase_price', 12, 2)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_price_histories');
    }
};
