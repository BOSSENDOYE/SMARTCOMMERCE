<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantItem;
use App\Models\RecipeIngredient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RestaurantItemController extends Controller
{
    // ── Liste du menu ────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $query = RestaurantItem::with(['station:id,name,type'])
            ->where('store_id', $storeId);

        if ($request->filled('course')) {
            $query->where('course', $request->course);
        }
        if ($request->filled('station_id')) {
            $query->where('station_id', $request->station_id);
        }
        if ($request->filled('available')) {
            $query->where('is_available', $request->boolean('available'));
        }
        if ($request->filled('active')) {
            $query->where('is_active', $request->boolean('active'));
        } else {
            $query->where('is_active', true);
        }
        if ($request->filled('search')) {
            $q = '%' . $request->search . '%';
            $query->where('name', 'ilike', $q);
        }

        $items = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json($items);
    }

    // ── Stats du menu ────────────────────────────────────────────────────────
    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;

        $total      = RestaurantItem::where('store_id', $storeId)->where('is_active', true)->count();
        $available  = RestaurantItem::where('store_id', $storeId)->where('is_active', true)->where('is_available', true)->count();
        $avgPrice   = RestaurantItem::where('store_id', $storeId)->where('is_active', true)->avg('price_ttc') ?? 0;

        $byCourse = RestaurantItem::where('store_id', $storeId)
            ->where('is_active', true)
            ->selectRaw('course, COUNT(*) as count')
            ->groupBy('course')
            ->pluck('count', 'course');

        return response()->json([
            'total'     => $total,
            'available' => $available,
            'avg_price' => round((float) $avgPrice, 2),
            'by_course' => $byCourse,
        ]);
    }

    // ── Créer un article ─────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'                    => 'required|string|max:150',
            'description'             => 'nullable|string',
            'station_id'              => 'nullable|exists:production_stations,id',
            'course'                  => 'required|in:starter,main,dessert,drink,other',
            'price_ht'                => 'required|numeric|min:0',
            'vat_rate'                => 'nullable|numeric|min:0|max:100',
            'cost_price'              => 'nullable|numeric|min:0',
            'preparation_time_minutes'=> 'nullable|integer|min:0',
            'is_available'            => 'boolean',
            'sort_order'              => 'nullable|integer',
            'notes'                   => 'nullable|string',
        ]);

        $vatRate  = $data['vat_rate'] ?? 0;
        $priceHt  = $data['price_ht'];
        $priceTtc = round($priceHt * (1 + $vatRate / 100), 2);

        $item = RestaurantItem::create(array_merge($data, [
            'store_id'  => $request->user()->store_id,
            'vat_rate'  => $vatRate,
            'price_ttc' => $priceTtc,
        ]));

        return response()->json($item->load('station:id,name,type'), 201);
    }

    // ── Détail d'un article ──────────────────────────────────────────────────
    public function show(RestaurantItem $restaurantItem)
    {
        return response()->json(
            $restaurantItem->load([
                'station:id,name,type',
                'recipeIngredients.ingredient:id,name,unit_id',
                'recipeIngredients.unit:id,name,symbol',
            ])
        );
    }

    // ── Modifier un article ──────────────────────────────────────────────────
    public function update(Request $request, RestaurantItem $restaurantItem)
    {
        $data = $request->validate([
            'name'                    => 'sometimes|string|max:150',
            'description'             => 'nullable|string',
            'station_id'              => 'nullable|exists:production_stations,id',
            'course'                  => 'sometimes|in:starter,main,dessert,drink,other',
            'price_ht'                => 'sometimes|numeric|min:0',
            'vat_rate'                => 'nullable|numeric|min:0|max:100',
            'cost_price'              => 'nullable|numeric|min:0',
            'preparation_time_minutes'=> 'nullable|integer|min:0',
            'is_available'            => 'sometimes|boolean',
            'is_active'               => 'sometimes|boolean',
            'sort_order'              => 'nullable|integer',
            'notes'                   => 'nullable|string',
        ]);

        // Recalcul TTC si prix HT ou TVA change
        $priceHt  = $data['price_ht']  ?? $restaurantItem->price_ht;
        $vatRate  = $data['vat_rate']  ?? $restaurantItem->vat_rate;
        $data['price_ttc'] = round($priceHt * (1 + $vatRate / 100), 2);

        $restaurantItem->update($data);

        return response()->json($restaurantItem->fresh()->load('station:id,name,type'));
    }

    // ── Supprimer (désactiver) ───────────────────────────────────────────────
    public function destroy(RestaurantItem $restaurantItem)
    {
        $restaurantItem->update(['is_active' => false]);
        return response()->json(null, 204);
    }

    // ── Basculer disponibilité ───────────────────────────────────────────────
    public function toggleAvailability(RestaurantItem $restaurantItem)
    {
        $restaurantItem->update(['is_available' => !$restaurantItem->is_available]);
        return response()->json(['is_available' => $restaurantItem->is_available]);
    }

    // ── Upload image ─────────────────────────────────────────────────────────
    public function uploadImage(Request $request, RestaurantItem $restaurantItem)
    {
        $request->validate(['image' => 'required|image|max:2048']);

        if ($restaurantItem->image && str_starts_with($restaurantItem->image, '/storage/')) {
            Storage::delete(str_replace('/storage/', 'public/', $restaurantItem->image));
        }

        $path = $request->file('image')->store('restaurant/items', 'public');
        $restaurantItem->update(['image' => Storage::url($path)]);

        return response()->json(['image' => $restaurantItem->image]);
    }

    // ── Gérer la recette d'un plat ───────────────────────────────────────────
    public function syncRecipe(Request $request, RestaurantItem $restaurantItem)
    {
        $data = $request->validate([
            'ingredients'              => 'required|array',
            'ingredients.*.ingredient_id' => 'required|exists:products,id',
            'ingredients.*.unit_id'    => 'nullable|exists:units,id',
            'ingredients.*.quantity'   => 'required|numeric|min:0.001',
            'ingredients.*.is_optional'=> 'boolean',
        ]);

        // Remplacer toute la recette
        $restaurantItem->recipeIngredients()->delete();

        foreach ($data['ingredients'] as $line) {
            RecipeIngredient::create([
                'restaurant_item_id' => $restaurantItem->id,
                'ingredient_id'      => $line['ingredient_id'],
                'unit_id'            => $line['unit_id'] ?? null,
                'quantity'           => $line['quantity'],
                'is_optional'        => $line['is_optional'] ?? false,
            ]);
        }

        return response()->json(
            $restaurantItem->fresh()->load([
                'recipeIngredients.ingredient:id,name',
                'recipeIngredients.unit:id,name,symbol',
            ])
        );
    }

    // ── Stations de production disponibles ───────────────────────────────────
    public function stations(Request $request)
    {
        $stations = \App\Models\ProductionStation::where('store_id', $request->user()->store_id)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'type']);

        return response()->json($stations);
    }
}
