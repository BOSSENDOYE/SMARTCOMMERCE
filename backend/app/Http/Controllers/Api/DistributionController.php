<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courier;
use App\Models\CourierPayment;
use App\Models\CourierRound;
use App\Models\DistributionMovement;
use App\Models\ProductionOrder;
use App\Services\CustomerOrderService;
use App\Services\DistributionService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Répartition des productions (point de vente / livreurs), tournées et livreurs.
 */
class DistributionController extends Controller
{
    public function __construct(private DistributionService $distribution) {}

    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $today   = DistributionMovement::where('store_id', $storeId)->whereDate('created_at', today());

        $pending = ProductionOrder::where('store_id', $storeId)->where('status', 'completed')
            ->whereColumn('qty_allocated', '<', 'qty_produced');

        $couriers = Courier::where('store_id', $storeId)->get();

        return response()->json([
            'pending_orders'   => (clone $pending)->count(),
            'pending_qty'      => (float) (clone $pending)->selectRaw('COALESCE(SUM(qty_produced - qty_allocated), 0) as q')->value('q'),
            'today_to_pos'     => (float) (clone $today)->where('destination', 'pos')->where('source', 'production')->sum('qty'),
            'today_to_couriers'=> (float) (clone $today)->where('destination', 'courier')->where('source', 'production')->sum('qty'),
            'open_rounds'      => CourierRound::where('store_id', $storeId)->where('status', 'open')->count(),
            'couriers_debt'    => round($couriers->sum(fn (Courier $c) => $c->debt()), 2),
        ]);
    }

    // ── Répartition ──────────────────────────────────────────────────────────

    /** Productions en attente de répartition (totale ou partielle). */
    public function pending(Request $request)
    {
        return response()->json(
            ProductionOrder::with(['product:id,name,internal_code,sale_price_ttc,courier_price,unit_id', 'product.unit:id,abbreviation'])
                ->where('store_id', $request->user()->store_id)
                ->where('status', 'completed')
                ->whereColumn('qty_allocated', '<', 'qty_produced')
                ->orderBy('produced_at')
                ->get()
        );
    }

    public function allocate(Request $request, ProductionOrder $productionOrder)
    {
        abort_unless($productionOrder->store_id == $request->user()->store_id, 404);

        $data = $request->validate([
            'lines'               => 'required|array|min:1',
            'lines.*.destination' => 'required|in:pos,courier',
            'lines.*.courier_id'  => 'nullable|required_if:lines.*.destination,courier|integer',
            'lines.*.qty'         => 'required|numeric|min:0',
        ]);

        $order = $this->distribution->allocate($productionOrder, $request->user()->id, $data['lines']);

        return response()->json($order->load('product:id,name'));
    }

    public function transfer(Request $request)
    {
        $data = $request->validate([
            'product_id'      => 'required|integer',
            'qty'             => 'required|numeric|min:0.001',
            'from.type'       => 'required|in:pos,courier',
            'from.courier_id' => 'nullable|required_if:from.type,courier|integer',
            'to.type'         => 'required|in:pos,courier',
            'to.courier_id'   => 'nullable|required_if:to.type,courier|integer',
        ]);

        $movement = $this->distribution->transfer(
            $request->user()->store_id, $request->user()->id, (int) $data['product_id'],
            $data['from'], $data['to'], (float) $data['qty']
        );

        return response()->json($movement->load('product:id,name'), 201);
    }

    /** Journal des répartitions et réaffectations. */
    public function movements(Request $request)
    {
        return response()->json(
            DistributionMovement::with([
                'product:id,name', 'user:id,name', 'productionOrder:id,reference',
                'sourceRound:id,reference,courier_id', 'sourceRound.courier:id,name',
                'destinationRound:id,reference,courier_id', 'destinationRound.courier:id,name',
            ])
                ->where('store_id', $request->user()->store_id)
                ->when($request->date, fn ($q, $d) => $q->whereDate('created_at', $d))
                ->orderByDesc('created_at')->orderByDesc('id')
                ->paginate((int) ($request->per_page ?? 30))
        );
    }

    // ── Tournées ─────────────────────────────────────────────────────────────

    public function rounds(Request $request)
    {
        $rounds = CourierRound::with(['courier:id,name,phone', 'items.product:id,name', 'sale:id,reference'])
            ->where('store_id', $request->user()->store_id)
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->date, fn ($q, $d) => $q->whereDate('round_date', $d))
            ->orderByRaw("CASE status WHEN 'open' THEN 0 ELSE 1 END")
            ->orderByDesc('round_date')->orderByDesc('id')
            ->paginate((int) ($request->per_page ?? 30));

        return response()->json($rounds);
    }

    public function showRound(Request $request, CourierRound $courierRound)
    {
        abort_unless($courierRound->store_id == $request->user()->store_id, 404);

        return response()->json($courierRound->load(['courier', 'items.product:id,name', 'sale:id,reference', 'settler:id,name']));
    }

    public function settle(Request $request, CourierRound $courierRound)
    {
        abort_unless($courierRound->store_id == $request->user()->store_id, 404);

        $data = $request->validate([
            'returns'        => 'present|array',
            'returns.*'      => 'numeric|min:0',
            'payment_method' => ['required', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
            'amount_paid'    => 'required|numeric|min:0',
            'notes'          => 'nullable|string|max:500',
        ]);

        $round = $this->distribution->settle(
            $courierRound, $request->user()->id, $data['returns'],
            $data['payment_method'], (float) $data['amount_paid'], $data['notes'] ?? null
        );

        return response()->json($round->load('sale:id,reference'));
    }

    // ── Livreurs ─────────────────────────────────────────────────────────────

    public function couriers(Request $request)
    {
        $couriers = Courier::where('store_id', $request->user()->store_id)
            ->with(['rounds' => fn ($q) => $q->where('status', 'open')->with('items')])
            ->orderByDesc('is_active')->orderBy('name')
            ->get();

        return response()->json($couriers->map(function (Courier $c) {
            $open = $c->rounds->first();
            return array_merge($c->only(['id', 'name', 'phone', 'zone', 'is_active']), [
                'debt'       => $c->debt(),
                'open_round' => $open ? [
                    'id'        => $open->id,
                    'reference' => $open->reference,
                    'qty_out'   => round($open->items->sum(fn ($i) => $i->qty_given - $i->qty_returned), 3),
                    'value'     => round($open->items->sum(fn ($i) => $i->qty_given * $i->unit_price), 2),
                ] : null,
            ]);
        }));
    }

    public function storeCourier(Request $request)
    {
        $data = $request->validate($this->courierRules());

        return response()->json(Courier::create($data + ['store_id' => $request->user()->store_id]), 201);
    }

    public function updateCourier(Request $request, Courier $courier)
    {
        abort_unless($courier->store_id == $request->user()->store_id, 404);
        $courier->update($request->validate($this->courierRules(true)));

        return response()->json($courier);
    }

    public function payDebt(Request $request, Courier $courier)
    {
        abort_unless($courier->store_id == $request->user()->store_id, 404);

        $data = $request->validate([
            'payment_method' => ['required', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
            'amount'         => 'required|numeric|min:1',
        ]);

        $payment = $this->distribution->payDebt($courier, $request->user()->id, $data['payment_method'], (float) $data['amount']);

        return response()->json(['payment' => $payment, 'debt' => $courier->debt()], 201);
    }

    public function courierPayments(Request $request, Courier $courier)
    {
        abort_unless($courier->store_id == $request->user()->store_id, 404);

        return response()->json(
            CourierPayment::with('user:id,name')->where('courier_id', $courier->id)->latest()->limit(50)->get()
        );
    }

    private function courierRules(bool $update = false): array
    {
        $req = $update ? 'sometimes' : 'required';

        return [
            'name'      => "{$req}|string|max:120",
            'phone'     => 'nullable|string|max:30',
            'zone'      => 'nullable|string|max:120',
            'is_active' => 'boolean',
        ];
    }
}
