<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    private function dateRange(Request $request): array
    {
        return [
            $request->input('date_from', now()->startOfMonth()->toDateString()),
            $request->input('date_to', now()->toDateString()),
        ];
    }

    public function salesByProduct(Request $request)
    {
        [$from, $to] = $this->dateRange($request);
        $data = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->where('sales.store_id', $this->storeId($request))
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                'products.id',
                'products.internal_code',
                'products.name',
                DB::raw('SUM(sale_items.qty) as total_qty'),
                DB::raw('SUM(sale_items.total_ttc) as total_ttc'),
                DB::raw('SUM(sale_items.margin_amount) as total_margin')
            )
            ->groupBy('products.id', 'products.internal_code', 'products.name')
            ->orderByDesc('total_ttc')
            ->limit(100)
            ->get();

        return response()->json(['data' => $data, 'period' => compact('from', 'to')]);
    }

    public function salesByCashier(Request $request)
    {
        [$from, $to] = $this->dateRange($request);
        $data = DB::table('sales')
            ->join('users', 'users.id', '=', 'sales.user_id')
            ->where('sales.store_id', $this->storeId($request))
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                'users.id',
                'users.name',
                DB::raw('COUNT(*) as nb_sales'),
                DB::raw('SUM(sales.total_ttc) as total_ttc'),
                DB::raw('AVG(sales.total_ttc) as avg_basket')
            )
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('total_ttc')
            ->get();

        return response()->json(['data' => $data, 'period' => compact('from', 'to')]);
    }

    public function salesByCategory(Request $request)
    {
        [$from, $to] = $this->dateRange($request);
        $data = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('sales.store_id', $this->storeId($request))
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                DB::raw("COALESCE(categories.name, 'Sans catégorie') as category_name"),
                DB::raw('SUM(sale_items.qty) as total_qty'),
                DB::raw('SUM(sale_items.total_ttc) as total_ttc')
            )
            ->groupBy('categories.name')
            ->orderByDesc('total_ttc')
            ->get();

        return response()->json(['data' => $data, 'period' => compact('from', 'to')]);
    }

    public function paymentMethods(Request $request)
    {
        [$from, $to] = $this->dateRange($request);
        $data = DB::table('sale_payments')
            ->join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.store_id', $this->storeId($request))
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                DB::raw('sale_payments.payment_method as method'),
                DB::raw('COUNT(*) as nb_transactions'),
                DB::raw('SUM(sale_payments.amount) as total')
            )
            ->groupBy('sale_payments.payment_method')
            ->orderByDesc('total')
            ->get();

        return response()->json(['data' => $data, 'period' => compact('from', 'to')]);
    }

    public function stockValuation(Request $request)
    {
        $data = DB::table('stock_levels')
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('stock_levels.store_id', $this->storeId($request))
            ->whereNull('products.deleted_at')
            ->where('stock_levels.qty_on_hand', '>', 0)
            ->select(
                'products.id',
                'products.internal_code',
                'products.name',
                DB::raw("COALESCE(categories.name, 'Sans catégorie') as category_name"),
                'stock_levels.qty_on_hand',
                'products.purchase_price_ht',
                DB::raw('ROUND(stock_levels.qty_on_hand * products.purchase_price_ht, 2) as purchase_value'),
                'products.sale_price_ttc',
                DB::raw('ROUND(stock_levels.qty_on_hand * products.sale_price_ttc, 2) as sale_value')
            )
            ->orderByDesc(DB::raw('stock_levels.qty_on_hand * products.purchase_price_ht'))
            ->get();

        return response()->json([
            'data'                 => $data,
            'total_purchase_value' => round((float) $data->sum('purchase_value'), 2),
            'total_sale_value'     => round((float) $data->sum('sale_value'),     2),
            'total_value'          => round((float) $data->sum('purchase_value'), 2),
        ]);
    }

    public function supplierBalances(Request $request)
    {
        $data = DB::table('suppliers')
            ->leftJoin('supplier_invoices', 'supplier_invoices.supplier_id', '=', 'suppliers.id')
            ->where(fn($q) => $q->whereNull('suppliers.store_id')->orWhere('suppliers.store_id', $this->storeId($request)))
            ->select(
                'suppliers.id',
                'suppliers.company_name',
                DB::raw('COALESCE(SUM(supplier_invoices.balance_due), 0) as total_balance')
            )
            ->groupBy('suppliers.id', 'suppliers.company_name')
            ->orderByDesc('total_balance')
            ->get();

        return response()->json(['data' => $data]);
    }

    public function clientCredit(Request $request)
    {
        $data = DB::table('clients')
            ->where('store_id', $this->storeId($request))
            ->where('credit_balance', '>', 0)
            ->select('id', 'name', 'phone', 'credit_balance', 'credit_limit', 'loyalty_points')
            ->orderByDesc('credit_balance')
            ->get();

        return response()->json(['data' => $data]);
    }
}
