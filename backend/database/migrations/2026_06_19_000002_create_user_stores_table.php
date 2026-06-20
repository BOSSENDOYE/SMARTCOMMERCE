<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->unique(['user_id', 'store_id']);
            $table->timestamp('created_at')->useCurrent();
        });

        // Seed existing users into the pivot (their current store_id becomes their only assignment)
        DB::statement('
            INSERT INTO user_stores (user_id, store_id, created_at)
            SELECT id, store_id, NOW()
            FROM users
            WHERE store_id IS NOT NULL
            ON CONFLICT DO NOTHING
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('user_stores');
    }
};
