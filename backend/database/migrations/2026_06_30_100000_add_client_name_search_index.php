<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Functional index on lower(name) for fast ilike prefix searches
        DB::statement('CREATE INDEX IF NOT EXISTS clients_name_lower_idx ON clients (store_id, lower(name))');
        DB::statement('CREATE INDEX IF NOT EXISTS clients_phone_lower_idx ON clients (store_id, lower(phone))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS clients_name_lower_idx');
        DB::statement('DROP INDEX IF EXISTS clients_phone_lower_idx');
    }
};
