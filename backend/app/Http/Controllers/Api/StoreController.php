<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Store;
use Illuminate\Http\Request;

class StoreController extends Controller
{
    public function index()
    {
        return response()->json(Store::all());
    }

    public function show(Store $store)
    {
        return response()->json($store);
    }

    public function update(Request $request, Store $store)
    {
        $store->update($request->validate([
            'name' => 'sometimes|string|max:100',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]));
        return response()->json($store);
    }
}
