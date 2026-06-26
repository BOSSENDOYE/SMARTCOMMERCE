<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Loss;
use App\Models\StockLevel;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LossController extends Controller
{
    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $base = Loss::where('store_id', $storeId);

        $totalCount = (clone $base)->count();
        $totalValue = (clone $base)->where('status', 'validated')->sum('total_cost');
        $pendingCount = (clone $base)->where('status', 'pending')->count();
        $monthValue = (clone $base)
            ->where('status', 'validated')
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->sum('total_cost');

        $byType = (clone $base)
            ->where('status', 'validated')
            ->selectRaw('type, COUNT(*) as count, SUM(total_cost) as value')
            ->groupBy('type')
            ->get()
            ->keyBy('type');

        return response()->json([
            'total_count' => $totalCount,
            'total_value' => (float) $totalValue,
            'pending_count' => $pendingCount,
            'month_value' => (float) $monthValue,
            'by_type' => $byType,
        ]);
    }

    public function index(Request $request)
    {
        $query = Loss::with(['product:id,name,internal_code', 'user:id,name', 'validator:id,name'])
            ->where('store_id', $request->user()->store_id);

        if ($request->type) {
            $query->where('type', $request->type);
        }
        if ($request->status) {
            $query->where('status', $request->status);
        }
        if ($request->date_from) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->date_to) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }
        if ($request->search) {
            $query->whereHas('product', fn($q) => $q
                ->where('name', 'ilike', "%{$request->search}%")
                ->orWhere('internal_code', 'ilike', "%{$request->search}%")
            );
        }

        return response()->json(
            $query->latest()->paginate((int) ($request->per_page ?? 20))
        );
    }

    public function show(Loss $loss)
    {
        return response()->json(
            $loss->load(['product:id,name,internal_code', 'user:id,name', 'validator:id,name'])
        );
    }

    public function store(Request $request, StockService $stock)
    {
        $data = $request->validate([
            'product_id' => 'required|exists:products,id',
            'qty'        => 'required|numeric|min:0.001',
            'type'       => 'required|in:breakage,expiry,theft,internal_use,commercial_gesture,other',
            'notes'      => 'nullable|string|max:500',
            'lot_id'     => 'nullable|exists:product_lots,id',
        ]);

        return DB::transaction(function () use ($data, $request, $stock) {
            $storeId = $request->user()->store_id;

            $level = StockLevel::where('product_id', $data['product_id'])
                ->where('store_id', $storeId)
                ->firstOrFail();

            // Generate unique reference
            $date = now()->format('Ymd');
            $last = Loss::where('store_id', $storeId)
                ->whereDate('created_at', today())
                ->orderByDesc('id')->value('reference');
            $seq = $last ? (int) substr($last, -4) + 1 : 1;
            $reference = 'PRT' . $date . str_pad($seq, 4, '0', STR_PAD_LEFT);

            $loss = Loss::create([
                'store_id'   => $storeId,
                'product_id' => $data['product_id'],
                'lot_id'     => $data['lot_id'] ?? null,
                'user_id'    => $request->user()->id,
                'reference'  => $reference,
                'type'       => $data['type'],
                'qty'        => $data['qty'],
                'unit_cost'  => $level->avg_cost,
                'notes'      => $data['notes'] ?? null,
                'status'     => 'pending',
            ]);

            // Deduct stock immediately (pending = stock is already gone)
            $stock->move(
                $storeId,
                $data['product_id'],
                'loss',
                $data['qty'],
                $level->avg_cost,
                $data['lot_id'] ?? null,
                $request->user()->id,
                Loss::class,
                $loss->id,
                $data['notes'] ?? null
            );

            return response()->json(
                $loss->load(['product:id,name,internal_code', 'user:id,name']),
                201
            );
        });
    }

    public function update(Request $request, Loss $loss)
    {
        if ($loss->status !== 'pending') {
            return response()->json(['message' => 'Seules les pertes en attente sont modifiables'], 422);
        }

        $data = $request->validate([
            'notes' => 'nullable|string|max:500',
            'type'  => 'sometimes|in:breakage,expiry,theft,internal_use,commercial_gesture,other',
        ]);

        $loss->update($data);

        return response()->json($loss->fresh()->load(['product:id,name', 'user:id,name']));
    }

    public function destroy(Request $request, Loss $loss, StockService $stock)
    {
        if ($loss->status !== 'pending') {
            return response()->json(['message' => 'Seules les pertes en attente peuvent être supprimées'], 422);
        }

        return DB::transaction(function () use ($loss, $request, $stock) {
            // Restore stock
            $stock->move(
                $loss->store_id,
                $loss->product_id,
                'adjustment_in',
                $loss->qty,
                $loss->unit_cost,
                $loss->lot_id,
                $request->user()->id,
                Loss::class,
                $loss->id,
                'Annulation perte ' . $loss->reference
            );

            $loss->delete();

            return response()->json(['message' => 'Perte annulée et stock restauré']);
        });
    }

    public function validate(Request $request, Loss $loss)
    {
        if ($loss->status !== 'pending') {
            return response()->json(['message' => 'Perte déjà traitée'], 422);
        }

        $loss->update([
            'status'       => 'validated',
            'validator_id' => $request->user()->id,
            'validated_at' => now(),
        ]);

        return response()->json($loss->fresh()->load(['product:id,name', 'validator:id,name']));
    }

    public function reject(Request $request, Loss $loss, StockService $stock)
    {
        if ($loss->status !== 'pending') {
            return response()->json(['message' => 'Perte déjà traitée'], 422);
        }

        return DB::transaction(function () use ($loss, $request, $stock) {
            // Revert the stock deduction made at creation
            $stock->move(
                $loss->store_id,
                $loss->product_id,
                'adjustment_in',
                $loss->qty,
                $loss->unit_cost,
                $loss->lot_id,
                $request->user()->id,
                Loss::class,
                $loss->id,
                'Rejet perte ' . $loss->reference
            );

            $loss->update([
                'status'       => 'rejected',
                'validator_id' => $request->user()->id,
                'validated_at' => now(),
            ]);

            return response()->json($loss->fresh()->load(['product:id,name', 'validator:id,name']));
        });
    }
}
