<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StoreSection;
use Illuminate\Http\Request;

class StoreSectionController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    /** Liste de tous les rayons du magasin avec comptage produits */
    public function index(Request $request)
    {
        $sections = StoreSection::where('store_id', $this->storeId($request))
            ->withCount('products')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($sections);
    }

    /** Créer un rayon */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'code'       => 'nullable|string|max:20',
            'color'      => 'nullable|string|max:20',
            'icon'       => 'nullable|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $maxOrder = StoreSection::where('store_id', $this->storeId($request))->max('sort_order') ?? -1;

        $section = StoreSection::create(array_merge($data, [
            'store_id'   => $this->storeId($request),
            'sort_order' => $data['sort_order'] ?? ($maxOrder + 1),
        ]));

        return response()->json($section->loadCount('products'), 201);
    }

    /** Modifier un rayon */
    public function update(Request $request, StoreSection $section)
    {
        abort_if($section->store_id !== $this->storeId($request), 403);

        $data = $request->validate([
            'name'       => 'sometimes|string|max:100',
            'code'       => 'nullable|string|max:20',
            'color'      => 'nullable|string|max:20',
            'icon'       => 'nullable|string|max:50',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $section->update($data);

        return response()->json($section->loadCount('products'));
    }

    /** Supprimer un rayon (désaffecte les produits d'abord) */
    public function destroy(Request $request, StoreSection $section)
    {
        abort_if($section->store_id !== $this->storeId($request), 403);

        // Désaffecter les produits
        $section->products()->update(['section_id' => null, 'slot' => null]);
        $section->delete();

        return response()->json(null, 204);
    }

    /** Produits d'un rayon spécifique (avec stock) */
    public function products(Request $request, StoreSection $section)
    {
        abort_if($section->store_id !== $this->storeId($request), 403);

        $storeId = $this->storeId($request);

        $products = $section->products()
            ->with([
                'category',
                'unit',
                'stockLevel' => fn($q) => $q->where('store_id', $storeId),
            ])
            ->where(fn($q) => $q->where('store_id', $storeId)->orWhereNull('store_id'))
            ->orderBy('slot')
            ->orderBy('name')
            ->get()
            ->map(fn($p) => [
                'id'            => $p->id,
                'internal_code' => $p->internal_code,
                'name'          => $p->name,
                'slot'          => $p->slot,
                'category'      => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'unit'          => $p->unit ? ['abbreviation' => $p->unit->abbreviation] : null,
                'qty_on_hand'   => $p->stockLevel?->qty_on_hand ?? 0,
                'is_active'     => $p->is_active,
            ]);

        return response()->json($products);
    }

    /** Assigner un produit à un rayon + position */
    public function assignProduct(Request $request, StoreSection $section)
    {
        abort_if($section->store_id !== $this->storeId($request), 403);

        $data = $request->validate([
            'product_id' => 'required|exists:products,id',
            'slot'       => 'nullable|string|max:100',
        ]);

        \App\Models\Product::where('id', $data['product_id'])
            ->update([
                'section_id' => $section->id,
                'slot'       => $data['slot'] ?? null,
            ]);

        return response()->json(['ok' => true]);
    }

    /** Retirer un produit de son rayon */
    public function unassignProduct(Request $request, int $productId)
    {
        \App\Models\Product::where('id', $productId)
            ->where(fn($q) => $q->where('store_id', $this->storeId($request))->orWhereNull('store_id'))
            ->update(['section_id' => null, 'slot' => null]);

        return response()->json(['ok' => true]);
    }

    /** Réordonner les rayons */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'order'   => 'required|array',
            'order.*' => 'integer|exists:store_sections,id',
        ]);

        foreach ($data['order'] as $idx => $id) {
            StoreSection::where('id', $id)
                ->where('store_id', $this->storeId($request))
                ->update(['sort_order' => $idx]);
        }

        return response()->json(['ok' => true]);
    }

    /** Produits non affectés à aucun rayon */
    public function unassigned(Request $request)
    {
        $storeId = $this->storeId($request);

        $products = \App\Models\Product::where(fn($q) => $q->where('store_id', $storeId)->orWhereNull('store_id'))
            ->whereNull('section_id')
            ->where('is_active', true)
            ->with([
                'category',
                'unit',
                'stockLevel' => fn($q) => $q->where('store_id', $storeId),
            ])
            ->orderBy('name')
            ->get()
            ->map(fn($p) => [
                'id'            => $p->id,
                'internal_code' => $p->internal_code,
                'name'          => $p->name,
                'slot'          => null,
                'category'      => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'unit'          => $p->unit ? ['abbreviation' => $p->unit->abbreviation] : null,
                'qty_on_hand'   => $p->stockLevel?->qty_on_hand ?? 0,
                'is_active'     => $p->is_active,
            ]);

        return response()->json($products);
    }
}
