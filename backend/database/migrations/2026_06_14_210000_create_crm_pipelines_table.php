<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_pipelines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['store_id', 'is_default']);
        });

        // Add pipeline_id to crm_leads (nullable = backwards compat with existing leads)
        Schema::table('crm_leads', function (Blueprint $table) {
            $table->foreignId('pipeline_id')
                ->nullable()
                ->after('store_id')
                ->constrained('crm_pipelines')
                ->nullOnDelete();

            $table->index('pipeline_id');
        });
    }

    public function down(): void
    {
        Schema::table('crm_leads', function (Blueprint $table) {
            $table->dropForeign(['pipeline_id']);
            $table->dropColumn('pipeline_id');
        });

        Schema::dropIfExists('crm_pipelines');
    }
};
