<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL stores enum as a CHECK constraint named <table>_<column>_check
        // Drop the old constraint and recreate it with account + account_deposit added
        DB::statement('ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_payment_method_check');

        DB::statement("ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_payment_method_check CHECK (payment_method::text = ANY (ARRAY[
            'cash'::text,
            'card'::text,
            'wave'::text,
            'orange_money'::text,
            'free_money'::text,
            'check'::text,
            'credit'::text,
            'voucher'::text,
            'loyalty_points'::text,
            'account'::text,
            'account_deposit'::text
        ]))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_payment_method_check');

        DB::statement("ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_payment_method_check CHECK (payment_method::text = ANY (ARRAY[
            'cash'::text,
            'card'::text,
            'wave'::text,
            'orange_money'::text,
            'free_money'::text,
            'check'::text,
            'credit'::text,
            'voucher'::text,
            'loyalty_points'::text
        ]))");
    }
};
