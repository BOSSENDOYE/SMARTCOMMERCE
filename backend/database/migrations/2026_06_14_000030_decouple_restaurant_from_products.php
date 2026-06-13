<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── order_items: rendre product_id nullable + ajouter restaurant_item_id ──
        DB::statement('ALTER TABLE order_items DROP FOREIGN KEY order_items_product_id_foreign');
        DB::statement('ALTER TABLE order_items MODIFY COLUMN product_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL');

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('restaurant_item_id')
                  ->nullable()
                  ->after('product_id')
                  ->constrained('restaurant_items')
                  ->nullOnDelete();
        });

        // ── recipe_ingredients: rendre product_id nullable + ajouter restaurant_item_id ──
        DB::statement('ALTER TABLE recipe_ingredients DROP FOREIGN KEY recipe_ingredients_product_id_foreign');
        DB::statement('ALTER TABLE recipe_ingredients DROP INDEX recipe_ingredients_product_id_ingredient_id_unique');
        DB::statement('ALTER TABLE recipe_ingredients MODIFY COLUMN product_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL');

        Schema::table('recipe_ingredients', function (Blueprint $table) {
            $table->foreignId('restaurant_item_id')
                  ->nullable()
                  ->after('product_id')
                  ->constrained('restaurant_items')
                  ->nullOnDelete();
            $table->unique(['restaurant_item_id', 'ingredient_id']);
        });
    }

    public function down(): void
    {
        Schema::table('recipe_ingredients', function (Blueprint $table) {
            $table->dropUnique(['restaurant_item_id', 'ingredient_id']);
            $table->dropForeign(['restaurant_item_id']);
            $table->dropColumn('restaurant_item_id');
        });
        DB::statement('ALTER TABLE recipe_ingredients DROP FOREIGN KEY recipe_ingredients_product_id_foreign');
        DB::statement('ALTER TABLE recipe_ingredients MODIFY COLUMN product_id BIGINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE recipe_ingredients ADD CONSTRAINT recipe_ingredients_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE recipe_ingredients ADD UNIQUE recipe_ingredients_product_id_ingredient_id_unique (product_id, ingredient_id)');

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['restaurant_item_id']);
            $table->dropColumn('restaurant_item_id');
        });
        DB::statement('ALTER TABLE order_items DROP FOREIGN KEY order_items_product_id_foreign');
        DB::statement('ALTER TABLE order_items MODIFY COLUMN product_id BIGINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_foreign FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE');
    }
};
