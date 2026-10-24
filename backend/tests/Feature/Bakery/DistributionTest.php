<?php

namespace Tests\Feature\Bakery;

use App\Models\CashSession;
use App\Models\CashSessionMovement;
use App\Models\Courier;
use App\Models\CourierRound;
use App\Models\DistributionMovement;
use App\Models\ProductionOrder;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Services\DistributionService;
use App\Services\ProductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

/**
 * Scénario de la spécification : 500 pains répartis entre le point de vente
 * (200), Sidi (100) et Moustapha (200).
 */
class DistributionTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    private DistributionService $distribution;
    private ProductionOrder $order;
    private Courier $sidi;
    private Courier $moustapha;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        $this->distribution = app(DistributionService::class);
        $this->sidi = $this->courier('Sidi');
        $this->moustapha = $this->courier('Moustapha');

        // 5 fournées = 500 baguettes (farine forcée : 125 kg pour 100 en stock)
        $this->order = app(ProductionService::class)->produce($this->baguette, $this->store->id, $this->user->id, 5, null, true);
    }

    private function allocate(array $lines): ProductionOrder
    {
        return $this->distribution->allocate($this->order->fresh(), $this->user->id, $lines);
    }

    private function openRound(Courier $courier): CourierRound
    {
        return CourierRound::where('courier_id', $courier->id)->where('status', 'open')->firstOrFail();
    }

    public function test_full_allocation_of_the_specification_example(): void
    {
        $order = $this->allocate([
            ['destination' => 'pos', 'qty' => 200],
            ['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 100],
            ['destination' => 'courier', 'courier_id' => $this->moustapha->id, 'qty' => 200],
        ]);

        $this->assertEquals(500, $order->qty_allocated);
        $this->assertEquals(0, $order->qty_pending);
        // Seule la part du point de vente alimente la caisse
        $this->assertEquals(200, $this->stockOf($this->baguette));

        $sidiItem = $this->openRound($this->sidi)->items()->first();
        $this->assertEquals(100, $sidiItem->qty_given);
        $this->assertEquals(150, $sidiItem->unit_price, 'Dotation au prix livreur');
        $this->assertEquals(200, $this->openRound($this->moustapha)->items()->first()->qty_given);

        // Chaque répartition est tracée
        $this->assertEquals(3, DistributionMovement::where('production_order_id', $this->order->id)->count());
    }

    public function test_allocation_cannot_exceed_produced_quantity(): void
    {
        $this->expectException(ValidationException::class);
        $this->allocate([
            ['destination' => 'pos', 'qty' => 400],
            ['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 200],
        ]);
    }

    public function test_partial_allocation_leaves_the_rest_pending_and_is_capped_cumulatively(): void
    {
        $order = $this->allocate([['destination' => 'pos', 'qty' => 300]]);
        $this->assertEquals(200, $order->qty_pending);

        try {
            $this->allocate([['destination' => 'pos', 'qty' => 201]]);
            $this->fail('Le cumul ne doit pas dépasser la production');
        } catch (ValidationException) {
        }

        $this->assertEquals(0, $this->allocate([['destination' => 'pos', 'qty' => 200]])->qty_pending);
        $this->assertEquals(500, $this->stockOf($this->baguette));
    }

    public function test_inactive_courier_cannot_receive_an_allocation(): void
    {
        $this->sidi->update(['is_active' => false]);

        $this->expectException(ValidationException::class);
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 10]]);
    }

    public function test_reassignment_between_pos_and_couriers(): void
    {
        $this->allocate([
            ['destination' => 'pos', 'qty' => 200],
            ['destination' => 'courier', 'courier_id' => $this->moustapha->id, 'qty' => 200],
        ]);

        $this->distribution->transfer($this->store->id, $this->user->id, $this->baguette->id, ['type' => 'courier', 'courier_id' => $this->moustapha->id], ['type' => 'pos'], 20);
        $this->distribution->transfer($this->store->id, $this->user->id, $this->baguette->id, ['type' => 'pos'], ['type' => 'courier', 'courier_id' => $this->sidi->id], 10);
        $this->distribution->transfer($this->store->id, $this->user->id, $this->baguette->id, ['type' => 'courier', 'courier_id' => $this->moustapha->id], ['type' => 'courier', 'courier_id' => $this->sidi->id], 30);

        $this->assertEquals(210, $this->stockOf($this->baguette));                               // 200 + 20 − 10
        $this->assertEquals(150, $this->openRound($this->moustapha)->items()->first()->qty_given); // 200 − 20 − 30
        $this->assertEquals(40, $this->openRound($this->sidi)->items()->first()->qty_given);       // 10 + 30
        $this->assertEquals(1, StockMovement::where('type', 'courier_out')->count());
        $this->assertEquals(1, StockMovement::where('type', 'courier_return')->count());
    }

    public function test_reassignment_is_refused_beyond_available_quantity(): void
    {
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 50]]);

        foreach ([
            [['type' => 'courier', 'courier_id' => $this->sidi->id], ['type' => 'pos'], 51],   // plus que la dotation
            [['type' => 'pos'], ['type' => 'courier', 'courier_id' => $this->sidi->id], 1],    // stock POS vide
            [['type' => 'pos'], ['type' => 'pos'], 1],                                          // même source et destination
        ] as [$from, $to, $qty]) {
            try {
                $this->distribution->transfer($this->store->id, $this->user->id, $this->baguette->id, $from, $to, $qty);
                $this->fail('Transfert invalide accepté : ' . json_encode([$from, $to, $qty]));
            } catch (ValidationException) {
            }
        }
        $this->assertEquals(50, $this->openRound($this->sidi)->items()->first()->qty_given);
    }

    public function test_round_settlement_returns_unsold_creates_sale_and_tracks_shortfall(): void
    {
        $session = CashSession::forceCreate(['store_id' => $this->store->id, 'user_id' => $this->user->id, 'status' => 'open', 'opening_balance' => 5000, 'opened_at' => now()]);
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 110]]);
        $round = $this->openRound($this->sidi);

        // 15 invendus, 95 vendus × 150 F = 14 250 F dus, 13 000 F versés
        $settled = $this->distribution->settle($round, $this->user->id, [$this->baguette->id => 15], 'cash', 13000);

        $this->assertEquals('settled', $settled->status);
        $this->assertEquals(14250, $settled->amount_due);
        $this->assertEquals(13000, $settled->amount_paid);
        $this->assertEquals(15, $this->stockOf($this->baguette), 'Les invendus reviennent au point de vente');
        $this->assertEquals(1250, $this->sidi->debt());

        $sale = Sale::with('payments')->findOrFail($settled->sale_id);
        $this->assertEquals('delivery', $sale->channel);
        $this->assertEquals(14250, (float) $sale->total_ttc);
        $this->assertEquals(13000, (float) $sale->paid_amount);
        $this->assertEquals($session->id, $sale->cash_session_id);
        // Vente déclarée par le livreur : la marchandise était déjà hors stock POS
        $this->assertFalse(StockMovement::where('reference_type', 'sales')->where('reference_id', $sale->id)->exists());

        $this->expectException(ValidationException::class);
        $this->distribution->settle($round->fresh(), $this->user->id, [], 'cash', 0);
    }

    public function test_returned_quantity_cannot_exceed_what_was_given(): void
    {
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 10]]);

        $this->expectException(ValidationException::class);
        $this->distribution->settle($this->openRound($this->sidi), $this->user->id, [$this->baguette->id => 11], 'cash', 0);
    }

    public function test_overpayment_and_debt_repayment(): void
    {
        $session = CashSession::forceCreate(['store_id' => $this->store->id, 'user_id' => $this->user->id, 'status' => 'open', 'opening_balance' => 0, 'opened_at' => now()]);

        // Tournée 1 : 10 vendus (1 500 F dus), rien versé → manquant 1 500 F
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 10]]);
        $this->distribution->settle($this->openRound($this->sidi), $this->user->id, [], 'cash', 0);
        $this->assertEquals(1500, $this->sidi->debt());

        // Tournée 2 : 10 vendus (1 500 F dus), 2 000 F versés → 500 F imputés au manquant
        $this->allocate([['destination' => 'courier', 'courier_id' => $this->sidi->id, 'qty' => 10]]);
        $this->distribution->settle($this->openRound($this->sidi), $this->user->id, [], 'cash', 2000);
        $this->assertEquals(1000, $this->sidi->debt());

        // Remboursement plafonné au manquant
        try {
            $this->distribution->payDebt($this->sidi, $this->user->id, 'cash', 1001);
            $this->fail('Remboursement supérieur au manquant accepté');
        } catch (ValidationException) {
        }
        $this->distribution->payDebt($this->sidi, $this->user->id, 'cash', 1000);
        $this->assertEquals(0, $this->sidi->debt());

        // Les remboursements en espèces sont des dépôts de caisse (les règlements passent par la vente)
        $this->assertEquals(1500, (float) CashSessionMovement::where('cash_session_id', $session->id)->where('type', 'deposit')->sum('amount'));
    }
}
