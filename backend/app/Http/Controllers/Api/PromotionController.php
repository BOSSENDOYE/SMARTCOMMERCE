<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Promotion;
use Illuminate\Http\Request;

class PromotionController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Promotion::where(fn($q) => $q->whereNull('store_id')->orWhere('store_id', $request->user()->store_id))
                ->orderByDesc('starts_at')
                ->paginate(20)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'type' => 'required|in:percentage,fixed_amount,special_price,bogo',
            'value' => 'nullable|numeric|min:0',
            'min_qty' => 'nullable|numeric|min:0',
            'starts_at' => 'required|date',
            'ends_at' => 'required|date|after:starts_at',
            'is_active' => 'boolean',
            'happy_hour_start' => 'nullable|date_format:H:i',
            'happy_hour_end' => 'nullable|date_format:H:i',
            'product_ids' => 'nullable|array',
            'product_ids.*' => 'exists:products,id',
            'category_ids' => 'nullable|array',
            'category_ids.*' => 'exists:categories,id',
        ]);

        $promotion = Promotion::create(array_merge(
            $data,
            ['store_id' => $request->user()->store_id, 'created_by' => $request->user()->id]
        ));

        if (!empty($data['product_ids'])) {
            $promotion->products()->sync($data['product_ids']);
        }
        if (!empty($data['category_ids'])) {
            $promotion->categories()->sync($data['category_ids']);
        }

        return response()->json($promotion, 201);
    }

    public function show(Promotion $promotion)
    {
        return response()->json($promotion->load(['products:id,name', 'categories:id,name']));
    }

    public function update(Request $request, Promotion $promotion)
    {
        $promotion->update($request->validate([
            'name' => 'sometimes|string',
            'is_active' => 'sometimes|boolean',
            'ends_at' => 'sometimes|date',
        ]));
        return response()->json($promotion);
    }

    public function destroy(Promotion $promotion)
    {
        $promotion->products()->detach();
        $promotion->categories()->detach();
        $promotion->delete();
        return response()->json(null, 204);
    }
}
