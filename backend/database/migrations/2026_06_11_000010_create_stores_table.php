<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code', 20)->unique();
            $table->string('address')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('ninea', 30)->nullable();
            $table->string('rc', 30)->nullable();
            $table->string('logo')->nullable();
            $table->boolean('license_grande_surface')->default(false);
            $table->boolean('license_restaurant')->default(false);
            $table->string('currency', 10)->default('XOF');
            $table->string('timezone', 50)->default('Africa/Dakar');
            $table->string('receipt_footer')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_central')->default(false);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->string('pin', 6)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropColumn(['store_id', 'pin', 'is_active', 'last_login_at']);
        });
        Schema::dropIfExists('stores');
    }
};
