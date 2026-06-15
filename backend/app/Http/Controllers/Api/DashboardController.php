<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SalePayment;
use App\Models\Product;
use App\Models\StockLevel;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(private StockService $stockService) {}

    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;
        $today = today();
        $yesterday = today()->subDay();
        $monthStart = today()->startOfMonth();
        $yearStart = today()->startOfYear();

        $todaySales = $this->getSalesStats($storeId, $today, $today);
        $yesterdaySales = $this->getSalesStats($storeId, $yesterday, $yesterday);
        $monthSales = $this->getSalesStats($storeId, $monthStart, $today);
        $yearSales = $this->getSalesStats($storeId, $yearStart, $today);

        $stockAlerts = $this->stockService->getLowStockProducts($storeId)->count();
        $expiringAlerts = $this->stockService->getExpiringProducts($storeId, 30)->count();

        $topProducts = $this->getTopProducts($storeId, $today, $today, 10);
        $paymentBreakdown = $this->getPaymentBreakdown($storeId, $today, $today);
        $hourlySales = $this->getHourlySales($storeId, $today);

        return response()->json([
            'sales' => [
                'today' => $todaySales,
                'yesterday' => $yesterdaySales,
                'month' => $monthSales,
                'year' => $yearSales,
            ],
            'alerts' => [
                'low_stock_count' => $stockAlerts,
                'expiring_soon_count' => $expiringAlerts,
            ],
            'top_products' => $topProducts,
            'payment_breakdown' => $paymentBreakdown,
            'hourly_sales' => $hourlySales,
            'stock_value' => $this->stockService->getStockValue($storeId),
        ]);
    }

    private function getSalesStats(int $storeId, $from, $to): array
    {
        $result = Sale::forStore($storeId)
            ->completed()
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->selectRaw('
                COUNT(*) as count,
                COALESCE(SUM(total_ttc), 0) as total_ttc,
                COALESCE(SUM(subtotal_ht), 0) as total_ht,
                COALESCE(SUM(vat_amount), 0) as total_vat,
                COALESCE(SUM(discount_amount), 0) as total_discounts,
                COALESCE(AVG(total_ttc), 0) as avg_basket
            ')
            ->first();

        return [
            'count' => (int)($result->count ?? 0),
            'total_ttc' => (float)($result->total_ttc ?? 0),
            'total_ht' => (float)($result->total_ht ?? 0),
            'total_vat' => (float)($result->total_vat ?? 0),
            'total_discounts' => (float)($result->total_discounts ?? 0),
            'avg_basket' => round((float)($result->avg_basket ?? 0), 2),
        ];
    }

    private function getTopProducts(int $storeId, $from, $to, int $limit = 10): array
    {
        return DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->whereNotNull('sale_items.product_id')
            ->where('sales.store_id', $storeId)
            ->where('sales.status', 'completed')
            ->whereDate('sales.created_at', '>=', $from)
            ->whereDate('sales.created_at', '<=', $to)
            ->selectRaw('
                products.id, products.name,
                SUM(sale_items.qty) as total_qty,
                SUM(sale_items.total_ttc) as total_revenue,
                COUNT(DISTINCT sales.id) as sale_count
            ')
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('total_revenue')
            ->limit($limit)
            ->get()
            ->toArray();
    }

    private function getPaymentBreakdown(int $storeId, $from, $to): array
    {
        return SalePayment::whereHas('sale', fn($q) => $q
                ->forStore($storeId)->completed()
                ->whereDate('created_at', '>=', $from)
                ->whereDate('created_at', '<=', $to)
            )
            ->selectRaw('payment_method, SUM(amount) as total, COUNT(*) as count')
            ->groupBy('payment_method')
            ->get()
            ->map(fn($r) => ['method' => $r->payment_method, 'total' => $r->total, 'count' => $r->count])
            ->toArray();
    }

    private function getHourlySales(int $storeId, $date): array
    {
        $hourExpr = DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(strftime('%H', created_at) AS INTEGER)"
            : 'HOUR(created_at)';

        $rows = DB::table('sales')
            ->where('store_id', $storeId)
            ->where('status', 'completed')
            ->whereDate('created_at', $date)
            ->selectRaw("$hourExpr as hour, COUNT(*) as count, SUM(total_ttc) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->get();

        return $rows->map(fn($r) => [
            'hour' => (int) ($r->hour ?? 0),
            'count' => (int) $r->count,
            'total' => (float) $r->total,
        ])->toArray();
    }
}
