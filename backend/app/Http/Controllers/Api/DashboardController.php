<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SalePayment;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    public function __construct(private StockService $stockService) {}

    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        // Cache 30 secondes — assez court pour rester live, assez long pour éviter les requêtes répétées
        $data = Cache::remember("dashboard_{$storeId}", 30, function () use ($storeId) {
            $today      = today();
            $yesterday  = today()->subDay();
            $monthStart = today()->startOfMonth();
            $weekStart  = today()->subDays(6);

            return [
                'sales' => [
                    'today'     => $this->getSalesStats($storeId, $today, $today),
                    'yesterday' => $this->getSalesStats($storeId, $yesterday, $yesterday),
                    'month'     => $this->getSalesStats($storeId, $monthStart, $today),
                ],
                'alerts' => [
                    'low_stock_count'     => $this->stockService->getLowStockProducts($storeId)->count(),
                    'expiring_soon_count' => $this->stockService->getExpiringProducts($storeId, 30)->count(),
                ],
                'top_products'      => $this->getTopProducts($storeId, $today, $today, 8),
                'payment_breakdown' => $this->getPaymentBreakdown($storeId, $today, $today),
                'hourly_sales'      => $this->getHourlySales($storeId, $today),
                'week_sales'        => $this->getWeekSales($storeId, $weekStart, $today),
                'stock_value'       => $this->stockService->getStockValue($storeId),
            ];
        });

        return response()->json($data);
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
        $driver = DB::connection()->getDriverName();
        $hourExpr = match ($driver) {
            'sqlite' => "CAST(strftime('%H', created_at) AS INTEGER)",
            'pgsql'  => "EXTRACT(HOUR FROM created_at)::integer",
            default  => 'HOUR(created_at)',
        };

        $rows = DB::table('sales')
            ->where('store_id', $storeId)
            ->where('status', 'completed')
            ->whereDate('created_at', $date)
            ->selectRaw("$hourExpr as hour, COUNT(*) as count, SUM(total_ttc) as total")
            ->groupBy('hour')
            ->orderBy('hour')
            ->get();

        // Remplir toutes les heures de 7h à 22h pour un graphique continu
        $byHour = $rows->keyBy('hour');
        return collect(range(7, 22))->map(fn($h) => [
            'hour'  => $h,
            'count' => (int)  ($byHour[$h]->count ?? 0),
            'total' => (float)($byHour[$h]->total ?? 0),
        ])->values()->toArray();
    }

    private function getWeekSales(int $storeId, $from, $to): array
    {
        $driver = DB::connection()->getDriverName();
        $dateExpr = match ($driver) {
            'sqlite' => "date(created_at)",
            'pgsql'  => "created_at::date",
            default  => 'DATE(created_at)',
        };

        $rows = DB::table('sales')
            ->where('store_id', $storeId)
            ->where('status', 'completed')
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->selectRaw("$dateExpr as day, COUNT(*) as count, SUM(total_ttc) as total")
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        // 7 derniers jours avec toutes les dates
        $days = [];
        for ($i = 6; $i >= 0; $i--) {
            $d   = today()->subDays($i)->toDateString();
            $row = $rows[$d] ?? null;
            $days[] = [
                'day'   => today()->subDays($i)->locale('fr')->isoFormat('ddd'),
                'total' => (float)($row?->total ?? 0),
                'count' => (int)($row?->count ?? 0),
            ];
        }
        return $days;
    }
}
