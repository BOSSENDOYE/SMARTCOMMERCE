<?php

namespace Tests\Feature\Bakery;

use App\Models\Category;
use App\Models\ProductBarcode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

/**
 * Filtre « produit fini / matière première » utilisé par la caisse, le stock et les achats.
 */
class ProductKindApiTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        Sanctum::actingAs($this->user);
    }

    public function test_products_are_filtered_by_kind(): void
    {
        $names = fn (string $kind) => collect($this->getJson("/api/v1/products?kind={$kind}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        $this->assertEquals(['Baguette'], $names('finished'));
        $this->assertEquals(['Farine', 'Sel'], $names('raw_material'));
    }

    public function test_barcode_scan_ignores_raw_materials_for_the_pos(): void
    {
        ProductBarcode::create(['product_id' => $this->flour->id, 'barcode' => '6220000000019', 'type' => 'ean13', 'is_primary' => true]);

        $this->getJson('/api/v1/products/barcode?barcode=6220000000019')->assertOk();
        $this->getJson('/api/v1/products/barcode?barcode=6220000000019&kind=finished')->assertNotFound();
    }

    public function test_categories_can_be_limited_to_those_holding_finished_products(): void
    {
        $breads = Category::create(['organization_id' => $this->store->organization_id, 'name' => 'Pains', 'slug' => 'test-pains', 'type' => 'common']);
        $raw    = Category::create(['organization_id' => $this->store->organization_id, 'name' => 'Matières premières', 'slug' => 'test-matieres', 'type' => 'common']);
        $this->baguette->update(['category_id' => $breads->id]);
        $this->flour->update(['category_id' => $raw->id]);

        $all      = collect($this->getJson('/api/v1/categories')->assertOk()->json())->pluck('name');
        $finished = collect($this->getJson('/api/v1/categories?kind=finished')->assertOk()->json())->pluck('name');

        $this->assertTrue($all->contains('Matières premières'));
        $this->assertEquals(['Pains'], $finished->all());
    }

    public function test_stock_endpoint_is_filtered_by_kind(): void
    {
        $this->assertEquals(2, $this->getJson('/api/v1/stock?kind=raw_material')->assertOk()->json('total'));
        $this->assertEquals(1, $this->getJson('/api/v1/stock?kind=finished')->assertOk()->json('total'));
    }
}
