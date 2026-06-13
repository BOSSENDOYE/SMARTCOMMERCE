<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Table organisations ───────────────────────────────────────────
        if (! Schema::hasTable('organizations')) {
            Schema::create('organizations', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->string('code', 30)->unique();        // ex: BAMBA
                $table->string('ninea', 30)->nullable();
                $table->string('rc', 30)->nullable();
                $table->string('address', 255)->nullable();
                $table->string('phone', 30)->nullable();
                $table->string('email', 150)->nullable();
                $table->string('logo', 255)->nullable();
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // ── 2. Rattacher stores à organizations ──────────────────────────────
        if (! Schema::hasColumn('stores', 'organization_id')) {
            Schema::table('stores', function (Blueprint $table) {
                $table->foreignId('organization_id')
                      ->nullable()
                      ->after('id')
                      ->constrained('organizations')
                      ->nullOnDelete();
            });
        }

        // ── 3. Rattacher users à organizations (pour les super-admins) ───────
        if (! Schema::hasColumn('users', 'organization_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('organization_id')
                      ->nullable()
                      ->after('id')
                      ->constrained('organizations')
                      ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'organization_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropForeign(['organization_id']);
                $table->dropColumn('organization_id');
            });
        }
        if (Schema::hasColumn('stores', 'organization_id')) {
            Schema::table('stores', function (Blueprint $table) {
                $table->dropForeign(['organization_id']);
                $table->dropColumn('organization_id');
            });
        }
        Schema::dropIfExists('organizations');
    }
};
