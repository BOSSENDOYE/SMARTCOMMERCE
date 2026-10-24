<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductionOrder;
use App\Models\ProductionPlan;
use App\Models\StockLevel;
use App\Models\UnsoldReport;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Production boulangerie : recette (par fournée) → consommation des matières
 * premières (production_consumption). Les produits finis restent « en attente de
 * répartition » : ils n'entrent en stock POS (production_in) qu'une fois affectés
 * au point de vente par DistributionService.
 */
class ProductionService
{
    public function __construct(private StockService $stock) {}

    /**
     * Besoins en matières premières pour N fournées, avec coût et stock disponible.
     * Coût d'une matière = avg_cost du stock, sinon prix d'achat HT du produit.
     */
    public function requirements(Product $product, int $storeId, float $batches = 1): Collection
    {
        $product->loadMissing('recipeIngredients.ingredient.unit');

        $levels = StockLevel::where('store_id', $storeId)
            ->whereIn('product_id', $product->recipeIngredients->pluck('ingredient_id'))
            ->get()
            ->keyBy('product_id');

        return $product->recipeIngredients->map(function ($line) use ($levels, $batches) {
            $level     = $levels->get($line->ingredient_id);
            $unitCost  = (float) ($level?->avg_cost ?: $line->ingredient?->purchase_price_ht ?: 0);
            $qty       = round($line->quantity * $batches, 4);
            $available = (float) ($level?->qty_on_hand ?? 0);

            return [
                'ingredient_id' => $line->ingredient_id,
                'name'          => $line->ingredient?->name,
                'unit'          => $line->ingredient?->unit?->abbreviation,
                'qty'           => $qty,
                'unit_cost'     => round($unitCost, 4),
                'total_cost'    => round($qty * $unitCost, 2),
                'available'     => $available,
                'shortage'      => max(0, round($qty - $available, 4)),
            ];
        })->values();
    }

    /** Coût de revient d'une fournée et d'une unité produite. */
    public function recipeCost(Product $product, int $storeId): array
    {
        $batchCost = (float) $this->requirements($product, $storeId)->sum('total_cost');
        $yield     = max(0.001, (float) $product->recipe_yield);
        $unitCost  = round($batchCost / $yield, 2);
        $price     = (float) $product->sale_price_ttc;

        return [
            'batch_cost'  => round($batchCost, 2),
            'unit_cost'   => $unitCost,
            'margin'      => round($price - $unitCost, 2),
            'margin_rate' => $price > 0 ? round(($price - $unitCost) / $price * 100, 1) : null,
        ];
    }

    public function produce(Product $product, int $storeId, int $userId, float $batches, ?string $notes = null, bool $allowShortage = false): ProductionOrder
    {
        if ($product->recipeIngredients()->count() === 0) {
            throw ValidationException::withMessages(['product_id' => "« {$product->name} » n'a pas de recette."]);
        }

        return DB::transaction(function () use ($product, $storeId, $userId, $batches, $notes, $allowShortage) {
            $needs = $this->requirements($product, $storeId, $batches);

            $shortages = $needs->where('shortage', '>', 0)->values();
            if ($shortages->isNotEmpty() && ! $allowShortage) {
                throw ValidationException::withMessages([
                    'shortages' => $shortages->map(fn ($s) => "{$s['name']} : manque {$s['shortage']} {$s['unit']}")->all(),
                ]);
            }

            $qtyProduced = round($batches * (float) $product->recipe_yield, 3);
            $totalCost   = round((float) $needs->sum('total_cost'), 2);
            $unitCost    = $qtyProduced > 0 ? round($totalCost / $qtyProduced, 4) : 0;

            $order = ProductionOrder::create([
                'store_id'     => $storeId,
                'product_id'   => $product->id,
                'user_id'      => $userId,
                'reference'    => $this->nextReference(),
                'batches'      => $batches,
                'qty_produced' => $qtyProduced,
                'qty_allocated' => 0,
                'unit_cost'    => $unitCost,
                'total_cost'   => $totalCost,
                'status'       => 'completed',
                'notes'        => $notes,
                'produced_at'  => now(),
            ]);

            foreach ($needs as $need) {
                $order->lines()->create([
                    'ingredient_id' => $need['ingredient_id'],
                    'qty'           => $need['qty'],
                    'unit_cost'     => $need['unit_cost'],
                    'total_cost'    => $need['total_cost'],
                ]);

                $this->stock->move(
                    $storeId, $need['ingredient_id'], 'production_consumption', $need['qty'], $need['unit_cost'],
                    null, $userId, 'production_orders', $order->id, $order->reference
                );
            }

            return $order;
        });
    }

    /**
     * Annule une production : restitue les matières premières et retire du stock POS
     * la part déjà affectée au point de vente. Refusé si une part a été confiée à un livreur.
     */
    public function cancel(ProductionOrder $order, int $userId): ProductionOrder
    {
        if ($order->status !== 'completed') {
            throw ValidationException::withMessages(['status' => 'Cette production est déjà annulée.']);
        }

        $toCouriers = $order->distributions()->where('source', 'production')->where('destination', 'courier')->exists();
        if ($toCouriers) {
            throw ValidationException::withMessages(['status' => 'Une partie de cette production a été confiée à des livreurs : annulation impossible.']);
        }

        return DB::transaction(function () use ($order, $userId) {
            $note  = "Annulation {$order->reference}";
            $toPos = (float) $order->distributions()->where('source', 'production')->where('destination', 'pos')->sum('qty');

            if ($toPos > 0) {
                $this->stock->move(
                    $order->store_id, $order->product_id, 'adjustment_out', $toPos, $order->unit_cost,
                    null, $userId, 'production_orders', $order->id, 'production_cancelled', $note
                );
            }

            foreach ($order->lines as $line) {
                $this->stock->move(
                    $order->store_id, $line->ingredient_id, 'adjustment_in', $line->qty, 0,
                    null, $userId, 'production_orders', $order->id, 'production_cancelled', $note
                );
            }

            $order->update([
                'status'       => 'cancelled',
                'cancelled_by' => $userId,
                'cancelled_at' => now(),
            ]);

            return $order;
        });
    }

    // ── Planning ─────────────────────────────────────────────────────────────

    /**
     * Plan de production d'une journée : prévision par produit fini + lignes enregistrées.
     * Prévision = moyenne des ventes du même jour de semaine (4 dernières semaines),
     * à défaut moyenne des 7 derniers jours, + commandes clients à retirer ce jour-là.
     * Le stock restant n'est pas déduit : les produits frais se fabriquent chaque jour.
     */
    public function plan(int $storeId, Carbon $date): array
    {
        $recipes = Product::forStore($storeId)
            ->where('is_recipe', true)
            ->with(['unit:id,abbreviation', 'stockLevel' => fn ($q) => $q->where('store_id', $storeId)])
            ->orderBy('name')
            ->get();
        $ids = $recipes->pluck('id');

        $sameWeekdays = collect(range(1, 4))->map(fn ($w) => $date->copy()->subWeeks($w)->toDateString());
        $last7From    = $date->copy()->subDays(7)->toDateString();
        $last7To      = $date->copy()->subDay()->toDateString();

        $sales = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.store_id', $storeId)
            ->where('sales.status', 'completed')
            ->whereIn('sale_items.product_id', $ids)
            ->where(fn ($q) => $q
                ->whereIn(DB::raw('DATE(sales.created_at)'), $sameWeekdays)
                ->orWhereBetween(DB::raw('DATE(sales.created_at)'), [$last7From, $last7To]))
            ->selectRaw('sale_items.product_id, DATE(sales.created_at) as day, SUM(sale_items.qty) as qty')
            ->groupBy('sale_items.product_id', DB::raw('DATE(sales.created_at)'))
            ->get()
            ->groupBy('product_id');

        $orders = DB::table('customer_order_items')
            ->join('customer_orders', 'customer_orders.id', '=', 'customer_order_items.customer_order_id')
            ->where('customer_orders.store_id', $storeId)
            ->whereIn('customer_orders.status', ['pending', 'in_production'])
            ->whereDate('customer_orders.pickup_at', $date->toDateString())
            ->groupBy('customer_order_items.product_id')
            ->selectRaw('customer_order_items.product_id, SUM(customer_order_items.qty) as qty')
            ->pluck('qty', 'product_id');

        $saved = ProductionPlan::where('store_id', $storeId)
            ->whereDate('plan_date', $date->toDateString())
            ->with('productionOrder:id,reference,status,qty_produced')
            ->get()
            ->keyBy('product_id');

        $lines = $recipes->map(function (Product $p) use ($sales, $orders, $saved, $sameWeekdays, $last7From, $last7To) {
            $days       = collect($sales->get($p->id, []))->mapWithKeys(fn ($r) => [substr((string) $r->day, 0, 10) => (float) $r->qty]);
            $avgWeekday = round($sameWeekdays->sum(fn ($d) => $days->get($d, 0)) / 4, 1);
            $avg7       = round($days->filter(fn ($q, $d) => $d >= $last7From && $d <= $last7To)->sum() / 7, 1);
            $ordersQty  = (float) ($orders[$p->id] ?? 0);
            $yield      = max(0.001, (float) $p->recipe_yield);

            $suggestedQty     = ceil($avgWeekday > 0 ? $avgWeekday : $avg7) + $ordersQty;
            $suggestedBatches = $suggestedQty > 0 ? ceil($suggestedQty / $yield * 2) / 2 : 0;
            $plan             = $saved->get($p->id);

            return [
                'product_id'        => $p->id,
                'name'              => $p->name,
                'unit'              => $p->unit?->abbreviation,
                'recipe_yield'      => (float) $p->recipe_yield,
                'stock'             => (float) ($p->stockLevel?->qty_on_hand ?? 0),
                'avg_same_weekday'  => $avgWeekday,
                'avg_7_days'        => $avg7,
                'orders_qty'        => $ordersQty,
                'suggested_qty'     => $suggestedQty,
                'suggested_batches' => $suggestedBatches,
                'plan'              => $plan ? [
                    'id'               => $plan->id,
                    'planned_batches'  => $plan->planned_batches,
                    'planned_qty'      => round($plan->planned_batches * $yield, 3),
                    'production_order' => $plan->productionOrder,
                ] : null,
            ];
        })->values();

        return [
            'date'      => $date->toDateString(),
            'lines'     => $lines,
            'materials' => $this->planMaterials($storeId, $saved->whereNull('production_order_id'), $recipes->keyBy('id')),
        ];
    }

    /** Matières premières nécessaires pour les lignes de plan non encore produites. */
    private function planMaterials(int $storeId, Collection $plans, Collection $recipes): Collection
    {
        $totals = [];
        foreach ($plans as $plan) {
            $product = $recipes->get($plan->product_id);
            if (! $product) continue;
            foreach ($this->requirements($product, $storeId, $plan->planned_batches) as $need) {
                $id = $need['ingredient_id'];
                $totals[$id] ??= ['ingredient_id' => $id, 'name' => $need['name'], 'unit' => $need['unit'], 'qty' => 0, 'available' => $need['available'], 'total_cost' => 0];
                $totals[$id]['qty']        += $need['qty'];
                $totals[$id]['total_cost'] += $need['total_cost'];
            }
        }

        return collect($totals)->map(fn ($t) => array_merge($t, [
            'qty'        => round($t['qty'], 4),
            'total_cost' => round($t['total_cost'], 2),
            'shortage'   => max(0, round($t['qty'] - $t['available'], 4)),
        ]))->sortBy('name')->values();
    }

    public function executePlan(ProductionPlan $plan, int $userId, bool $allowShortage = false): ProductionOrder
    {
        if ($plan->production_order_id) {
            throw ValidationException::withMessages(['plan' => 'Cette ligne du plan a déjà été produite.']);
        }

        return DB::transaction(function () use ($plan, $userId, $allowShortage) {
            $order = $this->produce(
                $plan->product, $plan->store_id, $userId, $plan->planned_batches,
                'Plan du ' . $plan->plan_date->format('d/m/Y'), $allowShortage
            );
            $plan->update(['production_order_id' => $order->id]);

            return $order;
        });
    }

    // ── Invendus ─────────────────────────────────────────────────────────────

    /**
     * Clôture des invendus : sortie de stock (waste_out) au coût moyen.
     * Destination « recycle » : le produit cible (ex. chapelure) entre en stock
     * (production_in) avec le coût des invendus recyclés.
     *
     * @param array $lines [['product_id', 'qty', 'destination', 'target_product_id'?, 'target_qty'?], ...]
     */
    public function recordUnsold(int $storeId, int $userId, Carbon $date, array $lines, ?string $notes = null): UnsoldReport
    {
        return DB::transaction(function () use ($storeId, $userId, $date, $lines, $notes) {
            $report = UnsoldReport::create([
                'store_id'    => $storeId,
                'user_id'     => $userId,
                'reference'   => $this->nextReference(UnsoldReport::class, 'INVD'),
                'report_date' => $date->toDateString(),
                'notes'       => $notes,
            ]);

            $levels = StockLevel::where('store_id', $storeId)
                ->whereIn('product_id', array_column($lines, 'product_id'))
                ->get()->keyBy('product_id');
            $products = Product::whereIn('id', array_column($lines, 'product_id'))->get()->keyBy('id');

            $total = 0;
            foreach ($lines as $line) {
                $level    = $levels->get($line['product_id']);
                $unitCost = (float) ($level?->avg_cost ?: $products[$line['product_id']]->purchase_price_ht ?: 0);
                $lineCost = round($line['qty'] * $unitCost, 2);
                $total   += $lineCost;
                $isRecycle = $line['destination'] === 'recycle' && ! empty($line['target_product_id']) && ($line['target_qty'] ?? 0) > 0;

                $report->lines()->create([
                    'product_id'        => $line['product_id'],
                    'qty'               => $line['qty'],
                    'destination'       => $line['destination'],
                    'unit_cost'         => $unitCost,
                    'total_cost'        => $lineCost,
                    'target_product_id' => $isRecycle ? $line['target_product_id'] : null,
                    'target_qty'        => $isRecycle ? $line['target_qty'] : null,
                ]);

                $this->stock->move(
                    $storeId, $line['product_id'], 'waste_out', $line['qty'], $unitCost,
                    null, $userId, 'unsold_reports', $report->id, 'unsold_' . $line['destination'], $report->reference
                );

                if ($isRecycle) {
                    $this->stock->move(
                        $storeId, $line['target_product_id'], 'production_in', $line['target_qty'],
                        $lineCost / $line['target_qty'],
                        null, $userId, 'unsold_reports', $report->id, 'unsold_recycle', $report->reference
                    );
                }
            }

            $report->update(['total_cost' => round($total, 2)]);

            return $report;
        });
    }

    private function nextReference(string $model = ProductionOrder::class, string $code = 'PROD'): string
    {
        $prefix = $code . now()->format('Ymd');
        $last   = $model::where('reference', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('reference')
            ->value('reference');
        $seq = $last ? (int) substr($last, -4) + 1 : 1;

        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }
}
