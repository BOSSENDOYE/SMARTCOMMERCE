<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClientCategory;
use Illuminate\Http\Request;

class ClientCategoryController extends Controller
{
    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $categories = ClientCategory::where(function ($q) use ($storeId) {
                $q->whereNull('store_id')->orWhere('store_id', $storeId);
            })
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($categories);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'           => 'required|string|max:60',
            'code'           => 'nullable|string|max:20',
            'color'          => 'nullable|string|max:20',
            'sort_order'     => 'nullable|integer|min:0',
            'is_pos_default' => 'boolean',
        ]);

        $storeId = $request->user()->store_id;

        // Une seule catégorie peut être le défaut POS
        if (!empty($data['is_pos_default'])) {
            ClientCategory::where(function ($q) use ($storeId) {
                $q->whereNull('store_id')->orWhere('store_id', $storeId);
            })->update(['is_pos_default' => false]);
        }

        $category = ClientCategory::create(array_merge($data, ['store_id' => $storeId]));

        return response()->json($category, 201);
    }

    public function update(Request $request, ClientCategory $clientCategory)
    {
        $data = $request->validate([
            'name'           => 'sometimes|string|max:60',
            'code'           => 'nullable|string|max:20',
            'color'          => 'nullable|string|max:20',
            'sort_order'     => 'nullable|integer|min:0',
            'is_pos_default' => 'sometimes|boolean',
            'is_active'      => 'sometimes|boolean',
        ]);

        $storeId = $request->user()->store_id;

        if (!empty($data['is_pos_default'])) {
            ClientCategory::where(function ($q) use ($storeId) {
                $q->whereNull('store_id')->orWhere('store_id', $storeId);
            })->where('id', '!=', $clientCategory->id)->update(['is_pos_default' => false]);
        }

        $clientCategory->update($data);

        return response()->json($clientCategory);
    }

    public function destroy(ClientCategory $clientCategory)
    {
        if ($clientCategory->clients()->count() > 0) {
            return response()->json(['message' => 'Cette catégorie est utilisée par des clients.'], 422);
        }

        $clientCategory->delete();

        return response()->json(null, 204);
    }
}
