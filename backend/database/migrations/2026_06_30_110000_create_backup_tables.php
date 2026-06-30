<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backup_settings', function (Blueprint $table) {
            $table->id();
            $table->enum('schedule', ['never', 'daily', 'weekly', 'monthly'])->default('daily');
            $table->string('schedule_time', 5)->default('02:00');
            $table->tinyInteger('schedule_day')->default(1); // weekday(1=Mon) or day of month
            $table->integer('retention_count')->default(7);
            $table->boolean('drive_enabled')->default(false);
            $table->string('drive_folder_id')->nullable();
            $table->text('drive_credentials')->nullable(); // encrypted service account JSON
            $table->string('pg_dump_path')->nullable();    // auto-detected if null
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
        });

        Schema::create('backup_logs', function (Blueprint $table) {
            $table->id();
            $table->string('filename', 500);
            $table->bigInteger('size_bytes')->nullable();
            $table->enum('status', ['running', 'success', 'failed'])->default('running');
            $table->json('destinations')->nullable(); // ['local','drive']
            $table->text('error_message')->nullable();
            $table->integer('duration_seconds')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backup_logs');
        Schema::dropIfExists('backup_settings');
    }
};
