<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Loss;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LossController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Loss::with(['product:id,name,internal_code', 'user:id,name'])
                ->where('store_id', $request->user()->store_id)
                ->latest()
                ->paginate(20)
        );
    }

    public function store(Request $request, StockService $stock)
    {
        $data = $request->validate([
            'product_id' => 'required|exists:products,id',
            'qty' => 'required|numeric|min:0.001',
            'type' => 'required|in:expired,damaged,stolen,other',
            'reason' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($data, $request, $stock) {
            $level = \App\Models\StockLevel::where('product_id', $data['product_id'])
                ->where('store_id', $request->user()->store_id)
                ->firstOrFail();

            $loss = Loss::create([
                'store_id' => $request->user()->store_id,
                'product_id' => $data['product_id'],
                'qty' => $data['qty'],
                'unit_cost' => $level->avg_cost,
                'type' => $data['type'],
                'reason' => $data['reason'] ?? null,
                'user_id' => $request->user()->id,
                'status' => 'validated',
            ]);

            $stock->move($data['product_id'], $request->user()->store_id, 'loss', $data['qty'], $level->avg_cost, $request->user()->id, "Perte {$data['type']}");

            return response()->json($loss, 201);
        });
    }
}
