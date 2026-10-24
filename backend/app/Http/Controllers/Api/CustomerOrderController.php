<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerOrder;
use App\Services\CustomerOrderService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Commandes clients avec acompte (boulangerie / pâtisserie).
 */
class CustomerOrderController extends Controller
{
    private const RELATIONS = [
        'items.product:id,name,internal_code', 'client:id,name,phone', 'user:id,name',
        'payments.user:id,name', 'sale:id,reference',
    ];

    public function __construct(private CustomerOrderService $orders) {}

    public function stats(Request $request)
    {
        $base = CustomerOrder::where('store_id', $request->user()->store_id);
        $open = (clone $base)->whereIn('status', ['pending', 'in_production', 'ready']);

        return response()->json([
            'today_pickups'    => (clone $open)->whereDate('pickup_at', today())->count(),
            'tomorrow_pickups' => (clone $open)->whereDate('pickup_at', today()->addDay())->count(),
            'open_count'       => (clone $open)->count(),
            'ready_count'      => (clone $base)->where('status', 'ready')->count(),
            'deposits_held'    => (float) (clone $open)->sum('paid_amount'),
            'balance_due'      => (float) (clone $open)->selectRaw('COALESCE(SUM(total_ttc - paid_amount), 0) as due')->value('due'),
        ]);
    }

    public function index(Request $request)
    {
        $query = CustomerOrder::with(['items.product:id,name', 'client:id,name'])
            ->where('store_id', $request->user()->store_id);

        if ($request->status === 'open') {
            $query->whereIn('status', ['pending', 'in_production', 'ready']);
        } elseif ($request->status) {
            $query->where('status', $request->status);
        }
        if ($request->date_from) {
            $query->whereDate('pickup_at', '>=', $request->date_from);
        }
        if ($request->date_to) {
            $query->whereDate('pickup_at', '<=', $request->date_to);
        }
        if ($request->search) {
            $query->where(fn ($q) => $q
                ->where('reference', 'ilike', "%{$request->search}%")
                ->orWhere('customer_name', 'ilike', "%{$request->search}%")
                ->orWhere('customer_phone', 'ilike', "%{$request->search}%")
            );
        }

        return response()->json($query->orderBy('pickup_at')->paginate((int) ($request->per_page ?? 20)));
    }

    public function show(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        return response()->json($customerOrder->load(self::RELATIONS));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules() + [
            'deposit.payment_method' => ['required_with:deposit.amount', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
            'deposit.amount'         => 'nullable|numeric|min:0',
            'deposit.reference'      => 'nullable|string|max:100',
        ]);

        $order = $this->orders->create($request->user()->store_id, $request->user()->id, $data);

        return response()->json($order->load(self::RELATIONS), 201);
    }

    public function update(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        // Champs de premier niveau optionnels ; les articles envoyés restent complets
        $data = $request->validate(collect($this->rules())
            ->map(fn ($r, $key) => str_contains($key, '.') ? $r : str_replace('required|', 'sometimes|', $r))
            ->all());

        return response()->json($this->orders->update($customerOrder, $data)->load(self::RELATIONS));
    }

    public function addPayment(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        $data = $request->validate([
            'payment_method' => ['required', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
            'amount'         => 'required|numeric|min:1',
            'reference'      => 'nullable|string|max:100',
        ]);

        $order = $this->orders->addPayment($customerOrder, $request->user()->id, $data['payment_method'], (float) $data['amount'], $data['reference'] ?? null);

        return response()->json($order->load(self::RELATIONS));
    }

    public function updateStatus(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        $data = $request->validate(['status' => 'required|in:pending,in_production,ready']);

        return response()->json($this->orders->setStatus($customerOrder, $data['status'])->load(self::RELATIONS));
    }

    public function deliver(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        $data = $request->validate([
            'payment_method' => ['nullable', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
        ]);

        $order = $this->orders->deliver($customerOrder, $request->user()->id, $data['payment_method'] ?? 'cash');

        return response()->json($order->load(self::RELATIONS));
    }

    public function cancel(Request $request, CustomerOrder $customerOrder)
    {
        $this->authorizeStore($request, $customerOrder);

        $data = $request->validate([
            'reason'        => 'nullable|string|max:255',
            'refund'        => 'boolean',
            'refund_method' => ['nullable', Rule::in(CustomerOrderService::PAYMENT_METHODS)],
        ]);

        $order = $this->orders->cancel(
            $customerOrder, $request->user()->id, $data['reason'] ?? null,
            (bool) ($data['refund'] ?? false), $data['refund_method'] ?? 'cash'
        );

        return response()->json($order->load(self::RELATIONS));
    }

    private function rules(): array
    {
        return [
            'client_id'              => 'nullable|exists:clients,id',
            'customer_name'          => 'required|string|max:150',
            'customer_phone'         => 'nullable|string|max:30',
            'pickup_at'              => 'required|date',
            'notes'                  => 'nullable|string|max:1000',
            'items'                  => 'required|array|min:1',
            'items.*.product_id'     => 'required|exists:products,id',
            'items.*.qty'            => 'required|numeric|min:0.001',
            'items.*.unit_price_ttc' => 'nullable|numeric|min:0',
            'items.*.details'        => 'nullable|string|max:500',
        ];
    }

    private function authorizeStore(Request $request, CustomerOrder $order): void
    {
        abort_unless($order->store_id == $request->user()->store_id, 404);
    }
}
