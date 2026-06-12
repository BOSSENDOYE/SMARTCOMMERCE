<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Services\AuditService;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $products = Product::forStore($storeId)
            ->with(['category', 'brand', 'unit', 'barcodes', 'stockLevel'])
            ->when($request->search, fn($q) => $q
                ->where(fn($q2) => $q2
                    ->where('name', 'like', "%{$request->search}%")
                    ->orWhere('internal_code', 'like', "%{$request->search}%")
                    ->orWhereHas('barcodes', fn($q3) => $q3->where('barcode', 'like', "%{$request->search}%"))
                )
            )
            ->when($request->category_id, fn($q) => $q->where('category_id', $request->category_id))
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->low_stock, fn($q) => $q->whereHas('stockLevel', fn($q2) => $q2
                ->where('store_id', $storeId)
                ->whereRaw('qty_on_hand <= products.alert_stock')
            ))
            ->orderBy('name')
            ->paginate($request->per_page ?? 50);

        return response()->json($products);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:200',
            'short_name' => 'nullable|string|max:60',
            'category_id' => 'nullable|exists:categories,id',
            'brand_id' => 'nullable|exists:brands,id',
            'unit_id' => 'nullable|exists:units,id',
            'purchase_price_ht' => 'required|numeric|min:0',
            'sale_price_ttc' => 'required|numeric|min:0',
            'vat_rate' => 'required|in:0,18',
            'min_stock' => 'nullable|numeric|min:0',
            'max_stock' => 'nullable|numeric|min:0',
            'alert_stock' => 'nullable|numeric|min:0',
            'is_weight_based' => 'boolean',
            'price_per_kg' => 'nullable|numeric|min:0',
            'barcodes' => 'nullable|array',
            'barcodes.*.barcode' => 'required_with:barcodes|string',
            'barcodes.*.type' => 'required_with:barcodes|in:ean13,ean8,internal,weight_variable',
        ]);

        $storeId = $request->user()->store_id;
        $code = 'P' . str_pad(Product::max('id') + 1, 8, '0', STR_PAD_LEFT);

        $product = Product::create(array_merge($validated, [
            'store_id' => $storeId,
            'internal_code' => $code,
        ]));

        if (!empty($validated['barcodes'])) {
            foreach ($validated['barcodes'] as $i => $bc) {
                ProductBarcode::create([
                    'product_id' => $product->id,
                    'barcode' => $bc['barcode'],
                    'type' => $bc['type'],
                    'is_primary' => $i === 0,
                ]);
            }
        }

        AuditService::log('product_created', 'products', $product->id, $product->toArray());

        return response()->json($product->load(['category', 'brand', 'unit', 'barcodes']), 201);
    }

    public function show(Request $request, Product $product)
    {
        return response()->json($product->load([
            'category', 'brand', 'unit', 'barcodes',
            'stockLevel', 'lots', 'suppliers', 'priceHistory' => fn($q) => $q->latest()->limit(20),
        ]));
    }

    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $base = Product::forStore($storeId);

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
            'vat_rate'          => 'sometimes|in:0,18',
            'is_active'         => 'sometimes|boolean',
            'is_weight_based'   => 'sometimes|boolean',
            'track_expiry'      => 'sometimes|boolean',
            'price_per_kg'      => 'nullable|numeric|min:0',
            'min_stock'         => 'nullable|numeric|min:0',
            'max_stock'         => 'nullable|numeric|min:0',
            'alert_stock'       => 'nullable|numeric|min:0',
            'barcodes'          => 'nullable|array',
            'barcodes.*.barcode' => 'required_with:barcodes|string',
            'barcodes.*.type'   => 'required_with:barcodes|in:ean13,ean8,internal,weight_variable',
        ]);

        $barcodes = $validated['barcodes'] ?? null;
        unset($validated['barcodes']);

        // Record price change in history
        if (isset($validated['sale_price_ttc']) && $validated['sale_price_ttc'] != $product->sale_price_ttc) {
            \App\Models\ProductPriceHistory::create([
                'product_id'          => $product->id,
                'user_id'             => $request->user()->id,
                'old_price_ttc'       => $product->sale_price_ttc,
                'new_price_ttc'       => $validated['sale_price_ttc'],
                'old_purchase_price'  => $product->purchase_price_ht,
                'new_purchase_price'  => $validated['purchase_price_ht'] ?? $product->purchase_price_ht,
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

        AuditService::log('product_updated', 'products', $product->id, $validated, $old);

        return response()->json($product->fresh(['category', 'brand', 'unit', 'barcodes', 'stockLevel']));
    }

    public function destroy(Product $product)
    {
        // Never delete — only deactivate
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
            ->with(['barcodes', 'stockLevel', 'category'])
            ->first();

        if (!$product) {
            return response()->json(['message' => 'Produit introuvable.'], 404);
        }

        return response()->json($product);
    }
}
