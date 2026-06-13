<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StoreTransfer;
use App\Models\StoreTransferItem;
use App\Models\StockLevel;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StoreTransferController extends Controller
{
    // ── List ─────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $query = StoreTransfer::with([
                'fromStore:id,name,code',
                'toStore:id,name,code',
                'createdBy:id,name',
                'validatedBy:id,name',
            ])
            ->withCount('items')
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->direction === 'outgoing', fn($q) => $q->where('from_store_id', $storeId))
            ->when($request->direction === 'incoming', fn($q) => $q->where('to_store_id', $storeId));

        // If no direction filter: show all transfers involving current store
        if (! $request->direction) {
            if ($storeId) {
                $query->where(fn($q) => $q
                    ->where('from_store_id', $storeId)
                    ->orWhere('to_store_id', $storeId)
                );
            }
            // Super-admin without store_id sees everything
        }

        return response()->json(
            $query->orderByDesc('created_at')->paginate($request->per_page ?? 25)
        );
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(StoreTransfer $storeTransfer)
    {
        return response()->json(
            $storeTransfer->load([
                'fromStore:id,name,code',
                'toStore:id,name,code',
                'createdBy:id,name',
                'validatedBy:id,name',
                'shippedBy:id,name',
                'receivedBy:id,name',
                'items.product:id,name,internal_code,sale_price_ttc',
            ])
        );
    }

    // ── Create (draft) ────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'to_store_id' => 'required|exists:stores,id',
            'notes'       => 'nullable|string|max:500',
            'items'       => 'required|array|min:1',
            'items.*.product_id'   => 'required|exists:products,id',
            'items.*.qty_requested' => 'required|numeric|min:0.001',
            'items.*.notes'        => 'nullable|string|max:255',
        ]);

        $fromStoreId = $request->user()->store_id;

        if (! $fromStoreId) {
            return response()->json(['message' => 'Veuillez sélectionner un magasin source.'], 422);
        }

        if ($fromStoreId === (int) $data['to_store_id']) {
            return response()->json(['message' => 'Le magasin source et destination doivent être différents.'], 422);
        }

        DB::beginTransaction();
        try {
            $reference = 'TRF-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -6));

            $transfer = StoreTransfer::create([
                'reference'    => $reference,
                'from_store_id' => $fromStoreId,
                'to_store_id'  => $data['to_store_id'],
                'status'       => 'pending',
                'created_by'   => $request->user()->id,
                'notes'        => $data['notes'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                StoreTransferItem::create([
                    'store_transfer_id' => $transfer->id,
                    'product_id'        => $item['product_id'],
                    'qty_requested'     => $item['qty_requested'],
                    'notes'             => $item['notes'] ?? null,
                    'unit_cost'         => StockLevel::where('store_id', $fromStoreId)
                                              ->where('product_id', $item['product_id'])
                                              ->value('avg_cost') ?? 0,
                ]);
            }

            DB::commit();
            return response()->json($transfer->load(['items.product:id,name,internal_code', 'toStore:id,name,code']), 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erreur lors de la création du transfert.'], 500);
        }
    }

    // ── Approve ───────────────────────────────────────────────────────────────

    public function approve(Request $request, StoreTransfer $storeTransfer)
    {
        if ($storeTransfer->status !== 'pending') {
            return response()->json(['message' => 'Seul un transfert en attente peut être approuvé.'], 422);
        }

        $data = $request->validate([
            'items'                       => 'sometimes|array',
            'items.*.id'                  => 'required|exists:store_transfer_items,id',
            'items.*.qty_approved'        => 'required|numeric|min:0',
        ]);

        DB::beginTransaction();
        try {
            // Update quantities if provided
            if (! empty($data['items'])) {
                foreach ($data['items'] as $itemData) {
                    StoreTransferItem::where('id', $itemData['id'])
                        ->where('store_transfer_id', $storeTransfer->id)
                        ->update(['qty_approved' => $itemData['qty_approved']]);
                }
            } else {
                // Approve all with full qty
                $storeTransfer->items()->update(['qty_approved' => DB::raw('qty_requested')]);
            }

            $storeTransfer->update([
                'status'       => 'approved',
                'validated_by' => $request->user()->id,
                'validated_at' => now(),
            ]);

            DB::commit();
            return response()->json($storeTransfer->fresh()->load(['items.product:id,name', 'validatedBy:id,name']));
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erreur lors de l\'approbation.'], 500);
        }
    }

    // ── Reject ────────────────────────────────────────────────────────────────

    public function reject(Request $request, StoreTransfer $storeTransfer)
    {
        if (! in_array($storeTransfer->status, ['pending'])) {
            return response()->json(['message' => 'Seul un transfert en attente peut être rejeté.'], 422);
        }

        $data = $request->validate([
            'rejection_reason' => 'required|string|max:500',
        ]);

        $storeTransfer->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['rejection_reason'],
            'validated_by'     => $request->user()->id,
            'validated_at'     => now(),
        ]);

        return response()->json($storeTransfer->fresh());
    }

    // ── Ship ──────────────────────────────────────────────────────────────────

    public function ship(Request $request, StoreTransfer $storeTransfer, StockService $stockService)
    {
        if ($storeTransfer->status !== 'approved') {
            return response()->json(['message' => 'Seul un transfert approuvé peut être expédié.'], 422);
        }

        $data = $request->validate([
            'items'                => 'sometimes|array',
            'items.*.id'           => 'required|exists:store_transfer_items,id',
            'items.*.qty_shipped'  => 'required|numeric|min:0',
        ]);

        DB::beginTransaction();
        try {
            $items = ! empty($data['items']) ? $data['items'] : null;

            foreach ($storeTransfer->items as $item) {
                $qtyToShip = $items
                    ? collect($items)->where('id', $item->id)->first()['qty_shipped'] ?? $item->qty_approved ?? $item->qty_requested
                    : ($item->qty_approved ?? $item->qty_requested);

                // Debit stock from source store
                $stockService->move(
                    $storeTransfer->from_store_id,
                    $item->product_id,
                    'transfer_out',
                    (float) $qtyToShip,
                    (float) $item->unit_cost,
                    null,
                    $request->user()->id,
                    'store_transfers',
                    $storeTransfer->id,
                    "Expédition vers magasin #{$storeTransfer->to_store_id} — {$storeTransfer->reference}"
                );

                $item->update(['qty_shipped' => $qtyToShip]);
            }

            $storeTransfer->update([
                'status'      => 'shipped',
                'shipped_by'  => $request->user()->id,
                'shipped_at'  => now(),
            ]);

            DB::commit();
            return response()->json($storeTransfer->fresh()->load(['items.product:id,name']));
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erreur lors de l\'expédition : ' . $e->getMessage()], 500);
        }
    }

    // ── Receive ───────────────────────────────────────────────────────────────

    public function receive(Request $request, StoreTransfer $storeTransfer, StockService $stockService)
    {
        if ($storeTransfer->status !== 'shipped') {
            return response()->json(['message' => 'Seul un transfert expédié peut être réceptionné.'], 422);
        }

        $data = $request->validate([
            'items'                 => 'sometimes|array',
            'items.*.id'            => 'required|exists:store_transfer_items,id',
            'items.*.qty_received'  => 'required|numeric|min:0',
        ]);

        DB::beginTransaction();
        try {
            $items = ! empty($data['items']) ? $data['items'] : null;

            foreach ($storeTransfer->items as $item) {
                $qtyToReceive = $items
                    ? collect($items)->where('id', $item->id)->first()['qty_received'] ?? $item->qty_shipped
                    : $item->qty_shipped;

                // Credit stock to destination store
                $stockService->move(
                    $storeTransfer->to_store_id,
                    $item->product_id,
                    'transfer_in',
                    (float) $qtyToReceive,
                    (float) $item->unit_cost,
                    null,
                    $request->user()->id,
                    'store_transfers',
                    $storeTransfer->id,
                    "Réception depuis magasin #{$storeTransfer->from_store_id} — {$storeTransfer->reference}"
                );

                $item->update(['qty_received' => $qtyToReceive]);
            }

            $storeTransfer->update([
                'status'      => 'received',
                'received_by' => $request->user()->id,
                'received_at' => now(),
            ]);

            DB::commit();
            return response()->json($storeTransfer->fresh()->load(['items.product:id,name']));
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Erreur lors de la réception : ' . $e->getMessage()], 500);
        }
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public function cancel(Request $request, StoreTransfer $storeTransfer)
    {
        if (! in_array($storeTransfer->status, ['draft', 'pending'])) {
            return response()->json(['message' => 'Seul un transfert en brouillon ou en attente peut être annulé.'], 422);
        }

        $storeTransfer->update(['status' => 'cancelled']);
        return response()->json($storeTransfer->fresh());
    }
}
