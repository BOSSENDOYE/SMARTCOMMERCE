<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\ProductContainer;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $products = Product::forStore($storeId)
            ->with([
                'category', 'brand', 'unit', 'barcodes', 'section',
                'stockLevel' => fn($q) => $q->where('store_id', $storeId),
                'priceTiers.clientCategory',
            ])
            ->when($request->search, fn($q) => $q
                ->where(fn($q2) => $q2
                    ->where('name', 'ilike', "%{$request->search}%")
                    ->orWhere('internal_code', 'ilike', "%{$request->search}%")
                    ->orWhereHas('barcodes', fn($q3) => $q3->where('barcode', 'ilike', "%{$request->search}%"))
                )
            )
            ->when($request->category_id, fn($q) => $q->where('category_id', $request->category_id))
            ->when($request->section_id,  fn($q) => $q->where('section_id', $request->section_id))
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->low_stock, fn($q) => $q->whereHas('stockLevel', fn($q2) => $q2
                ->where('store_id', $storeId)
                ->whereRaw('qty_on_hand <= products.alert_stock')
            ))
            // Filtre POS : uniquement les produits avec du stock disponible
            ->when($request->has_stock, fn($q) => $q->whereHas('stockLevel', fn($q2) => $q2
                ->where('store_id', $storeId)
                ->where('qty_on_hand', '>', 0)
            ))
            ->orderBy('name')
            ->paginate($request->per_page ?? 50);

        return response()->json($products);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'              => 'required|string|max:200',
            'short_name'        => 'nullable|string|max:60',
            'category_id'       => 'nullable|exists:categories,id',
            'brand_id'          => 'nullable|exists:brands,id',
            'unit_id'           => 'nullable|exists:units,id',
            'purchase_price_ht' => 'required|numeric|min:0',
            'sale_price_ttc'    => 'required|numeric|min:0',
            'vat_rate'           => 'required|in:0,18',
            'min_stock'          => 'nullable|numeric|min:0',
            'max_stock'          => 'nullable|numeric|min:0',
            'stock_appro'        => 'nullable|numeric|min:0',
            'alert_stock'        => 'nullable|numeric|min:0',
            'is_weight_based'    => 'boolean',
            'price_per_kg'       => 'nullable|numeric|min:0',
            'track_expiry'       => 'boolean',
            'barcodes'                        => 'nullable|array',
            'barcodes.*.barcode'              => 'required_with:barcodes|string',
            'barcodes.*.type'                 => 'required_with:barcodes|in:ean13,ean8,internal,weight_variable',
            'containers'                      => 'nullable|array',
            'containers.*.unit_id'            => 'required|exists:units,id',
            'containers.*.label'              => 'nullable|string|max:100',
            'containers.*.conversion_factor'  => 'nullable|numeric|min:0.0001',
            'containers.*.is_purchase_unit'   => 'boolean',
            'containers.*.is_sale_unit'       => 'boolean',
            'containers.*.is_stock_unit'      => 'boolean',
            'containers.*.price_a'            => 'nullable|numeric|min:0',
            'containers.*.price_b'            => 'nullable|numeric|min:0',
            'containers.*.price_c'            => 'nullable|numeric|min:0',
            'containers.*.barcode'            => 'nullable|string|max:100',
            'section_id'                      => 'nullable|exists:store_sections,id',
            'slot'                            => 'nullable|string|max:100',
            'price_tiers'                     => 'nullable|array',
            'price_tiers.*.client_category_id' => 'required|exists:client_categories,id',
            'price_tiers.*.price'             => 'nullable|numeric|min:0',
        ]);

        $storeId = $request->user()->store_id;
        $code    = 'P' . str_pad(Product::max('id') + 1, 8, '0', STR_PAD_LEFT);

        $containers = $validated['containers'] ?? null;
        $barcodes   = $validated['barcodes'] ?? null;
        $priceTiers = $validated['price_tiers'] ?? null;
        unset($validated['containers'], $validated['barcodes'], $validated['price_tiers']);

        $product = Product::create(array_merge($validated, [
            'store_id'      => $storeId,
            'internal_code' => $code,
        ]));

        // Auto-create stock level so the product is visible in POS (not null = 0)
        \App\Models\StockLevel::firstOrCreate(
            ['store_id' => $storeId, 'product_id' => $product->id],
            [
                'qty_on_hand'  => 0,
                'qty_reserved' => 0,
                'qty_on_order' => 0,
                'avg_cost'     => $product->purchase_price_ht,
                'last_updated' => now(),
            ]
        );

        if (!empty($barcodes)) {
            foreach ($barcodes as $i => $bc) {
                ProductBarcode::create([
                    'product_id' => $product->id,
                    'barcode'    => $bc['barcode'],
                    'type'       => $bc['type'],
                    'is_primary' => $i === 0,
                ]);
            }
        }

        if (!empty($containers)) {
            foreach ($containers as $i => $c) {
                $product->containers()->create(array_merge($c, ['sort_order' => $i]));
            }
        }

        if (!empty($priceTiers)) {
            foreach ($priceTiers as $tier) {
                if (isset($tier['price']) && $tier['price'] !== null) {
                    $product->priceTiers()->updateOrCreate(
                        ['client_category_id' => $tier['client_category_id']],
                        ['price' => $tier['price']]
                    );
                }
            }
        }

        AuditService::log('product_created', 'products', $product->id, $product->toArray());

        return response()->json(
            $product->load(['category', 'brand', 'unit', 'barcodes', 'containers.unit', 'section', 'priceTiers.clientCategory']),
            201
        );
    }

    public function show(Request $request, Product $product)
    {
        return response()->json($product->load([
            'category', 'brand', 'unit', 'barcodes', 'stockLevel', 'section',
            'lots', 'suppliers',
            'containers' => fn($q) => $q->with('unit')->orderBy('sort_order'),
            'priceHistory' => fn($q) => $q->latest()->limit(20),
            'priceTiers.clientCategory',
        ]));
    }

    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $base    = Product::forStore($storeId);

        return response()->json([
            'total'        => (clone $base)->count(),
            'active'       => (clone $base)->where('is_active', true)->count(),
            'low_stock'    => (clone $base)->whereHas('stockLevel', fn($q) => $q
                ->where('store_id', $storeId)
                ->whereRaw('qty_on_hand > 0 AND qty_on_hand <= products.alert_stock')
            )->count(),
            'out_of_stock' => (clone $base)->whereHas('stockLevel', fn($q) => $q
                ->where('store_id', $storeId)
                ->where('qty_on_hand', '<=', 0)
            )->count(),
        ]);
    }

    public function update(Request $request, Product $product)
    {
        $old = $product->only(['name', 'sale_price_ttc', 'purchase_price_ht', 'vat_rate']);

        $validated = $request->validate([
            'name'              => 'sometimes|string|max:200',
            'short_name'        => 'nullable|string|max:60',
            'category_id'       => 'nullable|exists:categories,id',
            'brand_id'          => 'nullable|exists:brands,id',
            'unit_id'           => 'nullable|exists:units,id',
            'sale_price_ttc'    => 'sometimes|numeric|min:0',
            'purchase_price_ht' => 'sometimes|numeric|min:0',
            'vat_rate'           => 'sometimes|in:0,18',
            'is_active'          => 'sometimes|boolean',
            'is_weight_based'    => 'sometimes|boolean',
            'track_expiry'       => 'sometimes|boolean',
            'price_per_kg'       => 'nullable|numeric|min:0',
            'min_stock'          => 'nullable|numeric|min:0',
            'max_stock'          => 'nullable|numeric|min:0',
            'stock_appro'        => 'nullable|numeric|min:0',
            'alert_stock'        => 'nullable|numeric|min:0',
            'barcodes'                         => 'nullable|array',
            'barcodes.*.barcode'               => 'required_with:barcodes|string',
            'barcodes.*.type'                  => 'required_with:barcodes|in:ean13,ean8,internal,weight_variable',
            'containers'                       => 'nullable|array',
            'containers.*.unit_id'             => 'required|exists:units,id',
            'containers.*.label'               => 'nullable|string|max:100',
            'containers.*.conversion_factor'   => 'nullable|numeric|min:0.0001',
            'containers.*.is_purchase_unit'    => 'boolean',
            'containers.*.is_sale_unit'        => 'boolean',
            'containers.*.is_stock_unit'       => 'boolean',
            'containers.*.price_a'             => 'nullable|numeric|min:0',
            'containers.*.price_b'             => 'nullable|numeric|min:0',
            'containers.*.price_c'             => 'nullable|numeric|min:0',
            'containers.*.barcode'             => 'nullable|string|max:100',
            'section_id'                       => 'nullable|exists:store_sections,id',
            'slot'                             => 'nullable|string|max:100',
            'price_tiers'                      => 'nullable|array',
            'price_tiers.*.client_category_id' => 'required|exists:client_categories,id',
            'price_tiers.*.price'              => 'nullable|numeric|min:0',
        ]);

        $barcodes   = $validated['barcodes'] ?? null;
        $containers = array_key_exists('containers', $validated) ? $validated['containers'] : false;
        $priceTiers = array_key_exists('price_tiers', $validated) ? $validated['price_tiers'] : false;
        unset($validated['barcodes'], $validated['containers'], $validated['price_tiers']);

        // Track price change
        if (isset($validated['sale_price_ttc']) && $validated['sale_price_ttc'] != $product->sale_price_ttc) {
            \App\Models\ProductPriceHistory::create([
                'product_id'         => $product->id,
                'user_id'            => $request->user()->id,
                'old_price_ttc'      => $product->sale_price_ttc,
                'new_price_ttc'      => $validated['sale_price_ttc'],
                'old_purchase_price' => $product->purchase_price_ht,
                'new_purchase_price' => $validated['purchase_price_ht'] ?? $product->purchase_price_ht,
            ]);
        }

        $product->update($validated);

        if ($barcodes !== null) {
            $product->barcodes()->delete();
            foreach ($barcodes as $i => $bc) {
                ProductBarcode::create([
                    'product_id' => $product->id,
                    'barcode'    => $bc['barcode'],
                    'type'       => $bc['type'],
                    'is_primary' => $i === 0,
                ]);
            }
        }

        if ($containers !== false) {
            $product->containers()->delete();
            foreach (($containers ?? []) as $i => $c) {
                $product->containers()->create(array_merge($c, ['sort_order' => $i]));
            }
        }

        if ($priceTiers !== false) {
            foreach (($priceTiers ?? []) as $tier) {
                if (isset($tier['price']) && $tier['price'] !== null) {
                    $product->priceTiers()->updateOrCreate(
                        ['client_category_id' => $tier['client_category_id']],
                        ['price' => $tier['price']]
                    );
                } else {
                    $product->priceTiers()->where('client_category_id', $tier['client_category_id'])->delete();
                }
            }
        }

        AuditService::log('product_updated', 'products', $product->id, $validated, $old);

        return response()->json(
            $product->fresh(['category', 'brand', 'unit', 'barcodes', 'stockLevel', 'containers.unit', 'section', 'priceTiers.clientCategory'])
        );
    }

    public function uploadImage(Request $request, Product $product)
    {
        $request->validate(['image' => 'required|image|max:2048']);

        // Remove old image
        if ($product->image && str_starts_with($product->image, '/storage/')) {
            $old = str_replace('/storage/', 'public/', $product->image);
            Storage::delete($old);
        }

        $path = $request->file('image')->store('products', 'public');
        $product->update(['image' => Storage::url($path)]);

        return response()->json(['image' => $product->image]);
    }

    public function destroy(Product $product)
    {
        if ($product->items()->exists()) {
            return response()->json(['message' => 'Ce produit a un historique de ventes. Désactivation uniquement.'], 422);
        }
        $product->delete();
        return response()->json(null, 204);
    }

    public function searchByBarcode(Request $request)
    {
        $barcode = $request->barcode;
        $storeId = $request->user()->store_id;

        $product = Product::forStore($storeId)
            ->active()
            ->byBarcode($barcode)
            ->with(['barcodes', 'stockLevel', 'category', 'containers.unit'])
            ->first();

        if (!$product) {
            return response()->json(['message' => 'Produit introuvable.'], 404);
        }

        return response()->json($product);
    }
}
