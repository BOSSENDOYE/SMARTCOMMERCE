<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReception;
use App\Models\PurchaseReceptionItem;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseOrderController extends Controller
{
    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $base = PurchaseOrder::where('store_id', $storeId);

        return response()->json([
            'total'         => (clone $base)->count(),
            'pending'       => (clone $base)->whereIn('status', ['sent', 'partial'])->count(),
            'draft'         => (clone $base)->where('status', 'draft')->count(),
            'total_amount'  => (clone $base)->whereNotIn('status', ['cancelled'])->sum('total_ttc'),
            'this_month'    => (clone $base)->whereMonth('created_at', now()->month)
                                            ->whereYear('created_at', now()->year)
                                            ->whereNotIn('status', ['cancelled'])
                                            ->sum('total_ttc'),
        ]);
    }

    public function index(Request $request)
    {
        return response()->json(
            PurchaseOrder::with(['supplier:id,company_name', 'creator:id,name'])
                ->withCount('items')
                ->where('store_id', $request->user()->store_id)
                ->when($request->search, fn($q) => $q->where('reference', 'ilike', "%{$request->search}%")
                    ->orWhereHas('supplier', fn($s) => $s->where('company_name', 'ilike', "%{$request->search}%")))
                ->when($request->supplier_id, fn($q) => $q->where('supplier_id', $request->supplier_id))
                ->when($request->status, fn($q) => $q->where('status', $request->status))
                ->latest()
                ->paginate($request->per_page ?? 20)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'supplier_id'             => 'required|exists:suppliers,id',
            'expected_date'           => 'nullable|date',
            'notes'                   => 'nullable|string',
            'items'                   => 'required|array|min:1',
            'items.*.product_id'      => 'required|exists:products,id',
            'items.*.qty_ordered'     => 'required|numeric|min:0.001',
            'items.*.unit_price_ht'   => 'required|numeric|min:0',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $reference = 'BC-' . date('Ymd') . '-' . str_pad(
                PurchaseOrder::whereDate('created_at', today())->count() + 1, 4, '0', STR_PAD_LEFT
            );

            $order = PurchaseOrder::create([
                'store_id'      => $request->user()->store_id,
                'supplier_id'   => $data['supplier_id'],
                'reference'     => $reference,
                'expected_date' => $data['expected_date'] ?? null,
                'status'        => 'draft',
                'notes'         => $data['notes'] ?? null,
                'user_id'       => $request->user()->id,
            ]);

            [$totalHt] = $this->syncItems($order, $data['items']);
            $order->update(['total_ht' => $totalHt, 'total_ttc' => $totalHt * 1.18]);

            return response()->json(
                $order->load(['items.product:id,name,internal_code', 'supplier:id,company_name']),
                201
            );
        });
    }

    public function show(PurchaseOrder $purchaseOrder)
    {
        $po = $purchaseOrder->load([
            'supplier',
            'items.product:id,name,internal_code',
            'creator:id,name',
            'receptions.items.product:id,name',
            'receptions.receiver:id,name',
        ]);

        // Attach received qty per item (sum across all receptions)
        $receivedByProduct = PurchaseReceptionItem::whereHas(
            'reception', fn($q) => $q->where('purchase_order_id', $purchaseOrder->id)
        )->selectRaw('product_id, SUM(qty_received) as total_received')
         ->groupBy('product_id')
         ->pluck('total_received', 'product_id');

        foreach ($po->items as $item) {
            $item->qty_received_total = (float) ($receivedByProduct[$item->product_id] ?? 0);
        }

        return response()->json($po);
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder)
    {
        if ($purchaseOrder->status !== 'draft') {
            return response()->json(['message' => 'Seules les commandes brouillon sont modifiables.'], 422);
        }

        $data = $request->validate([
            'supplier_id'             => 'nullable|exists:suppliers,id',
            'expected_date'           => 'nullable|date',
            'notes'                   => 'nullable|string',
            'items'                   => 'nullable|array|min:1',
            'items.*.product_id'      => 'required_with:items|exists:products,id',
            'items.*.qty_ordered'     => 'required_with:items|numeric|min:0.001',
            'items.*.unit_price_ht'   => 'required_with:items|numeric|min:0',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        DB::transaction(function () use ($data, $purchaseOrder) {
            $purchaseOrder->update([
                'supplier_id'   => $data['supplier_id']   ?? $purchaseOrder->supplier_id,
                'expected_date' => $data['expected_date'] ?? $purchaseOrder->expected_date,
                'notes'         => $data['notes']         ?? $purchaseOrder->notes,
            ]);

            if (!empty($data['items'])) {
                $purchaseOrder->items()->delete();
                [$totalHt] = $this->syncItems($purchaseOrder, $data['items']);
                $purchaseOrder->update(['total_ht' => $totalHt, 'total_ttc' => $totalHt * 1.18]);
            }
        });

        return response()->json(
            $purchaseOrder->fresh()->load(['items.product:id,name,internal_code', 'supplier:id,company_name'])
        );
    }

    public function send(PurchaseOrder $purchaseOrder)
    {
        if ($purchaseOrder->status !== 'draft') {
            return response()->json(['message' => 'Seules les commandes brouillon peuvent être envoyées.'], 422);
        }
        if ($purchaseOrder->items()->count() === 0) {
            return response()->json(['message' => 'La commande doit contenir au moins un article.'], 422);
        }
        $purchaseOrder->update(['status' => 'sent']);
        return response()->json($purchaseOrder->fresh());
    }

    public function cancel(PurchaseOrder $purchaseOrder)
    {
        if ($purchaseOrder->status === 'received') {
            return response()->json(['message' => 'Impossible d\'annuler une commande déjà réceptionnée.'], 422);
        }
        $purchaseOrder->update(['status' => 'cancelled']);
        return response()->json($purchaseOrder->fresh());
    }

    public function receive(Request $request, PurchaseOrder $purchaseOrder, StockService $stock)
    {
        if (!in_array($purchaseOrder->status, ['sent', 'partial'])) {
            return response()->json(['message' => 'Cette commande ne peut pas être réceptionnée dans son état actuel.'], 422);
        }

        $data = $request->validate([
            'supplier_delivery_ref'                  => 'nullable|string|max:100',
            'notes'                                  => 'nullable|string',
            'items'                                  => 'required|array|min:1',
            'items.*.purchase_order_item_id'         => 'required|exists:purchase_order_items,id',
            'items.*.qty_received'                   => 'required|numeric|min:0',
            'items.*.qty_rejected'                   => 'nullable|numeric|min:0',
            'items.*.unit_price_ht'                  => 'nullable|numeric|min:0',
            'items.*.lot_number'                     => 'nullable|string|max:50',
            'items.*.manufacture_date'               => 'nullable|date',
            'items.*.expiry_date'                    => 'nullable|date',
        ]);

        return DB::transaction(function () use ($data, $purchaseOrder, $request, $stock) {
            $receptionRef = 'BR-' . date('Ymd') . '-' . str_pad(
                PurchaseReception::whereDate('created_at', today())->count() + 1, 4, '0', STR_PAD_LEFT
            );

            $reception = PurchaseReception::create([
                'purchase_order_id'    => $purchaseOrder->id,
                'store_id'             => $purchaseOrder->store_id,
                'user_id'              => $request->user()->id,
                'reference'            => $receptionRef,
                'supplier_delivery_ref' => $data['supplier_delivery_ref'] ?? null,
                'notes'                => $data['notes'] ?? null,
                'received_at'          => now(),
                'status'               => 'complete',
            ]);

            $anyReceived = false;

            foreach ($data['items'] as $item) {
                $poItem = PurchaseOrderItem::find($item['purchase_order_item_id']);
                if (!$poItem || (float) $item['qty_received'] <= 0) continue;

                $anyReceived = true;
                $unitPrice   = (float) ($item['unit_price_ht'] ?? $poItem->unit_price_ht);

                PurchaseReceptionItem::create([
                    'reception_id'    => $reception->id,
                    'product_id'      => $poItem->product_id,
                    'qty_ordered'     => $poItem->qty_ordered,
                    'qty_received'    => $item['qty_received'],
                    'qty_rejected'    => $item['qty_rejected'] ?? 0,
                    'unit_price_ht'   => $unitPrice,
                    'lot_number'      => $item['lot_number'] ?? null,
                    'manufacture_date' => $item['manufacture_date'] ?? null,
                    'expiry_date'     => $item['expiry_date'] ?? null,
                ]);

                $stock->move(
                    $purchaseOrder->store_id,
                    $poItem->product_id,
                    'purchase_in',
                    (float) $item['qty_received'],
                    $unitPrice,
                    null,
                    $request->user()->id,
                    null, null,
                    "{$receptionRef} — BC {$purchaseOrder->reference}"
                );
            }

            if (!$anyReceived) {
                DB::rollBack();
                return response()->json(['message' => 'Aucune quantité valide réceptionnée.'], 422);
            }

            // Recalculate status
            $totalOrdered  = $purchaseOrder->items()->sum('qty_ordered');
            $totalReceived = PurchaseReceptionItem::whereHas(
                'reception', fn($q) => $q->where('purchase_order_id', $purchaseOrder->id)
            )->sum('qty_received');

            $newStatus = $totalReceived >= $totalOrdered ? 'received' : 'partial';
            $purchaseOrder->update(['status' => $newStatus]);

            return response()->json([
                'message'    => 'Réception enregistrée avec succès.',
                'reception'  => $reception->load('items.product:id,name'),
                'new_status' => $newStatus,
            ]);
        });
    }

    public function destroy(PurchaseOrder $purchaseOrder)
    {
        if ($purchaseOrder->status !== 'draft') {
            return response()->json(['message' => 'Seules les commandes brouillon peuvent être supprimées.'], 422);
        }
        $purchaseOrder->items()->delete();
        $purchaseOrder->delete();
        return response()->json(null, 204);
    }

    private function syncItems(PurchaseOrder $order, array $items): array
    {
        $totalHt = 0;
        foreach ($items as $item) {
            $ht = (float) $item['qty_ordered'] * (float) $item['unit_price_ht'];
            $totalHt += $ht;
            PurchaseOrderItem::create([
                'purchase_order_id' => $order->id,
                'product_id'        => $item['product_id'],
                'qty_ordered'       => $item['qty_ordered'],
                'unit_price_ht'     => $item['unit_price_ht'],
                'vat_rate'          => $item['vat_rate'] ?? 18,
            ]);
        }
        return [$totalHt];
    }
}
