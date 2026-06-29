<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Skip if constraint already exists (idempotent)
        $exists = \Illuminate\Support\Facades\DB::select(
            "SELECT 1 FROM pg_constraint WHERE conname = 'organizations_name_unique'"
        );
        if ($exists) return;

        Schema::table('organizations', function (Blueprint $table) {
            $table->unique('name', 'organizations_name_unique');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropUnique('organizations_name_unique');
        });
    }
};
