<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventorySession;
use App\Models\InventorySessionItem;
use App\Models\Product;
use App\Models\ProductLot;
use App\Models\StockLevel;
use App\Models\StockMovement;
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
                ->latest('created_at')
                ->paginate(20)
        );
    }

    /**
     * Create a new inventory session — can be immediate (draft) or scheduled.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'                   => 'nullable|string|max:100',
            'type'                   => 'nullable|in:full,rotating',
            'scheduled_at'           => 'nullable|date|after:now',
            'sales_mode'             => 'nullable|in:normal,blocked',
            'remind_before_minutes'  => 'nullable|integer|min:5|max:10080',
        ]);

        $type      = $data['type']        ?? 'rotating';
        $scheduled = $data['scheduled_at'] ?? null;
        $status    = $scheduled ? 'scheduled' : 'draft';

        $session = InventorySession::create([
            'store_id'              => $request->user()->store_id,
            'name'                  => $data['name'] ?? ('Inventaire du ' . now()->format('d/m/Y H:i')),
            'type'                  => $type,
            'status'                => $status,
            'started_by'            => $request->user()->id,
            'started_at'            => $scheduled ? null : now(),
            'scheduled_at'          => $scheduled,
            'sales_mode'            => $data['sales_mode'] ?? 'normal',
            'remind_before_minutes' => $data['remind_before_minutes'] ?? null,
        ]);

        // For immediate full inventory, pre-populate all products
        if (!$scheduled && $type === 'full') {
            $this->preloadFullInventory($session);
        }

        return response()->json(
            $session->load(['startedBy:id,name'])->loadCount('items'),
            201
        );
    }

    /**
     * Manually start a scheduled inventory (admin can start before scheduled time).
     */
    public function start(Request $request, InventorySession $inventorySession)
    {
        abort_if($inventorySession->store_id !== $request->user()->store_id, 403);

        if (!in_array($inventorySession->status, ['scheduled', 'draft'])) {
            return response()->json(['message' => 'Cet inventaire ne peut pas être démarré dans son état actuel.'], 422);
        }

        $inventorySession->update([
            'status'     => 'draft',
            'started_at' => now(),
        ]);

        if ($inventorySession->type === 'full') {
            $this->preloadFullInventory($inventorySession);
        }

        return response()->json($inventorySession->fresh()->load(['startedBy:id,name'])->loadCount('items'));
    }

    /**
     * Return the active inventory for the store (if any) + user's assigned sheets.
     * Used by frontend to enforce redirect and block sales.
     */
    public function active(Request $request)
    {
        $storeId = $request->user()->store_id;

        $session = InventorySession::where('store_id', $storeId)
            ->whereIn('status', ['draft', 'counting', 'pending'])
            ->latest('started_at')
            ->first();

        if (!$session) {
            return response()->json(['active' => false]);
        }

        $mySheets = $session->sheets()
            ->where('assigned_to', $request->user()->id)
            ->whereNotIn('status', ['cancelled'])
            ->with(['section:id,name,color,icon'])
            ->withCount(['items', 'items as counted_count' => fn($q) => $q->whereNotNull('counted_qty')])
            ->get();

        return response()->json([
            'active'        => true,
            'session_id'    => $session->id,
            'session_name'  => $session->name,
            'status'        => $session->status,
            'sales_blocked' => $session->sales_mode === 'blocked',
            'my_sheets'     => $mySheets,
        ]);
    }

    public function show(InventorySession $inventorySession)
    {
        return response()->json(
            $inventorySession->load([
                'startedBy:id,name',
                'validator:id,name',
                'sheets.section:id,name,color,icon',
                'sheets.validatedBy:id,name',
                'sheets.assignedTo:id,name',
                'sheets.items.product:id,name,internal_code,alert_stock',
                'sheets.items.product.unit:id,abbreviation',
                'sheets.items.countedBy:id,name',
                'items.product:id,name,internal_code,alert_stock',
                'items.product.unit:id,abbreviation',
                'items.countedBy:id,name',
            ])
        );
    }

    public function addItem(Request $request, InventorySession $inventorySession)
    {
        if (!in_array($inventorySession->status, ['draft', 'counting', 'pending'])) {
            return response()->json(['message' => 'Session non modifiable dans ce statut.'], 422);
        }

        $data = $request->validate([
            'product_id'          => 'required|exists:products,id',
            'counted_qty'         => 'required|numeric|min:0',
            'sheet_id'            => 'nullable|exists:inventory_sheets,id',
            'new_expiry_date'     => 'nullable|date',
            'new_sale_price'      => 'nullable|numeric|min:0',
            'new_purchase_price'  => 'nullable|numeric|min:0',
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
                'sheet_id'            => $data['sheet_id'] ?? null,
                'counted_qty'         => $data['counted_qty'],
                'theoretical_qty'     => $theoreticalQty,
                'unit_cost'           => $unitCost,
                'variance_value'      => $varianceValue,
                'counted_at'          => now(),
                'counted_by'          => $request->user()->id,
                'new_expiry_date'     => $data['new_expiry_date'] ?? null,
                'new_sale_price'      => $data['new_sale_price'] ?? null,
                'new_purchase_price'  => $data['new_purchase_price'] ?? null,
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

    /**
     * Transmit inventory to stock.
     * Rule: only VALIDATED sheets are transmitted.
     *       draft/counting sheets are CANCELLED.
     *       Items without a sheet are transmitted as-is.
     */
    public function transmit(Request $request, InventorySession $inventorySession)
    {
        abort_if($inventorySession->store_id !== $request->user()->store_id, 403);

        if ($inventorySession->status === 'completed') {
            return response()->json(['message' => 'Cet inventaire est déjà transmis au stock.'], 422);
        }

        if (!in_array($inventorySession->status, ['draft', 'counting', 'pending'])) {
            return response()->json(['message' => 'Impossible de transmettre un inventaire dans ce statut.'], 422);
        }

        $totalVariance = 0;
        $processedCount = 0;

        DB::transaction(function () use ($inventorySession, $request, &$totalVariance, &$processedCount) {
            // Cancel non-validated sheets
            $inventorySession->sheets()
                ->whereIn('status', ['draft', 'counting'])
                ->update(['status' => 'cancelled']);

            // Get items to process: either no sheet (free items) or from validated sheets
            $validatedSheetIds = $inventorySession->sheets()
                ->where('status', 'validated')
                ->pluck('id');

            $items = $inventorySession->items()
                ->whereNotNull('counted_qty')
                ->where(fn($q) => $q
                    ->whereNull('sheet_id')
                    ->orWhereIn('sheet_id', $validatedSheetIds)
                )
                ->with('product')
                ->get();

            foreach ($items as $item) {
                $level = StockLevel::firstOrCreate(
                    ['product_id' => $item->product_id, 'store_id' => $inventorySession->store_id],
                    ['qty_on_hand' => 0, 'avg_cost' => 0]
                );

                $qtyBefore  = (float) $level->qty_on_hand;
                $qtyAfter   = (float) $item->counted_qty;
                $diff       = $qtyAfter - $qtyBefore;
                $unitCost   = (float) $level->avg_cost;

                $level->qty_on_hand  = $qtyAfter;
                $level->last_updated = now();
                $level->save();

                if (abs($diff) > 0.001) {
                    $varValue       = $diff * $unitCost;
                    $totalVariance += $varValue;

                    StockMovement::create([
                        'store_id'       => $inventorySession->store_id,
                        'product_id'     => $item->product_id,
                        'user_id'        => $request->user()->id,
                        'type'           => $diff > 0 ? 'adjustment_in' : 'adjustment_out',
                        'qty'            => abs($diff),
                        'unit_cost'      => $unitCost,
                        'stock_after'    => $qtyAfter,
                        'reference_type' => 'inventory_session',
                        'reference_id'   => $inventorySession->id,
                        'reason'         => 'inventory_adjustment',
                        'notes'          => "Inventaire #{$inventorySession->id} – {$inventorySession->name}",
                    ]);
                }

                $priceUpdate = [];
                if (!is_null($item->new_sale_price))     $priceUpdate['price_ttc']         = $item->new_sale_price;
                if (!is_null($item->new_purchase_price)) $priceUpdate['purchase_price_ht']  = $item->new_purchase_price;
                if (!empty($priceUpdate)) {
                    Product::where('id', $item->product_id)->update($priceUpdate);
                }

                if (!is_null($item->new_expiry_date)) {
                    $lot = ProductLot::where('product_id', $item->product_id)->latest()->first();
                    if ($lot) {
                        $lot->update(['expiry_date' => $item->new_expiry_date]);
                    } else {
                        ProductLot::create([
                            'product_id'  => $item->product_id,
                            'store_id'    => $inventorySession->store_id,
                            'current_qty' => $qtyAfter,
                            'expiry_date' => $item->new_expiry_date,
                        ]);
                    }
                }

                $item->update([
                    'theoretical_qty' => $qtyBefore,
                    'variance_value'  => $diff * $unitCost,
                ]);

                $processedCount++;
            }

            $inventorySession->update([
                'status'               => 'completed',
                'validated_at'         => now(),
                'validated_by'         => $request->user()->id,
                'total_variance_value' => $totalVariance,
            ]);
        });

        return response()->json([
            'message'              => 'Inventaire transmis au stock avec succès.',
            'total_variance_value' => $totalVariance,
            'items_processed'      => $processedCount,
        ]);
    }

    /**
     * Legacy validate: kept for sessions without sheets (backward compatibility).
     */
    public function validate(Request $request, InventorySession $inventorySession, StockService $stock)
    {
        if ($inventorySession->status === 'completed') {
            return response()->json(['message' => 'Cet inventaire est déjà validé.'], 422);
        }

        if ($inventorySession->sheets()->exists()) {
            return $this->transmit($request, $inventorySession);
        }

        $totalVariance = 0;

        DB::transaction(function () use ($inventorySession, $request, $stock, &$totalVariance) {
            $items = $inventorySession->items()->whereNotNull('counted_qty')->get();

            foreach ($items as $item) {
                $level = StockLevel::firstOrCreate(
                    ['product_id' => $item->product_id, 'store_id' => $inventorySession->store_id],
                    ['qty_on_hand' => 0, 'avg_cost' => 0]
                );

                $qtyBefore = (float) $level->qty_on_hand;
                $qtyAfter  = (float) $item->counted_qty;
                $diff      = $qtyAfter - $qtyBefore;
                $unitCost  = (float) $level->avg_cost;

                $varValue = $diff * $unitCost;
                $item->update(['theoretical_qty' => $qtyBefore, 'variance_value' => $varValue]);
                $totalVariance += $varValue;

                if (abs($diff) > 0.001) {
                    $level->qty_on_hand  = $qtyAfter;
                    $level->last_updated = now();
                    $level->save();

                    StockMovement::create([
                        'store_id'       => $inventorySession->store_id,
                        'product_id'     => $item->product_id,
                        'user_id'        => $request->user()->id,
                        'type'           => $diff > 0 ? 'adjustment_in' : 'adjustment_out',
                        'qty'            => abs($diff),
                        'unit_cost'      => $unitCost,
                        'stock_after'    => $qtyAfter,
                        'reference_type' => 'inventory_session',
                        'reference_id'   => $inventorySession->id,
                        'reason'         => 'inventory_adjustment',
                        'notes'          => "Inventaire #{$inventorySession->id}",
                    ]);
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
            return response()->json(['message' => 'Impossible de supprimer un inventaire transmis.'], 422);
        }
        $inventorySession->delete();
        return response()->json(['message' => 'Inventaire supprimé.']);
    }

    private function preloadFullInventory(InventorySession $session): void
    {
        $levels = StockLevel::where('store_id', $session->store_id)->get();
        $items = $levels->map(fn($l) => [
            'session_id'      => $session->id,
            'product_id'      => $l->product_id,
            'theoretical_qty' => $l->qty_on_hand,
            'unit_cost'       => $l->avg_cost,
            'created_at'      => now(),
            'updated_at'      => now(),
        ])->toArray();
        if (!empty($items)) {
            InventorySessionItem::insert($items);
        }
    }
}
