<?php

namespace App\Services;

use App\Models\Courier;
use App\Models\CourierRound;
use App\Models\Product;
use App\Models\StockLevel;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Bilan d'une journée de boulangerie : produit → réparti → vendu (caisse / livreurs)
 * → invendus, avec les manquants livreurs et les commandes clients.
 *
 * « Vendu livreurs » = tournées clôturées ce jour-là (le livreur déclare ses ventes au retour).
 */
class BakeryDashboardService
{
    public function day(int $storeId, Carbon $date): array
    {
        $day = $date->toDateString();

        // ── Production ───────────────────────────────────────────────────────
        $produced = DB::table('production_orders')
            ->where('store_id', $storeId)->where('status', 'completed')->whereDate('produced_at', $day)
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(qty_produced) AS qty, SUM(qty_produced - qty_allocated) AS pending, SUM(total_cost) AS cost')
            ->get()->keyBy('product_id');

        $allocated = DB::table('distribution_movements')
            ->where('store_id', $storeId)->where('source', 'production')->whereDate('created_at', $day)
            ->groupBy('product_id', 'destination')
            ->selectRaw('product_id, destination, SUM(qty) AS qty')
            ->get()->groupBy('product_id');

        // ── Ventes ───────────────────────────────────────────────────────────
        $sales = DB::table('sales')->where('store_id', $storeId)->where('status', 'completed')->whereDate('created_at', $day);

        $posSold = DB::table('sale_items')
            ->joinSub((clone $sales)->where('channel', '!=', 'delivery')->select('id'), 's', 's.id', '=', 'sale_items.sale_id')
            ->whereNotNull('sale_items.product_id')
            ->groupBy('sale_items.product_id')
            ->selectRaw('sale_items.product_id, SUM(sale_items.qty) AS qty, SUM(sale_items.total_ttc) AS amount')
            ->get()->keyBy('product_id');

        $revenueByChannel = (clone $sales)->groupBy('channel')->selectRaw('channel, SUM(total_ttc) AS total, COUNT(*) AS n')->get()->keyBy('channel');

        $rounds = CourierRound::with(['items', 'courier:id,name'])
            ->where('store_id', $storeId)->where('status', 'settled')->whereDate('settled_at', $day)
            ->get();
        $courierSold = [];
        foreach ($rounds as $round) {
            foreach ($round->items as $item) {
                $courierSold[$item->product_id] = ($courierSold[$item->product_id] ?? 0) + $item->qty_given - $item->qty_returned;
            }
        }

        // ── Invendus ─────────────────────────────────────────────────────────
        $unsold = DB::table('unsold_report_lines')
            ->join('unsold_reports', 'unsold_reports.id', '=', 'unsold_report_lines.unsold_report_id')
            ->where('unsold_reports.store_id', $storeId)->whereDate('unsold_reports.report_date', $day)
            ->groupBy('unsold_report_lines.product_id')
            ->selectRaw('unsold_report_lines.product_id, SUM(unsold_report_lines.qty) AS qty, SUM(unsold_report_lines.total_cost) AS cost')
            ->get()->keyBy('product_id');

        // ── Détail par produit (produits fabriqués, vendus ou rendus ce jour) ──
        $productIds = collect([$produced->keys(), $posSold->keys(), array_keys($courierSold), $unsold->keys()])->flatten()->unique();
        $products = Product::whereIn('id', $productIds)->where('product_kind', 'finished')
            ->with('unit:id,abbreviation')->orderBy('name')->get();
        $stock = StockLevel::where('store_id', $storeId)->whereIn('product_id', $productIds)->pluck('qty_on_hand', 'product_id');

        $byProduct = $products->map(function (Product $p) use ($produced, $allocated, $posSold, $courierSold, $unsold, $stock) {
            $alloc = collect($allocated->get($p->id, []))->pluck('qty', 'destination');
            return [
                'product_id'   => $p->id,
                'name'         => $p->name,
                'unit'         => $p->unit?->abbreviation,
                'produced'     => (float) ($produced[$p->id]->qty ?? 0),
                'to_pos'       => (float) ($alloc['pos'] ?? 0),
                'to_couriers'  => (float) ($alloc['courier'] ?? 0),
                'pending'      => (float) ($produced[$p->id]->pending ?? 0),
                'sold_pos'     => (float) ($posSold[$p->id]->qty ?? 0),
                'sold_couriers'=> (float) ($courierSold[$p->id] ?? 0),
                'unsold'       => (float) ($unsold[$p->id]->qty ?? 0),
                'stock_pos'    => (float) ($stock[$p->id] ?? 0),
            ];
        })->values();

        // ── Livreurs ─────────────────────────────────────────────────────────
        $couriers = Courier::where('store_id', $storeId)->where('is_active', true)->orderBy('name')->get()
            ->map(function (Courier $c) use ($rounds, $storeId) {
                $settled = $rounds->where('courier_id', $c->id);
                $open = CourierRound::with('items')->where('store_id', $storeId)->where('courier_id', $c->id)->where('status', 'open')->first();
                return [
                    'id'          => $c->id,
                    'name'        => $c->name,
                    'in_round'    => $open ? round($open->items->sum(fn ($i) => $i->qty_given - $i->qty_returned), 3) : 0,
                    'sold'        => round($settled->sum(fn ($r) => $r->items->sum(fn ($i) => $i->qty_given - $i->qty_returned)), 3),
                    'returned'    => round($settled->sum(fn ($r) => $r->items->sum('qty_returned')), 3),
                    'amount_due'  => round($settled->sum('amount_due'), 2),
                    'amount_paid' => round($settled->sum('amount_paid'), 2),
                    'debt'        => $c->debt(),
                ];
            })->values();

        $producedQty = (float) $produced->sum('qty');
        $unsoldQty   = (float) $unsold->sum('qty');
        $orders      = DB::table('customer_orders')->where('store_id', $storeId);

        return [
            'date'    => $day,
            'summary' => [
                'produced_qty'      => $producedQty,
                'production_cost'   => round((float) $produced->sum('cost'), 2),
                'to_pos'            => (float) $byProduct->sum('to_pos'),
                'to_couriers'       => (float) $byProduct->sum('to_couriers'),
                'pending_qty'       => (float) $produced->sum('pending'),
                // Toutes productions confondues : un reliquat de la veille reste à traiter
                'pending_all_qty'   => (float) DB::table('production_orders')->where('store_id', $storeId)->where('status', 'completed')
                    ->selectRaw('COALESCE(SUM(qty_produced - qty_allocated), 0) AS q')->value('q'),
                'sold_pos_qty'      => (float) $byProduct->sum('sold_pos'),
                'sold_couriers_qty' => (float) $byProduct->sum('sold_couriers'),
                'unsold_qty'        => $unsoldQty,
                'unsold_cost'       => round((float) $unsold->sum('cost'), 2),
                'unsold_rate'       => $producedQty > 0 ? round($unsoldQty / $producedQty * 100, 1) : null,
                'revenue_total'     => round((float) $revenueByChannel->sum('total'), 2),
                'revenue_couriers'  => round((float) ($revenueByChannel['delivery']->total ?? 0), 2),
                'revenue_counter'   => round((float) $revenueByChannel->except('delivery')->sum('total'), 2),
                'couriers_gap_day'  => round($rounds->sum(fn ($r) => max(0, $r->amount_due - $r->amount_paid)), 2),
                'couriers_debt'     => round($couriers->sum('debt'), 2),
                'orders_pickup'     => (clone $orders)->whereIn('status', ['pending', 'in_production', 'ready'])->whereDate('pickup_at', $day)->count(),
                'orders_delivered'  => (clone $orders)->where('status', 'delivered')->whereDate('delivered_at', $day)->count(),
            ],
            'products' => $byProduct,
            'couriers' => $couriers,
        ];
    }
}
