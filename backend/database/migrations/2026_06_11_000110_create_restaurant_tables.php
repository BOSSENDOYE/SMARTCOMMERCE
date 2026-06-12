<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dining_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 100);
            $table->enum('type', ['indoor', 'terrace', 'vip', 'bar', 'takeaway'])->default('indoor');
            $table->string('color', 20)->default('#4CAF50');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('area_id')->constrained('dining_areas')->cascadeOnDelete();
            $table->string('number', 20);
            $table->integer('seats')->default(4);
            $table->enum('status', ['free', 'occupied', 'ordered', 'served', 'bill_requested', 'cleaning'])->default('free');
            $table->integer('pos_x')->default(0);
            $table->integer('pos_y')->default(0);
            $table->string('shape', 20)->default('rectangle');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('table_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('table_id')->constrained('tables')->cascadeOnDelete();
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->integer('covers')->default(1);
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('production_stations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 100);
            $table->enum('type', ['hot', 'cold', 'bar', 'pizza', 'pastry', 'other'])->default('other');
            $table->boolean('uses_kds')->default(true);
            $table->boolean('prints_tickets')->default(false);
            $table->integer('alert_time_minutes')->default(15);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('table_session_id')->nullable()->constrained('table_sessions')->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 50)->unique();
            $table->enum('status', ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'])->default('pending');
            $table->enum('channel', ['dine_in', 'takeaway', 'delivery'])->default('dine_in');
            $table->string('client_name', 100)->nullable();
            $table->string('client_phone', 30)->nullable();
            $table->integer('covers')->default(1);
            $table->text('notes')->nullable();
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->timestamps();

            $table->index(['store_id', 'status']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('station_id')->nullable()->constrained('production_stations')->nullOnDelete();
            $table->decimal('qty', 8, 2)->default(1);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('total', 15, 2)->storedAs('qty * unit_price');
            $table->enum('course', ['starter', 'main', 'dessert', 'drink', 'other'])->default('main');
            $table->enum('status', ['pending', 'preparing', 'ready', 'served', 'cancelled'])->default('pending');
            $table->integer('cover_number')->nullable();
            $table->json('options')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('prepared_at')->nullable();
            $table->timestamp('served_at')->nullable();
            $table->timestamps();
        });

        Schema::create('recipe_ingredients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->decimal('quantity', 12, 4);
            $table->boolean('is_optional')->default(false);
            $table->timestamps();

            $table->unique(['product_id', 'ingredient_id']);
        });

        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->string('client_name', 100);
            $table->string('client_phone', 30)->nullable();
            $table->date('reservation_date');
            $table->time('reservation_time');
            $table->integer('covers');
            $table->enum('status', ['pending', 'confirmed', 'arrived', 'no_show', 'cancelled'])->default('pending');
            $table->text('special_requests')->nullable();
            $table->boolean('reminder_sent')->default(false);
            $table->timestamps();

            $table->index(['store_id', 'reservation_date']);
        });

        Schema::create('delivery_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('delivery_address')->nullable();
            $table->decimal('delivery_fee', 15, 2)->default(0);
            $table->enum('status', ['pending', 'assigned', 'picked_up', 'delivering', 'delivered', 'failed'])->default('pending');
            $table->string('estimated_time', 20)->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_orders');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('recipe_ingredients');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('production_stations');
        Schema::dropIfExists('table_sessions');
        Schema::dropIfExists('tables');
        Schema::dropIfExists('dining_areas');
    }
};
