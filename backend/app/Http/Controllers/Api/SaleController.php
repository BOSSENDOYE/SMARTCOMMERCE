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

        $sales = Sale::forStore($storeId)
            ->with(['user', 'client', 'ticket', 'payments'])
            ->when($request->date_from, fn($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to, fn($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->cashier_id, fn($q) => $q->where('user_id', $request->cashier_id))
            ->orderByDesc('created_at')
            ->paginate($request->per_page ?? 30);

        return response()->json($sales);
    }

    public function store(Request $request)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.qty' => 'required|numeric|min:0.001',
            'items.*.unit_price_ttc' => 'nullable|numeric|min:0',
            'items.*.discount_pct' => 'nullable|numeric|min:0|max:100',
            'payments' => 'required|array|min:1',
            'payments.*.payment_method' => 'required|string',
            'payments.*.amount' => 'required|numeric|min:0',
            'client_id' => 'nullable|exists:clients,id',
            'cash_session_id' => 'nullable|exists:cash_sessions,id',
            'offline_id' => 'nullable|string|max:100',
            'channel' => 'nullable|in:pos,takeaway,delivery,online',
        ]);

        // Deduplicate offline sales
        if ($request->offline_id && Sale::where('offline_id', $request->offline_id)->exists()) {
            $existing = Sale::where('offline_id', $request->offline_id)->first();
            return response()->json($existing->load(['items', 'payments', 'ticket']), 200);
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
            ],
            items: $request->items,
            payments: $request->payments,
        );

        AuditService::log('sale_created', 'sales', $sale->id, ['total' => $sale->total_ttc]);

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
            'reason' => 'required|string|max:200',
            'supervisor_pin' => 'required|string',
        ]);

        $supervisor = \App\Models\User::where('store_id', $request->user()->store_id)
            ->get()
            ->first(fn($u) => \Hash::check($request->supervisor_pin, $u->pin ?? ''));

        if (!$supervisor || !$supervisor->hasPermissionTo('cancel_sales')) {
            return response()->json(['message' => 'Autorisation superviseur requise.'], 403);
        }

        $sale = $this->saleService->cancelSale($sale, $request->reason, $supervisor->id);
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

        $paymentBreakdown = \App\Models\SalePayment::whereHas('sale', fn($q) => $q
                ->forStore($storeId)->completed()->today()
            )
            ->selectRaw('payment_method, SUM(amount) as total')
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
