<?php

namespace Tests\Feature\Bakery;

use App\Models\CourierRound;
use App\Models\Organization;
use App\Models\Store;
use App\Models\User;
use App\Services\CustomerOrderService;
use App\Services\DistributionService;
use App\Services\ProductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

/**
 * Tickets imprimables (dotation, clôture de tournée, bon de commande) et bilan du jour.
 */
class TicketsAndDayTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    private CourierRound $round;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        Sanctum::actingAs($this->user);

        // 300 baguettes : 200 au point de vente, 100 à Sidi
        $order = app(ProductionService::class)->produce($this->baguette, $this->store->id, $this->user->id, 3, null, true);
        app(DistributionService::class)->allocate($order, $this->user->id, [
            ['destination' => 'pos', 'qty' => 200],
            ['destination' => 'courier', 'courier_id' => $this->courier('Sidi')->id, 'qty' => 100],
        ]);
        $this->round = CourierRound::where('status', 'open')->firstOrFail();
    }

    private function settle(): void
    {
        // 10 invendus, 90 vendus × 150 F = 13 500 F dus, 12 000 F versés
        app(DistributionService::class)->settle($this->round, $this->user->id, [$this->baguette->id => 10], 'cash', 12000);
    }

    public function test_courier_tickets_are_printable_as_pdf(): void
    {
        $this->get("/api/v1/pdf/courier-rounds/{$this->round->id}/dotation")
            ->assertOk()->assertHeader('content-type', 'application/pdf');

        // Le reçu n'existe qu'après la clôture
        $this->getJson("/api/v1/pdf/courier-rounds/{$this->round->id}/settlement")->assertStatus(422);
        $this->settle();
        $this->get("/api/v1/pdf/courier-rounds/{$this->round->id}/settlement")
            ->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_customer_order_ticket_is_printable(): void
    {
        $order = app(CustomerOrderService::class)->create($this->store->id, $this->user->id, [
            'customer_name' => 'Client', 'pickup_at' => now()->addDay(),
            'items' => [['product_id' => $this->baguette->id, 'qty' => 10, 'details' => 'Bien cuites']],
            'deposit' => ['payment_method' => 'wave', 'amount' => 500],
        ]);

        $this->get("/api/v1/pdf/customer-orders/{$order->id}")
            ->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_tickets_of_another_store_are_not_accessible(): void
    {
        $org = Organization::forceCreate(['name' => 'Autre', 'code' => 'AUTRE', 'is_active' => true]);
        $other = Store::forceCreate(['organization_id' => $org->id, 'name' => 'Autre', 'code' => 'AUTRE-001', 'business_type' => 'boulangerie', 'is_active' => true]);
        Sanctum::actingAs(User::forceCreate(['name' => 'Intrus', 'email' => 'intrus@test', 'password' => bcrypt('x'), 'store_id' => $other->id, 'organization_id' => $org->id, 'is_active' => true]));

        $this->getJson("/api/v1/pdf/courier-rounds/{$this->round->id}/dotation")->assertNotFound();
    }

    public function test_day_summary_follows_each_batch(): void
    {
        $this->settle();
        app(ProductionService::class)->recordUnsold($this->store->id, $this->user->id, today(), [
            ['product_id' => $this->baguette->id, 'qty' => 5, 'destination' => 'waste'],
        ]);

        $day = $this->getJson('/api/v1/production/day')->assertOk()->json();
        $s = $day['summary'];

        $this->assertEquals(300, $s['produced_qty']);
        $this->assertEquals(200, $s['to_pos']);
        $this->assertEquals(100, $s['to_couriers']);
        $this->assertEquals(90, $s['sold_couriers_qty']);
        $this->assertEquals(5, $s['unsold_qty']);
        $this->assertEquals(1.7, $s['unsold_rate']);            // 5 / 300
        $this->assertEquals(13500, $s['revenue_couriers']);
        $this->assertEquals(1500, $s['couriers_gap_day']);
        $this->assertEquals(0, $s['pending_all_qty']);

        $baguette = collect($day['products'])->firstWhere('name', 'Baguette');
        $this->assertEquals(205, $baguette['stock_pos']);       // 200 + 10 rendus − 5 invendus
        $this->assertEquals(1500, collect($day['couriers'])->firstWhere('name', 'Sidi')['debt']);
    }
}
