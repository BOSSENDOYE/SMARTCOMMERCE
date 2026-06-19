<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('stores', 'menu_config')) {
            return;
        }

        Schema::table('stores', function (Blueprint $table) {
            $table->json('menu_config')->nullable()->after('receipt_footer');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('menu_config');
        });
    }
};
