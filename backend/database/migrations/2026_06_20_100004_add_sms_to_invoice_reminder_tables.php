<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoice_reminder_rules', function (Blueprint $table) {
            $table->boolean('send_sms')->default(false)->after('send_email');
        });

        // PostgreSQL only — SQLite does not support named CHECK constraints via ALTER TABLE
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE invoice_reminder_queue DROP CONSTRAINT IF EXISTS invoice_reminder_queue_channel_check');
            DB::statement("ALTER TABLE invoice_reminder_queue ADD CONSTRAINT invoice_reminder_queue_channel_check CHECK (channel IN ('whatsapp', 'sms', 'email'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE invoice_reminder_queue DROP CONSTRAINT IF EXISTS invoice_reminder_queue_channel_check');
            DB::statement("ALTER TABLE invoice_reminder_queue ADD CONSTRAINT invoice_reminder_queue_channel_check CHECK (channel IN ('whatsapp', 'email'))");
        }

        Schema::table('invoice_reminder_rules', function (Blueprint $table) {
            $table->dropColumn('send_sms');
        });
    }
};
