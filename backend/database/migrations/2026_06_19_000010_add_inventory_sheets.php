<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_sheets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('inventory_sessions')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('type', 20)->default('free'); // 'section' | 'free'
            $table->foreignId('section_id')->nullable()->constrained('store_sections')->nullOnDelete();
            $table->string('status', 20)->default('draft'); // 'draft' | 'validated'
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->timestamps();
        });

        Schema::table('inventory_session_items', function (Blueprint $table) {
            $table->foreignId('sheet_id')->nullable()->after('session_id')
                  ->constrained('inventory_sheets')->nullOnDelete();
            $table->date('new_expiry_date')->nullable()->after('counted_at');
            $table->decimal('new_sale_price', 15, 2)->nullable()->after('new_expiry_date');
            $table->decimal('new_purchase_price', 15, 2)->nullable()->after('new_sale_price');
        });

        // Add 'pending' to inventory_sessions status constraint (PostgreSQL)
        DB::statement("ALTER TABLE inventory_sessions DROP CONSTRAINT IF EXISTS inventory_sessions_status_check");
        DB::statement("ALTER TABLE inventory_sessions ADD CONSTRAINT inventory_sessions_status_check CHECK (status::text = ANY(ARRAY['draft','counting','validating','pending','completed','cancelled']))");
    }

    public function down(): void
    {
        Schema::table('inventory_session_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sheet_id');
            $table->dropColumn(['new_expiry_date', 'new_sale_price', 'new_purchase_price']);
        });

        Schema::dropIfExists('inventory_sheets');

        DB::statement("ALTER TABLE inventory_sessions DROP CONSTRAINT IF EXISTS inventory_sessions_status_check");
        DB::statement("ALTER TABLE inventory_sessions ADD CONSTRAINT inventory_sessions_status_check CHECK (status::text = ANY(ARRAY['draft','counting','validating','completed','cancelled']))");
    }
};
