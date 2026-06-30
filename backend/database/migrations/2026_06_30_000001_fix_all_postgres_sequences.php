<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Reset every auto-increment sequence to MAX(id) so inserts never
        // collide with rows that were created with explicit IDs (seeds/imports).
        DB::statement(<<<'SQL'
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_type   = 'BASE TABLE'
                LOOP
                    BEGIN
                        EXECUTE format(
                            'SELECT setval(pg_get_serial_sequence(%L, %L),
                                          COALESCE(MAX(id), 0) + 1, false)
                             FROM %I',
                            r.table_name, 'id', r.table_name
                        );
                    EXCEPTION WHEN others THEN
                        NULL;  -- table has no id sequence, skip silently
                    END;
                END LOOP;
            END $$;
        SQL);
    }

    public function down(): void {}
};
