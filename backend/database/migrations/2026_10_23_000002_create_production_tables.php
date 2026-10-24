<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Production (boulangerie / pâtisserie) :
 *  - products.recipe_yield : quantité de produit fini obtenue pour UNE fournée
 *    (les quantités de recipe_ingredients sont exprimées par fournée)
 *  - production_orders      : une production réalisée (fournées → produits finis)
 *  - production_order_lines : matières premières consommées par la production
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('recipe_yield', 12, 3)->default(1)->after('is_recipe');
        });

        Schema::create('production_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reference', 30)->unique();
            $table->decimal('batches', 12, 3);
            $table->decimal('qty_produced', 12, 3);
            $table->decimal('unit_cost', 15, 4)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->string('status', 20)->default('completed'); // completed | cancelled
            $table->text('notes')->nullable();
            $table->timestamp('produced_at')->useCurrent();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'produced_at']);
        });

        Schema::create('production_order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_order_id')->constrained('production_orders')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty', 12, 4);
            $table->decimal('unit_cost', 15, 4)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_order_lines');
        Schema::dropIfExists('production_orders');
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('recipe_yield');
        });
    }
};
