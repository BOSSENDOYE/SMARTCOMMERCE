<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('print_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->enum('document_type', ['receipt', 'invoice', 'delivery_note', 'purchase_order', 'label']);
            $table->string('name', 100);
            $table->json('config');          // All layout/typography/content options
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // Only one default per store+type
            $table->unique(['store_id', 'document_type', 'is_default'], 'unique_default_per_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_templates');
    }
};
