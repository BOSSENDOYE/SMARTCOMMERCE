<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Promotion;
use Illuminate\Http\Request;

class PromotionController extends Controller
{
    private function baseQuery(Request $request)
    {
        return Promotion::where(fn($q) =>
            $q->whereNull('store_id')->orWhere('store_id', $request->user()->store_id)
        );
    }

    public function stats(Request $request)
    {
        $now  = now();
        $base = $this->baseQuery($request);

        return response()->json([
            'total'         => (clone $base)->count(),
            'active'        => (clone $base)->where('is_active', true)
                ->where(fn($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
                ->where(fn($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
                ->count(),
            'expiring_soon' => (clone $base)->where('is_active', true)
                ->whereBetween('ends_at', [$now, $now->copy()->addDays(7)])
                ->count(),
            'expired'       => (clone $base)->where('ends_at', '<', $now)->count(),
        ]);
    }

    public function index(Request $request)
    {
        $now = now();

        return response()->json(
            $this->baseQuery($request)
                ->with(['products:id,name,internal_code', 'categories:id,name'])
                ->when($request->search, fn($q) => $q->where('name', 'like', "%{$request->search}%"))
                ->when($request->type, fn($q) => $q->where('type', $request->type))
                ->when($request->status, function ($q) use ($request, $now) {
                    match ($request->status) {
                        'active'    => $q->where('is_active', true)
                                        ->where(fn($q2) => $q2->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
                                        ->where(fn($q2) => $q2->whereNull('ends_at')->orWhere('ends_at', '>=', $now)),
                        'upcoming'  => $q->where('is_active', true)->where('starts_at', '>', $now),
                        'expired'   => $q->where('ends_at', '<', $now),
                        'inactive'  => $q->where('is_active', false)->where(fn($q2) => $q2->whereNull('ends_at')->orWhere('ends_at', '>=', $now)),
                        default     => null,
                    };
                })
                ->orderByDesc('created_at')
                ->paginate($request->per_page ?? 20)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'              => 'required|string|max:100',
            'type'              => 'required|in:percentage,fixed_amount,special_price,buy_x_get_y,tiered,happy_hour',
            'value'             => 'nullable|numeric|min:0',
            'min_amount'        => 'nullable|numeric|min:0',
            'buy_qty'           => 'nullable|integer|min:1',
            'get_qty'           => 'nullable|integer|min:1',
            'tiers'             => 'nullable|array',
            'happy_hour_start'  => 'nullable|date_format:H:i',
            'happy_hour_end'    => 'nullable|date_format:H:i',
            'stackable'         => 'boolean',
            'applies_to_all'    => 'boolean',
            'loyalty_only'      => 'boolean',
            'starts_at'         => 'nullable|date',
            'ends_at'           => 'nullable|date',
            'is_active'         => 'boolean',
            'product_ids'       => 'nullable|array',
            'product_ids.*'     => 'exists:products,id',
            'category_ids'      => 'nullable|array',
            'category_ids.*'    => 'exists:categories,id',
        ]);

        $productIds  = $data['product_ids']  ?? [];
        $categoryIds = $data['category_ids'] ?? [];
        unset($data['product_ids'], $data['category_ids']);

        $promotion = Promotion::create(array_merge($data, [
            'store_id' => $request->user()->store_id,
        ]));

        if ($productIds)  $promotion->products()->sync($productIds);
        if ($categoryIds) $promotion->categories()->sync($categoryIds);

        return response()->json($promotion->load(['products:id,name', 'categories:id,name']), 201);
    }

    public function show(Promotion $promotion)
    {
        return response()->json($promotion->load(['products:id,name,internal_code', 'categories:id,name']));
    }

    public function update(Request $request, Promotion $promotion)
    {
        $data = $request->validate([
            'name'              => 'sometimes|string|max:100',
            'type'              => 'sometimes|in:percentage,fixed_amount,special_price,buy_x_get_y,tiered,happy_hour',
            'value'             => 'nullable|numeric|min:0',
            'min_amount'        => 'nullable|numeric|min:0',
            'buy_qty'           => 'nullable|integer|min:1',
            'get_qty'           => 'nullable|integer|min:1',
            'tiers'             => 'nullable|array',
            'happy_hour_start'  => 'nullable|date_format:H:i',
            'happy_hour_end'    => 'nullable|date_format:H:i',
            'stackable'         => 'sometimes|boolean',
            'applies_to_all'    => 'sometimes|boolean',
            'loyalty_only'      => 'sometimes|boolean',
            'starts_at'         => 'nullable|date',
            'ends_at'           => 'nullable|date',
            'is_active'         => 'sometimes|boolean',
            'product_ids'       => 'nullable|array',
            'product_ids.*'     => 'exists:products,id',
            'category_ids'      => 'nullable|array',
            'category_ids.*'    => 'exists:categories,id',
        ]);

        $productIds  = $data['product_ids']  ?? null;
        $categoryIds = $data['category_ids'] ?? null;
        unset($data['product_ids'], $data['category_ids']);

        $promotion->update($data);

        if ($productIds !== null)  $promotion->products()->sync($productIds);
        if ($categoryIds !== null) $promotion->categories()->sync($categoryIds);

        return response()->json($promotion->fresh()->load(['products:id,name', 'categories:id,name']));
    }

    public function destroy(Promotion $promotion)
    {
        $promotion->products()->detach();
        $promotion->categories()->detach();
        $promotion->delete();
        return response()->json(null, 204);
    }
}
