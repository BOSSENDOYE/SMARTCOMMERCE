<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\SaleService;
use App\Services\AuditService;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(private SaleService $saleService) {}

    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $baseQuery = fn($q) => $q
            ->forStore($storeId)
            ->when($request->date_from,  fn($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to,    fn($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->when($request->status,     fn($q) => $q->where('status', $request->status))
            ->when($request->channel,    fn($q) => $q->where('channel', $request->channel))
            ->when($request->cashier_id, fn($q) => $q->where('user_id', $request->cashier_id));

        $sales = $baseQuery(Sale::with(['user', 'client', 'ticket', 'payments']))
            ->orderByDesc('created_at')
            ->paginate($request->per_page ?? 30);

        $totals = $baseQuery(Sale::query())
            ->selectRaw("
                COUNT(*) as total_count,
                SUM(CASE WHEN status = 'completed' THEN total_ttc ELSE 0 END) as total_ttc,
                SUM(CASE WHEN status = 'completed' THEN paid_amount ELSE 0 END) as paid_amount,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count
            ")
            ->first();

        return response()->json(array_merge($sales->toArray(), [
            'totals' => [
                'count'           => (int)   ($totals->total_count     ?? 0),
                'total_ttc'       => (float) ($totals->total_ttc       ?? 0),
                'paid_amount'     => (float) ($totals->paid_amount     ?? 0),
                'completed_count' => (int)   ($totals->completed_count ?? 0),
                'cancelled_count' => (int)   ($totals->cancelled_count ?? 0),
            ],
        ]));
    }

    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|exists:products,id',
            'items.*.restaurant_item_id' => 'nullable|exists:restaurant_items,id',
            'items.*.qty' => 'required|numeric|min:0.001',
            'items.*.unit_price_ttc' => 'nullable|numeric|min:0',
            'items.*.discount_pct' => 'nullable|numeric|min:0|max:100',
            'global_discount_amount' => 'nullable|numeric|min:0',
            'payments' => 'required|array|min:1',
            'payments.*.payment_method' => 'required|string',
            'payments.*.amount' => 'required|numeric|min:0',
            'client_id' => 'nullable|exists:clients,id',
            'cash_session_id' => ['nullable', 'exists:cash_sessions,id', function ($attribute, $value, $fail) {
                if ($value && \App\Models\CashSession::where('id', $value)->value('status') !== 'open') {
                    $fail('La session de caisse est fermée. Ouvrez une nouvelle session.');
                }
            }],
            'offline_id' => 'nullable|string|max:100',
            'channel' => 'nullable|in:pos,takeaway,delivery,online',
        ]);

        // Deduplicate offline sales — single query instead of exists() + first()
        if ($request->offline_id) {
            $existing = Sale::where('offline_id', $request->offline_id)->first();
            if ($existing) {
                return response()->json($existing->load(['items', 'payments', 'ticket']), 200);
            }
        }

        $sale = $this->saleService->createSale(
            data: [
                'store_id' => $request->user()->store_id,
                'workstation_id' => $request->workstation_id,
                'cash_session_id' => $request->cash_session_id,
                'client_id' => $request->client_id,
                'user_id' => $request->user()->id,
                'status' => 'draft',
                'channel' => $request->channel ?? 'pos',
                'offline_id' => $request->offline_id,
                'is_synced' => true,
                'synced_at' => now(),
                'global_discount_amount' => (float) ($request->global_discount_amount ?? 0),
            ],
            items: $request->items,
            payments: $request->payments,
        );

        AuditService::log('sale_created', 'sales', $sale->id, ['total' => $sale->total_ttc]);

        // Load relations needed for the receipt
        $sale->loadMissing([
            'items.product:id,name,short_name',
            'items.restaurantItem:id,name',
            'user:id,name',
            'store:id,name,address,phone,ninea,receipt_footer',
        ]);

        return response()->json($sale, 201);
    }

    public function show(Request $request, Sale $sale)
    {
        return response()->json($sale->load([
            'items.product', 'payments', 'ticket', 'client', 'user', 'cashSession',
        ]));
    }

    public function cancel(Request $request, Sale $sale)
    {
        $request->validate([
            'reason'         => 'required|string|max:200',
            'supervisor_pin' => 'required|string',
            'refund_method'  => 'required|in:cash,wave,orange_money,free_money,card,credit,account,none',
            'refund_amount'  => 'nullable|numeric|min:0',
        ]);

        // Only fetch id+pin for users that actually have a pin set (avoid loading all columns)
        $supervisor = \App\Models\User::where('store_id', $request->user()->store_id)
            ->whereNotNull('pin')
            ->get(['id', 'pin'])
            ->first(fn($u) => \Hash::check($request->supervisor_pin, $u->pin));

        if (!$supervisor || !$supervisor->hasPermissionTo('cancel_sales')) {
            return response()->json(['message' => 'Autorisation superviseur requise.'], 403);
        }

        $sale = $this->saleService->cancelSale(
            sale: $sale,
            reason: $request->reason,
            supervisorId: $supervisor->id,
            refundMethod: $request->refund_method,
            refundAmount: (float) ($request->refund_amount ?? $sale->paid_amount),
        );

        return response()->json($sale);
    }

    public function todayStats(Request $request)
    {
        $storeId = $request->user()->store_id;

        $stats = Sale::forStore($storeId)
            ->completed()
            ->today()
            ->selectRaw('
                COUNT(*) as transaction_count,
                SUM(total_ttc) as total_sales,
                SUM(subtotal_ht) as total_ht,
                SUM(vat_amount) as total_vat,
                SUM(discount_amount) as total_discounts,
                AVG(total_ttc) as avg_basket
            ')
            ->first();

        // JOIN instead of correlated whereHas subquery — much faster
        $paymentBreakdown = \App\Models\SalePayment::join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.store_id', $storeId)
            ->where('sales.status', 'completed')
            ->whereDate('sales.created_at', today())
            ->selectRaw('payment_method, SUM(sale_payments.amount) as total')
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method');

        return response()->json([
            'stats' => $stats,
            'payment_breakdown' => $paymentBreakdown,
        ]);
    }

    public function syncOffline(Request $request)
    {
        $request->validate([
            'sales' => 'required|array',
        ]);

        $synced = [];
        $errors = [];

        foreach ($request->sales as $saleData) {
            try {
                if (Sale::where('offline_id', $saleData['offline_id'] ?? '')->exists()) {
                    $synced[] = ['offline_id' => $saleData['offline_id'], 'status' => 'already_synced'];
                    continue;
                }

                $sale = $this->saleService->createSale(
                    data: array_merge($saleData, ['is_synced' => true, 'synced_at' => now()]),
                    items: $saleData['items'],
                    payments: $saleData['payments'],
                );
                $synced[] = ['offline_id' => $saleData['offline_id'] ?? null, 'sale_id' => $sale->id, 'status' => 'synced'];
            } catch (\Exception $e) {
                $errors[] = ['offline_id' => $saleData['offline_id'] ?? null, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['synced' => $synced, 'errors' => $errors]);
    }
}
