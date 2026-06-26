<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_payments', function (Blueprint $table) {
            $table->timestamp('paid_at')->nullable()->after('is_confirmed');
            $table->text('notes')->nullable()->after('paid_at');
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete()->after('notes');
        });

        // Étendre la contrainte CHECK pour inclure mobile_money, bank_transfer, other
        if (DB::getDriverName() !== 'sqlite') {
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
                'account_deposit'::text,
                'mobile_money'::text,
                'bank_transfer'::text,
                'other'::text
            ]))");
        }
    }

    public function down(): void
    {
        Schema::table('sale_payments', function (Blueprint $table) {
            $table->dropForeign(['recorded_by']);
            $table->dropColumn(['paid_at', 'notes', 'recorded_by']);
        });

        if (DB::getDriverName() !== 'sqlite') {
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
    }
};
