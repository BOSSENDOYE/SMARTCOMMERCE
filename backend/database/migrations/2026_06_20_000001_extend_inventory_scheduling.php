<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── inventory_sessions : scheduling fields ────────────────────────────
        Schema::table('inventory_sessions', function (Blueprint $table) {
            $table->timestamp('scheduled_at')->nullable()->after('status');
            $table->string('sales_mode', 20)->default('normal')->after('scheduled_at'); // normal | blocked
            $table->unsignedSmallInteger('remind_before_minutes')->nullable()->after('sales_mode');
            $table->timestamp('reminder_sent_at')->nullable()->after('remind_before_minutes');
        });

        // Add 'scheduled' to inventory_sessions status CHECK (PostgreSQL)
        DB::statement("ALTER TABLE inventory_sessions DROP CONSTRAINT IF EXISTS inventory_sessions_status_check");
        DB::statement("ALTER TABLE inventory_sessions ADD CONSTRAINT inventory_sessions_status_check
            CHECK (status::text = ANY(ARRAY['scheduled','draft','counting','validating','pending','completed','cancelled']))");

        // ── inventory_sheets : assignment + counting status ───────────────────
        Schema::table('inventory_sheets', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->after('section_id')
                  ->constrained('users')->nullOnDelete();
        });

        // Add 'counting' and 'cancelled' to inventory_sheets status CHECK
        DB::statement("ALTER TABLE inventory_sheets DROP CONSTRAINT IF EXISTS inventory_sheets_status_check");
        DB::statement("ALTER TABLE inventory_sheets ADD CONSTRAINT inventory_sheets_status_check
            CHECK (status::text = ANY(ARRAY['draft','counting','validated','cancelled']))");
    }

    public function down(): void
    {
        Schema::table('inventory_sheets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_to');
        });

        DB::statement("ALTER TABLE inventory_sheets DROP CONSTRAINT IF EXISTS inventory_sheets_status_check");
        DB::statement("ALTER TABLE inventory_sheets ADD CONSTRAINT inventory_sheets_status_check
            CHECK (status::text = ANY(ARRAY['draft','validated']))");

        Schema::table('inventory_sessions', function (Blueprint $table) {
            $table->dropColumn(['scheduled_at', 'sales_mode', 'remind_before_minutes', 'reminder_sent_at']);
        });

        DB::statement("ALTER TABLE inventory_sessions DROP CONSTRAINT IF EXISTS inventory_sessions_status_check");
        DB::statement("ALTER TABLE inventory_sessions ADD CONSTRAINT inventory_sessions_status_check
            CHECK (status::text = ANY(ARRAY['draft','counting','validating','pending','completed','cancelled']))");
    }
};
