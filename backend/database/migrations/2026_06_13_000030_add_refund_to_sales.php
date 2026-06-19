<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('sales', 'cancellation_reason')) {
            return;
        }

        Schema::table('sales', function (Blueprint $table) {
            $table->text('cancellation_reason')->nullable()->after('notes');
            $table->foreignId('cancelled_by')->nullable()->after('cancellation_reason')
                  ->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by');
            $table->string('refund_method', 50)->nullable()->after('cancelled_at');
            $table->decimal('refund_amount', 15, 2)->nullable()->after('refund_method');
            $table->timestamp('refunded_at')->nullable()->after('refund_amount');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropForeign(['cancelled_by']);
            $table->dropColumn([
                'cancellation_reason', 'cancelled_by', 'cancelled_at',
                'refund_method', 'refund_amount', 'refunded_at',
            ]);
        });
    }
};
