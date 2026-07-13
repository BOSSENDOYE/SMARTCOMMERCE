<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\DeliveryItem;
use App\Models\Invoice;
use App\Models\Sale;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeliveryController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    // ── Liste ─────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $q = Delivery::where('store_id', $this->storeId($request))
            ->with(['client:id,name', 'createdBy:id,name'])
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }
        if ($request->filled('client_id')) {
            $q->where('client_id', $request->client_id);
        }
        if ($request->filled('date_from')) {
            $q->whereDate('delivery_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $q->whereDate('delivery_date', '<=', $request->date_to);
        }
        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $q->where(fn($sq) => $sq->where('reference', 'like', $s)
                ->orWhereHas('client', fn($cq) => $cq->where('name', 'like', $s)));
        }

        return response()->json($q->paginate($request->input('per_page', 20)));
    }

    // ── Créer ─────────────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id'        => 'nullable|integer|exists:clients,id',
            'invoice_id'       => 'nullable|integer|exists:invoices,id',
            'sale_id'          => 'nullable|integer|exists:sales,id',
            'delivery_date'    => 'nullable|date',
            'shipping_address' => 'nullable|string|max:500',
            'notes'            => 'nullable|string|max:1000',
            'items'            => 'required|array|min:1',
            'items.*.product_id'  => 'nullable|integer|exists:products,id',
            'items.*.description' => 'required|string|max:500',
            'items.*.quantity'    => 'required|numeric|min:0.001',
            'items.*.unit'        => 'nullable|string|max:20',
            'items.*.unit_cost'   => 'nullable|numeric|min:0',
        ]);

        $delivery = DB::transaction(function () use ($data, $request) {
            $storeId = $this->storeId($request);

            $delivery = Delivery::create([
                'store_id'         => $storeId,
                'client_id'        => $data['client_id'] ?? null,
                'invoice_id'       => $data['invoice_id'] ?? null,
                'sale_id'          => $data['sale_id'] ?? null,
                'created_by'       => $request->user()->id,
                'reference'        => Delivery::generateReference($storeId),
                'status'           => 'draft',
                'delivery_date'    => $data['delivery_date'] ?? null,
                'shipping_address' => $data['shipping_address'] ?? null,
                'notes'            => $data['notes'] ?? null,
                'total_qty'        => collect($data['items'])->sum('quantity'),
            ]);

            foreach ($data['items'] as $i => $item) {
                DeliveryItem::create([
                    'delivery_id' => $delivery->id,
                    'product_id'  => $item['product_id'] ?? null,
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit'        => $item['unit'] ?? 'U',
                    'unit_cost'   => $item['unit_cost'] ?? 0,
                    'sort_order'  => $i,
                ]);
            }

            return $delivery;
        });

        return response()->json($delivery->load(['items.product', 'client', 'createdBy']), 201);
    }

    // ── Détail ────────────────────────────────────────────────────────────────

    public function show(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        return response()->json(
            $delivery->load(['items.product', 'client', 'invoice', 'sale', 'createdBy'])
        );
    }

    // ── Modifier ──────────────────────────────────────────────────────────────

    public function update(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status !== 'draft', 422, 'Seul un BL en brouillon peut être modifié.');

        $data = $request->validate([
            'client_id'        => 'nullable|integer|exists:clients,id',
            'delivery_date'    => 'nullable|date',
            'shipping_address' => 'nullable|string|max:500',
            'notes'            => 'nullable|string|max:1000',
            'items'            => 'sometimes|array|min:1',
            'items.*.product_id'  => 'nullable|integer|exists:products,id',
            'items.*.description' => 'required_with:items|string|max:500',
            'items.*.quantity'    => 'required_with:items|numeric|min:0.001',
            'items.*.unit'        => 'nullable|string|max:20',
            'items.*.unit_cost'   => 'nullable|numeric|min:0',
        ]);

        DB::transaction(function () use ($data, $delivery) {
            $delivery->update(array_filter([
                'client_id'        => $data['client_id'] ?? $delivery->client_id,
                'delivery_date'    => $data['delivery_date'] ?? $delivery->delivery_date,
                'shipping_address' => $data['shipping_address'] ?? $delivery->shipping_address,
                'notes'            => $data['notes'] ?? $delivery->notes,
            ]));

            if (isset($data['items'])) {
                $delivery->items()->delete();
                foreach ($data['items'] as $i => $item) {
                    DeliveryItem::create([
                        'delivery_id' => $delivery->id,
                        'product_id'  => $item['product_id'] ?? null,
                        'description' => $item['description'],
                        'quantity'    => $item['quantity'],
                        'unit'        => $item['unit'] ?? 'U',
                        'unit_cost'   => $item['unit_cost'] ?? 0,
                        'sort_order'  => $i,
                    ]);
                }
                $delivery->update(['total_qty' => collect($data['items'])->sum('quantity')]);
            }
        });

        return response()->json($delivery->fresh()->load(['items.product', 'client', 'createdBy']));
    }

    // ── Supprimer ─────────────────────────────────────────────────────────────

    public function destroy(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status !== 'draft', 422, 'Seul un BL en brouillon peut être supprimé.');

        $delivery->delete();
        return response()->json(['message' => 'BL supprimé.']);
    }

    // ── Workflow ──────────────────────────────────────────────────────────────

    public function confirm(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status !== 'draft', 422, 'Le BL doit être en brouillon pour être confirmé.');

        $delivery->update(['status' => 'confirmed']);
        return response()->json($delivery);
    }

    public function ship(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status !== 'confirmed', 422, 'Le BL doit être confirmé pour être expédié.');

        $delivery->update(['status' => 'shipped', 'shipped_at' => now()]);
        return response()->json($delivery);
    }

    public function deliver(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status !== 'shipped', 422, 'Le BL doit être expédié pour être livré.');

        $stockService = app(StockService::class);

        DB::transaction(function () use ($delivery, $stockService, $request) {
            $delivery->load('items');

            foreach ($delivery->items as $item) {
                if ($item->product_id && !$item->stock_moved) {
                    $stockService->move(
                        storeId: $delivery->store_id,
                        productId: $item->product_id,
                        type: 'sale_out',
                        qty: (float) $item->quantity,
                        unitCost: (float) $item->unit_cost,
                        userId: $request->user()->id,
                        referenceType: 'delivery',
                        referenceId: $delivery->id,
                    );
                    $item->update(['stock_moved' => true]);
                }
            }

            $delivery->update(['status' => 'delivered', 'delivered_at' => now()]);
        });

        return response()->json($delivery->fresh());
    }

    public function cancel(Request $request, Delivery $delivery)
    {
        abort_if($delivery->store_id !== $this->storeId($request), 403);
        abort_if($delivery->status === 'delivered', 422, 'Un BL livré ne peut pas être annulé.');

        $delivery->update(['status' => 'cancelled']);
        return response()->json($delivery);
    }

    // ── Génération depuis source ──────────────────────────────────────────────

    public function fromInvoice(Request $request, Invoice $invoice)
    {
        abort_if($invoice->store_id !== $this->storeId($request), 403);
        $invoice->load(['items.product', 'client']);

        $items = $invoice->items->map(fn($item) => [
            'product_id'  => $item->product_id,
            'description' => $item->product?->name ?? $item->description ?? 'Produit',
            'quantity'    => $item->quantity,
            'unit'        => 'U',
            'unit_cost'   => $item->unit_price_ht ?? 0,
        ]);

        return response()->json([
            'client_id'        => $invoice->client_id,
            'invoice_id'       => $invoice->id,
            'shipping_address' => $invoice->client?->address ?? null,
            'notes'            => "Livraison pour facture {$invoice->reference}",
            'items'            => $items,
        ]);
    }

    public function fromSale(Request $request, Sale $sale)
    {
        abort_if($sale->store_id !== $this->storeId($request), 403);
        $sale->load(['items.product', 'client']);

        $items = $sale->items->map(fn($item) => [
            'product_id'  => $item->product_id,
            'description' => $item->product?->name ?? 'Produit',
            'quantity'    => $item->quantity,
            'unit'        => 'U',
            'unit_cost'   => $item->unit_price ?? 0,
        ]);

        return response()->json([
            'client_id' => $sale->client_id,
            'sale_id'   => $sale->id,
            'notes'     => "Livraison pour vente {$sale->reference}",
            'items'     => $items,
        ]);
    }
}
