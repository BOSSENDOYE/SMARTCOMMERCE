<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('code', 20)->nullable();
            $table->string('color', 20)->default('#6366f1');
            $table->string('icon', 50)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['store_id', 'sort_order']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('section_id')
                ->nullable()
                ->constrained('store_sections')
                ->nullOnDelete()
                ->after('category_id');
            $table->string('slot', 100)->nullable()->after('section_id');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['section_id']);
            $table->dropColumn(['section_id', 'slot']);
        });
        Schema::dropIfExists('store_sections');
    }
};
