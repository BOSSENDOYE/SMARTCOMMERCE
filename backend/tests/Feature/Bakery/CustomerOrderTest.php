<?php

namespace Tests\Feature\Bakery;

use App\Models\CashSession;
use App\Models\CashSessionMovement;
use App\Models\Sale;
use App\Services\CustomerOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

class CustomerOrderTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    private CustomerOrderService $orders;
    private CashSession $session;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        $this->orders = app(CustomerOrderService::class);
        $this->session = CashSession::forceCreate(['store_id' => $this->store->id, 'user_id' => $this->user->id, 'status' => 'open', 'opening_balance' => 0, 'opened_at' => now()]);
    }

    /** 100 baguettes à 175 F = 17 500 F, acompte 5 000 F en espèces */
    private function createOrder(array $deposit = ['payment_method' => 'cash', 'amount' => 5000])
    {
        return $this->orders->create($this->store->id, $this->user->id, [
            'customer_name' => 'Client Test',
            'pickup_at'     => now()->addDay(),
            'items'         => [['product_id' => $this->baguette->id, 'qty' => 100, 'details' => 'Baptême']],
            'deposit'       => $deposit,
        ]);
    }

    public function test_cash_deposit_is_recorded_in_the_open_cash_session(): void
    {
        $order = $this->createOrder();

        $this->assertEquals(17500, $order->total_ttc);
        $this->assertEquals(5000, $order->paid_amount);
        $this->assertEquals(12500, $order->balance);
        $this->assertEquals(5000, (float) CashSessionMovement::where('cash_session_id', $this->session->id)->where('type', 'deposit')->sum('amount'));
    }

    public function test_payment_cannot_exceed_the_balance(): void
    {
        $order = $this->createOrder();

        $this->expectException(ValidationException::class);
        $this->orders->addPayment($order, $this->user->id, 'wave', 12501);
    }

    public function test_items_cannot_drop_the_total_below_deposits(): void
    {
        $order = $this->createOrder();

        $this->expectException(ValidationException::class);
        $this->orders->update($order, ['items' => [['product_id' => $this->baguette->id, 'qty' => 10]]]); // 1 750 F < 5 000 F
    }

    public function test_delivery_creates_a_sale_with_deposit_and_balance(): void
    {
        $order = $this->createOrder();
        $this->orders->addPayment($order, $this->user->id, 'wave', 2500);

        $delivered = $this->orders->deliver($order->fresh(), $this->user->id, 'orange_money');

        $this->assertEquals('delivered', $delivered->status);
        $this->assertEquals(0, $delivered->balance);

        $sale = Sale::with('payments')->findOrFail($delivered->sale_id);
        $this->assertEquals(17500, (float) $sale->total_ttc);
        $this->assertEquals($this->session->id, $sale->cash_session_id);
        $payments = $sale->payments->mapWithKeys(fn ($p) => [$p->payment_method => (float) $p->amount]);
        $this->assertEquals(7500, $payments['voucher'], 'Acomptes imputés en avoir');
        $this->assertEquals(10000, $payments['orange_money'], 'Solde encaissé à la livraison');

        $this->expectException(ValidationException::class);
        $this->orders->deliver($delivered, $this->user->id, 'cash');
    }

    public function test_cancellation_with_refund_withdraws_cash_deposit(): void
    {
        $order = $this->createOrder();

        $cancelled = $this->orders->cancel($order, $this->user->id, 'Client absent', refund: true);

        $this->assertEquals('cancelled', $cancelled->status);
        $this->assertEquals(0, $cancelled->paid_amount);
        $this->assertEquals(5000, (float) CashSessionMovement::where('cash_session_id', $this->session->id)->where('type', 'withdrawal')->sum('amount'));
    }

    public function test_cancellation_without_refund_keeps_the_deposit(): void
    {
        $cancelled = $this->orders->cancel($this->createOrder(), $this->user->id, 'Acompte non remboursable', refund: false);

        $this->assertEquals(5000, $cancelled->paid_amount);
        $this->assertFalse(CashSessionMovement::where('cash_session_id', $this->session->id)->where('type', 'withdrawal')->exists());
    }
}
