<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('support_ticket_messages', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
            $table->foreignId('super_admin_id')->nullable()->constrained('super_admins')->nullOnDelete();
            $table->string('author_name', 100)->nullable();
        });

        Schema::table('support_tickets', function (Blueprint $table) {
            $table->foreignId('assigned_super_admin_id')->nullable()->constrained('super_admins')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('support_ticket_messages', function (Blueprint $table) {
            $table->dropForeign(['super_admin_id']);
            $table->dropColumn(['super_admin_id', 'author_name']);
        });
        Schema::table('support_tickets', function (Blueprint $table) {
            $table->dropForeign(['assigned_super_admin_id']);
            $table->dropColumn('assigned_super_admin_id');
        });
    }
};
