<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('stores', 'business_type')) {
            return;
        }

        Schema::table('stores', function (Blueprint $table) {
            $table->enum('business_type', ['grande_surface', 'restaurant', 'depot', 'mixte'])
                  ->default('grande_surface')
                  ->after('code');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('business_type');
        });
    }
};
