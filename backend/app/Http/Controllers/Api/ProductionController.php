<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductionOrder;
use App\Models\ProductionPlan;
use App\Models\RecipeIngredient;
use App\Models\UnsoldReport;
use App\Models\UnsoldReportLine;
use App\Services\ProductionService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Production boulangerie : recettes, ordres de production, planning et invendus.
 */
class ProductionController extends Controller
{
    public function __construct(private ProductionService $production) {}

    // ── Recettes ─────────────────────────────────────────────────────────────

    /** Produits finis ayant une recette, avec coût de revient et marge. */
    public function recipes(Request $request)
    {
        $storeId = $request->user()->store_id;

        $products = Product::forStore($storeId)
            ->where('is_recipe', true)
            ->with([
                'category:id,name',
                'unit:id,abbreviation',
                'stockLevel' => fn ($q) => $q->where('store_id', $storeId),
            ])
            ->withCount('recipeIngredients')
            ->when($request->search, fn ($q, $s) => $q->where('name', 'ilike', "%{$s}%"))
            ->orderBy('name')
            ->get();

        return response()->json($products->map(fn (Product $p) => [
            'id'              => $p->id,
            'name'            => $p->name,
            'internal_code'   => $p->internal_code,
            'category'        => $p->category?->name,
            'unit'            => $p->unit?->abbreviation,
            'sale_price_ttc'  => (float) $p->sale_price_ttc,
            'recipe_yield'    => (float) $p->recipe_yield,
            'ingredients_count' => $p->recipe_ingredients_count,
            'stock'           => (float) ($p->stockLevel?->qty_on_hand ?? 0),
            'cost'            => $this->production->recipeCost($p, $storeId),
        ]));
    }

    public function showRecipe(Request $request, Product $product)
    {
        $storeId = $request->user()->store_id;
        abort_unless($product->store_id == $storeId, 404);

        $batches = max(0.001, (float) ($request->batches ?? 1));

        return response()->json([
            'product' => $product->only(['id', 'name', 'internal_code', 'sale_price_ttc', 'recipe_yield', 'is_recipe']),
            'lines'   => $this->production->requirements($product, $storeId, $batches),
            'cost'    => $this->production->recipeCost($product, $storeId),
        ]);
    }

    public function syncRecipe(Request $request, Product $product)
    {
        $storeId = $request->user()->store_id;
        abort_unless($product->store_id == $storeId, 404);

        $data = $request->validate([
            'recipe_yield'               => 'required|numeric|min:0.001',
            'ingredients'                => 'present|array',
            'ingredients.*.ingredient_id' => 'required|distinct|exists:products,id',
            'ingredients.*.quantity'     => 'required|numeric|min:0.0001',
        ]);

        $ingredientIds = collect($data['ingredients'])->pluck('ingredient_id');
        if ($ingredientIds->contains($product->id)) {
            return response()->json(['message' => 'Un produit ne peut pas être son propre ingrédient.'], 422);
        }
        $foreign = Product::whereIn('id', $ingredientIds)->where('store_id', '!=', $storeId)->exists();
        if ($foreign) {
            return response()->json(['message' => 'Les ingrédients doivent appartenir au magasin courant.'], 422);
        }

        DB::transaction(function () use ($product, $data) {
            $product->recipeIngredients()->delete();

            $units = Product::whereIn('id', collect($data['ingredients'])->pluck('ingredient_id'))->pluck('unit_id', 'id');
            foreach ($data['ingredients'] as $line) {
                RecipeIngredient::create([
                    'product_id'    => $product->id,
                    'ingredient_id' => $line['ingredient_id'],
                    'unit_id'       => $units[$line['ingredient_id']] ?? null,
                    'quantity'      => $line['quantity'],
                ]);
            }

            $product->update([
                'recipe_yield' => $data['recipe_yield'],
                'is_recipe'    => count($data['ingredients']) > 0,
            ]);
        });

        return $this->showRecipe($request, $product->fresh());
    }

    // ── Productions ──────────────────────────────────────────────────────────

    public function stats(Request $request)
    {
        $base = ProductionOrder::where('store_id', $request->user()->store_id)->where('status', 'completed');

        $today = (clone $base)->whereDate('produced_at', today());
        $month = (clone $base)->whereBetween('produced_at', [now()->startOfMonth(), now()->endOfMonth()]);

        $unsold      = UnsoldReport::where('store_id', $request->user()->store_id);
        $monthQty    = (float) (clone $month)->sum('qty_produced');
        $unsoldQty   = (float) UnsoldReportLine::whereIn('unsold_report_id', (clone $unsold)
                ->whereBetween('report_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                ->select('id'))
            ->sum('qty');

        return response()->json([
            'today_count'       => (clone $today)->count(),
            'today_qty'         => (float) (clone $today)->sum('qty_produced'),
            'today_cost'        => (float) (clone $today)->sum('total_cost'),
            'month_cost'        => (float) (clone $month)->sum('total_cost'),
            'recipes_count'     => Product::forStore($request->user()->store_id)->where('is_recipe', true)->count(),
            'unsold_month_cost' => (float) (clone $unsold)
                ->whereBetween('report_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
                ->sum('total_cost'),
            'unsold_rate'       => $monthQty > 0 ? round($unsoldQty / $monthQty * 100, 1) : null,
        ]);
    }

    // ── Planning ─────────────────────────────────────────────────────────────

    public function plan(Request $request)
    {
        $date = $request->date ? Carbon::parse($request->date) : today()->addDay();

        return response()->json($this->production->plan($request->user()->store_id, $date->startOfDay()));
    }

    public function savePlan(Request $request)
    {
        $storeId = $request->user()->store_id;

        $data = $request->validate([
            'date'                    => 'required|date',
            'lines'                   => 'present|array',
            'lines.*.product_id'      => 'required|distinct|exists:products,id',
            'lines.*.planned_batches' => 'required|numeric|min:0',
        ]);

        $date = Carbon::parse($data['date'])->toDateString();
        $ids  = collect($data['lines'])->pluck('product_id');
        if (Product::whereIn('id', $ids)->where('store_id', '!=', $storeId)->exists()) {
            return response()->json(['message' => 'Produits invalides pour ce magasin.'], 422);
        }

        DB::transaction(function () use ($data, $storeId, $date, $request) {
            foreach ($data['lines'] as $line) {
                $existing = ProductionPlan::where('store_id', $storeId)
                    ->whereDate('plan_date', $date)
                    ->where('product_id', $line['product_id'])
                    ->first();

                // Une ligne déjà produite n'est plus modifiable
                if ($existing?->production_order_id) continue;

                if ((float) $line['planned_batches'] <= 0) {
                    $existing?->delete();
                    continue;
                }

                if ($existing) {
                    $existing->update(['planned_batches' => $line['planned_batches'], 'user_id' => $request->user()->id]);
                } else {
                    ProductionPlan::create([
                        'store_id'        => $storeId,
                        'product_id'      => $line['product_id'],
                        'user_id'         => $request->user()->id,
                        'plan_date'       => $date,
                        'planned_batches' => $line['planned_batches'],
                    ]);
                }
            }
        });

        return response()->json($this->production->plan($storeId, Carbon::parse($date)));
    }

    public function executePlan(Request $request, ProductionPlan $productionPlan)
    {
        abort_unless($productionPlan->store_id == $request->user()->store_id, 404);

        $order = $this->production->executePlan(
            $productionPlan->load('product'), $request->user()->id, $request->boolean('allow_shortage')
        );

        return response()->json($order->load(['product:id,name,internal_code,sale_price_ttc,courier_price,unit_id', 'product.unit:id,abbreviation']), 201);
    }

    // ── Invendus ─────────────────────────────────────────────────────────────

    /** Produits finis encore en stock — base de la saisie des invendus. */
    public function unsoldPrefill(Request $request)
    {
        $storeId = $request->user()->store_id;

        $products = Product::forStore($storeId)
            ->where('is_recipe', true)
            ->with(['unit:id,abbreviation', 'stockLevel' => fn ($q) => $q->where('store_id', $storeId)])
            ->orderBy('name')
            ->get()
            ->map(fn (Product $p) => [
                'product_id' => $p->id,
                'name'       => $p->name,
                'unit'       => $p->unit?->abbreviation,
                'stock'      => (float) ($p->stockLevel?->qty_on_hand ?? 0),
                'unit_cost'  => (float) ($p->stockLevel?->avg_cost ?: $p->purchase_price_ht),
            ]);

        return response()->json($products->filter(fn ($p) => $p['stock'] > 0)->values());
    }

    public function unsoldIndex(Request $request)
    {
        return response()->json(
            UnsoldReport::with(['user:id,name', 'lines.product:id,name', 'lines.targetProduct:id,name'])
                ->where('store_id', $request->user()->store_id)
                ->when($request->date_from, fn ($q, $d) => $q->whereDate('report_date', '>=', $d))
                ->when($request->date_to, fn ($q, $d) => $q->whereDate('report_date', '<=', $d))
                ->orderByDesc('report_date')->orderByDesc('id')
                ->paginate((int) ($request->per_page ?? 20))
        );
    }

    public function storeUnsold(Request $request)
    {
        $storeId = $request->user()->store_id;

        $data = $request->validate([
            'date'                      => 'required|date',
            'notes'                     => 'nullable|string|max:500',
            'lines'                     => 'required|array|min:1',
            'lines.*.product_id'        => 'required|distinct|exists:products,id',
            'lines.*.qty'               => 'required|numeric|min:0.001',
            'lines.*.destination'       => 'required|in:waste,donation,staff,recycle',
            'lines.*.target_product_id' => 'nullable|required_with:lines.*.target_qty|exists:products,id',
            'lines.*.target_qty'        => 'nullable|numeric|min:0.001',
        ]);

        $ids = collect($data['lines'])->flatMap(fn ($l) => array_filter([$l['product_id'], $l['target_product_id'] ?? null]));
        if (Product::whereIn('id', $ids)->where('store_id', '!=', $storeId)->exists()) {
            return response()->json(['message' => 'Produits invalides pour ce magasin.'], 422);
        }

        $report = $this->production->recordUnsold(
            $storeId, $request->user()->id, Carbon::parse($data['date']), $data['lines'], $data['notes'] ?? null
        );

        return response()->json($report->load(['lines.product:id,name', 'lines.targetProduct:id,name']), 201);
    }

    public function index(Request $request)
    {
        $query = ProductionOrder::with(['product:id,name,internal_code,sale_price_ttc,courier_price,unit_id', 'product.unit:id,abbreviation', 'user:id,name'])
            ->where('store_id', $request->user()->store_id);

        if ($request->status) {
            $query->where('status', $request->status);
        }
        if ($request->date_from) {
            $query->whereDate('produced_at', '>=', $request->date_from);
        }
        if ($request->date_to) {
            $query->whereDate('produced_at', '<=', $request->date_to);
        }
        if ($request->search) {
            $query->where(fn ($q) => $q
                ->where('reference', 'ilike', "%{$request->search}%")
                ->orWhereHas('product', fn ($p) => $p->where('name', 'ilike', "%{$request->search}%"))
            );
        }

        return response()->json(
            $query->orderByDesc('produced_at')->paginate((int) ($request->per_page ?? 20))
        );
    }

    public function show(Request $request, ProductionOrder $productionOrder)
    {
        abort_unless($productionOrder->store_id == $request->user()->store_id, 404);

        return response()->json($productionOrder->load([
            'product:id,name,internal_code', 'user:id,name', 'canceller:id,name',
            'lines.ingredient:id,name,unit_id', 'lines.ingredient.unit:id,abbreviation',
        ]));
    }

    public function store(Request $request)
    {
        $storeId = $request->user()->store_id;

        $data = $request->validate([
            'product_id'     => 'required|exists:products,id',
            'batches'        => 'required|numeric|min:0.001',
            'notes'          => 'nullable|string|max:500',
            'allow_shortage' => 'boolean',
        ]);

        $product = Product::forStore($storeId)->findOrFail($data['product_id']);

        $order = $this->production->produce(
            $product, $storeId, $request->user()->id,
            (float) $data['batches'], $data['notes'] ?? null, (bool) ($data['allow_shortage'] ?? false)
        );

        return response()->json($order->load(['product:id,name,internal_code,sale_price_ttc,courier_price,unit_id', 'product.unit:id,abbreviation', 'user:id,name', 'lines']), 201);
    }

    public function cancel(Request $request, ProductionOrder $productionOrder)
    {
        abort_unless($productionOrder->store_id == $request->user()->store_id, 404);

        $order = $this->production->cancel($productionOrder->load('lines'), $request->user()->id);

        return response()->json($order->load(['product:id,name,internal_code', 'user:id,name']));
    }
}
