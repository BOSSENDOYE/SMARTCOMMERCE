<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventorySession;
use App\Models\InventorySessionItem;
use App\Models\StockLevel;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            InventorySession::with(['startedBy:id,name', 'validator:id,name'])
                ->withCount('items')
                ->where('store_id', $request->user()->store_id)
                ->latest()
                ->paginate(20)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'nullable|string|max:100',
            'type' => 'nullable|in:full,rotating',
        ]);

        $type = $data['type'] ?? 'full';

        $session = InventorySession::create([
            'store_id'   => $request->user()->store_id,
            'name'       => $data['name'] ?? ('Inventaire du ' . now()->format('d/m/Y H:i')),
            'type'       => $type,
            'status'     => 'draft',
            'started_by' => $request->user()->id,
            'started_at' => now(),
        ]);

        // For full inventory, pre-populate all products that have stock
        if ($type === 'full') {
            $levels = StockLevel::where('store_id', $request->user()->store_id)->get();
            $items = $levels->map(fn($l) => [
                'session_id'    => $session->id,
                'product_id'    => $l->product_id,
                'theoretical_qty' => $l->qty_on_hand,
                'unit_cost'     => $l->avg_cost,
                'created_at'    => now(),
                'updated_at'    => now(),
            ])->toArray();
            InventorySessionItem::insert($items);
        }

        return response()->json(
            $session->load(['startedBy:id,name'])->loadCount('items'),
            201
        );
    }

    public function show(InventorySession $inventorySession)
    {
        return response()->json(
            $inventorySession->load([
                'startedBy:id,name',
                'validator:id,name',
                'items.product:id,name,internal_code,alert_stock',
                'items.product.unit:id,abbreviation',
                'items.countedBy:id,name',
            ])
        );
    }

    public function addItem(Request $request, InventorySession $inventorySession)
    {
        if (!in_array($inventorySession->status, ['draft', 'counting'])) {
            return response()->json(['message' => 'Session non modifiable dans ce statut.'], 422);
        }

        $data = $request->validate([
            'product_id'  => 'required|exists:products,id',
            'counted_qty' => 'required|numeric|min:0',
        ]);

        $level = StockLevel::where('product_id', $data['product_id'])
            ->where('store_id', $inventorySession->store_id)
            ->first();

        $theoreticalQty = $level?->qty_on_hand ?? 0;
        $unitCost       = $level?->avg_cost ?? 0;
        $varianceValue  = ($data['counted_qty'] - $theoreticalQty) * $unitCost;

        $item = InventorySessionItem::updateOrCreate(
            ['session_id' => $inventorySession->id, 'product_id' => $data['product_id']],
            [
                'counted_qty'    => $data['counted_qty'],
                'theoretical_qty' => $theoreticalQty,
                'unit_cost'      => $unitCost,
                'variance_value' => $varianceValue,
                'counted_at'     => now(),
                'counted_by'     => $request->user()->id,
            ]
        );

        if ($inventorySession->status === 'draft') {
            $inventorySession->update(['status' => 'counting']);
        }

        return response()->json(
            $item->load(['product:id,name,internal_code', 'product.unit:id,abbreviation'])
        );
    }

    public function removeItem(Request $request, InventorySession $inventorySession, InventorySessionItem $item)
    {
        if (!in_array($inventorySession->status, ['draft', 'counting'])) {
            return response()->json(['message' => 'Session non modifiable dans ce statut.'], 422);
        }
        $item->delete();
        return response()->json(['message' => 'Article retiré.']);
    }

    public function validate(Request $request, InventorySession $inventorySession, StockService $stock)
    {
        if ($inventorySession->status === 'completed') {
            return response()->json(['message' => 'Cet inventaire est déjà validé.'], 422);
        }

        $totalVariance = 0;

        DB::transaction(function () use ($inventorySession, $request, $stock, &$totalVariance) {
            $items = $inventorySession->items()->whereNotNull('counted_qty')->get();

            foreach ($items as $item) {
                $level = StockLevel::firstOrCreate(
                    ['product_id' => $item->product_id, 'store_id' => $inventorySession->store_id],
                    ['qty_on_hand' => 0, 'avg_cost' => 0]
                );

                $diff = (float) $item->counted_qty - (float) $level->qty_on_hand;

                $varValue = $diff * (float) $level->avg_cost;
                $item->update([
                    'theoretical_qty' => $level->qty_on_hand,
                    'variance_value'  => $varValue,
                ]);
                $totalVariance += $varValue;

                if (abs($diff) > 0.001) {
                    $stock->move(
                        $inventorySession->store_id,
                        $item->product_id,
                        'inventory_adjustment',
                        abs($diff),
                        (float) $level->avg_cost,
                        null,
                        $request->user()->id,
                        null,
                        null,
                        "Inventaire #{$inventorySession->id}"
                    );
                }
            }

            $inventorySession->update([
                'status'               => 'completed',
                'validated_at'         => now(),
                'validated_by'         => $request->user()->id,
                'total_variance_value' => $totalVariance,
            ]);
        });

        return response()->json([
            'message'              => 'Inventaire validé et stocks mis à jour.',
            'total_variance_value' => $totalVariance,
            'items_processed'      => $inventorySession->items()->whereNotNull('counted_qty')->count(),
        ]);
    }

    public function destroy(InventorySession $inventorySession)
    {
        if ($inventorySession->status === 'completed') {
            return response()->json(['message' => 'Impossible de supprimer un inventaire validé.'], 422);
        }
        $inventorySession->delete();
        return response()->json(['message' => 'Inventaire supprimé.']);
    }
}
