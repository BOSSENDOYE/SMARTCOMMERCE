<?php

namespace Tests\Feature\Bakery;

use App\Models\StockMovement;
use App\Services\DistributionService;
use App\Services\ProductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

class ProductionTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    private ProductionService $production;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        $this->production = app(ProductionService::class);
    }

    public function test_recipe_cost_is_computed_from_raw_material_costs(): void
    {
        $cost = $this->production->recipeCost($this->baguette, $this->store->id);

        // 25 kg × 450 + 0,5 kg × 300 = 11 400 F pour 100 baguettes
        $this->assertEquals(11400, $cost['batch_cost']);
        $this->assertEquals(114, $cost['unit_cost']);
        $this->assertEquals(61, $cost['margin']);
        $this->assertEquals(34.9, $cost['margin_rate']);
    }

    public function test_production_consumes_raw_materials_and_stays_pending(): void
    {
        $order = $this->production->produce($this->baguette, $this->store->id, $this->user->id, 2);

        $this->assertEquals(200, $order->qty_produced);
        $this->assertEquals(0, $order->qty_allocated);
        $this->assertEquals(200, $order->fresh()->qty_pending);
        $this->assertEquals(114, $order->unit_cost);

        $this->assertEquals(50, $this->stockOf($this->flour));   // 100 − 2 × 25
        $this->assertEquals(9, $this->stockOf($this->salt));     // 10 − 2 × 0,5
        // La production n'alimente pas la caisse tant qu'elle n'est pas répartie
        $this->assertEquals(0, $this->stockOf($this->baguette));
        $this->assertFalse(StockMovement::where('product_id', $this->baguette->id)->exists());
    }

    public function test_production_is_refused_on_shortage_unless_forced(): void
    {
        try {
            $this->production->produce($this->baguette, $this->store->id, $this->user->id, 5); // 125 kg de farine
            $this->fail('La production aurait dû être refusée');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('shortages', $e->errors());
            $this->assertStringContainsString('Farine', $e->errors()['shortages'][0]);
        }
        $this->assertEquals(100, $this->stockOf($this->flour), 'Aucun stock ne doit bouger après un refus');

        $this->production->produce($this->baguette, $this->store->id, $this->user->id, 5, null, allowShortage: true);
        $this->assertEquals(-25, $this->stockOf($this->flour));
    }

    public function test_cancel_restores_raw_materials_and_removes_pos_share(): void
    {
        $order = $this->production->produce($this->baguette, $this->store->id, $this->user->id, 1);
        app(DistributionService::class)->allocate($order, $this->user->id, [['destination' => 'pos', 'qty' => 60]]);
        $this->assertEquals(60, $this->stockOf($this->baguette));

        $this->production->cancel($order->fresh(), $this->user->id);

        $this->assertEquals('cancelled', $order->fresh()->status);
        $this->assertEquals(100, $this->stockOf($this->flour));
        $this->assertEquals(10, $this->stockOf($this->salt));
        $this->assertEquals(0, $this->stockOf($this->baguette));
    }

    public function test_cancel_is_refused_once_part_went_to_a_courier(): void
    {
        $order = $this->production->produce($this->baguette, $this->store->id, $this->user->id, 1);
        app(DistributionService::class)->allocate($order, $this->user->id, [
            ['destination' => 'courier', 'courier_id' => $this->courier('Sidi')->id, 'qty' => 10],
        ]);

        $this->expectException(ValidationException::class);
        $this->production->cancel($order->fresh(), $this->user->id);
    }

    public function test_unsold_recycling_moves_cost_to_target_product(): void
    {
        $order = $this->production->produce($this->baguette, $this->store->id, $this->user->id, 1);
        app(DistributionService::class)->allocate($order, $this->user->id, [['destination' => 'pos', 'qty' => 100]]);
        $breadcrumbs = $this->product('Chapelure', 'finished', 0, 1500, $this->flour->unit_id, 0);

        $report = $this->production->recordUnsold($this->store->id, $this->user->id, today(), [
            ['product_id' => $this->baguette->id, 'qty' => 40, 'destination' => 'recycle', 'target_product_id' => $breadcrumbs->id, 'target_qty' => 2],
            ['product_id' => $this->baguette->id, 'qty' => 5, 'destination' => 'waste'],
        ]);

        $this->assertEquals(55, $this->stockOf($this->baguette));
        $this->assertEquals(2, $this->stockOf($breadcrumbs));
        $this->assertEquals(45 * 114, $report->total_cost);
        // 40 baguettes × 114 F réparties sur 2 kg de chapelure
        $this->assertEquals(2280, (float) \App\Models\StockLevel::where('product_id', $breadcrumbs->id)->value('avg_cost'));
    }
}
