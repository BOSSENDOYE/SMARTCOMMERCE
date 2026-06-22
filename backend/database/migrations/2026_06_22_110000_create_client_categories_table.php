<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 60);
            $table->string('code', 20)->nullable();
            $table->string('color', 20)->default('#6366f1');
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->boolean('is_pos_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Seed 3 catégories par défaut (store_id null = partagées)
        DB::table('client_categories')->insert([
            ['name' => 'Gros',      'code' => 'GROS',    'color' => '#3b82f6', 'sort_order' => 1, 'is_pos_default' => false, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Demi-Gros', 'code' => 'DEMI',    'color' => '#8b5cf6', 'sort_order' => 2, 'is_pos_default' => false, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Détail',    'code' => 'DETAIL',  'color' => '#22c55e', 'sort_order' => 3, 'is_pos_default' => true,  'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('client_categories');
    }
};
