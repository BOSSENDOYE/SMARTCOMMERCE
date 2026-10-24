<?php

namespace Tests\Concerns;

use App\Models\Courier;
use App\Models\Organization;
use App\Models\Product;
use App\Models\RecipeIngredient;
use App\Models\StockLevel;
use App\Models\Store;
use App\Models\Unit;
use App\Models\User;

/**
 * Boulangerie minimale pour les tests :
 *  - matières premières : farine (450 F/kg, 100 kg), sel (300 F/kg, 10 kg)
 *  - produit fini : baguette (175 F, prix livreur 150 F), 100 par fournée
 *    = 25 kg de farine + 0,5 kg de sel → coût fournée 11 400 F, 114 F l'unité
 */
trait BakeryFixtures
{
    protected Store $store;
    protected User $user;
    protected Product $flour;
    protected Product $salt;
    protected Product $baguette;

    protected function setUpBakery(): void
    {
        $org = Organization::forceCreate(['name' => 'Fournil Test', 'code' => 'FTEST', 'is_active' => true]);

        $this->store = Store::forceCreate([
            'organization_id' => $org->id,
            'name'            => 'Fournil Test',
            'code'            => 'FTEST-001',
            'business_type'   => 'boulangerie',
            'currency'        => 'XOF',
            'is_active'       => true,
            'is_central'      => true,
        ]);

        $this->user = User::forceCreate([
            'name'            => 'Gérant Test',
            'email'           => 'gerant@fournil.test',
            'password'        => bcrypt('secret'),
            'store_id'        => $this->store->id,
            'organization_id' => $org->id,
            'is_active'       => true,
        ]);

        $kg   = Unit::firstOrCreate(['abbreviation' => 'kg'], ['name' => 'Kilogramme', 'is_weight_unit' => true]);
        $unit = Unit::firstOrCreate(['abbreviation' => 'U'], ['name' => 'Unité', 'is_weight_unit' => false]);

        $this->flour = $this->product('Farine', 'raw_material', 450, 0, $kg->id, 100);
        $this->salt  = $this->product('Sel', 'raw_material', 300, 0, $kg->id, 10);

        $this->baguette = $this->product('Baguette', 'finished', 110, 175, $unit->id, 0, [
            'courier_price' => 150,
            'is_recipe'     => true,
            'recipe_yield'  => 100,
        ]);

        foreach ([[$this->flour, 25], [$this->salt, 0.5]] as [$ingredient, $qty]) {
            RecipeIngredient::create([
                'product_id'    => $this->baguette->id,
                'ingredient_id' => $ingredient->id,
                'unit_id'       => $ingredient->unit_id,
                'quantity'      => $qty,
            ]);
        }
    }

    protected function product(string $name, string $kind, float $buy, float $sell, int $unitId, float $stock, array $extra = []): Product
    {
        static $seq = 0;
        $product = Product::forceCreate(array_merge([
            'store_id'          => $this->store->id,
            'internal_code'     => 'T' . str_pad((string) ++$seq, 6, '0', STR_PAD_LEFT) . uniqid(),
            'name'              => $name,
            'product_kind'      => $kind,
            'unit_id'           => $unitId,
            'purchase_price_ht' => $buy,
            'sale_price_ttc'    => $sell,
            'vat_rate'          => 0,
            'is_active'         => true,
        ], $extra));

        StockLevel::create([
            'store_id'     => $this->store->id,
            'product_id'   => $product->id,
            'qty_on_hand'  => $stock,
            'avg_cost'     => $buy,
            'last_updated' => now(),
        ]);

        return $product;
    }

    protected function courier(string $name): Courier
    {
        return Courier::create(['store_id' => $this->store->id, 'name' => $name, 'is_active' => true]);
    }

    protected function stockOf(Product $product): float
    {
        return (float) StockLevel::where('store_id', $this->store->id)->where('product_id', $product->id)->value('qty_on_hand');
    }
}
