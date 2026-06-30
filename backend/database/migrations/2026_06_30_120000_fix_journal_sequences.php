<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Reset all sequences — covers journal_entry_lines and any other table
        // whose sequence fell behind after the previous global fix was run.
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
                        NULL;
                    END;
                END LOOP;
            END $$;
        SQL);
    }

    public function down(): void {}
};
