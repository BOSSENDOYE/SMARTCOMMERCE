<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventorySession;
use App\Models\InventorySessionItem;
use App\Models\InventorySheet;
use App\Models\Product;
use App\Models\StockLevel;
use Illuminate\Http\Request;

class InventorySheetController extends Controller
{
    public function store(Request $request, InventorySession $inventorySession)
    {
        abort_if($inventorySession->store_id !== $request->user()->store_id, 403);

        if ($inventorySession->status === 'completed') {
            return response()->json(['message' => 'Session terminée, non modifiable.'], 422);
        }

        $data = $request->validate([
            'name'          => 'required|string|max:100',
            'type'          => 'required|in:section,free',
            'section_id'    => 'nullable|exists:store_sections,id',
            'assigned_to'   => 'nullable|exists:users,id',
            'product_ids'   => 'nullable|array',
            'product_ids.*' => 'exists:products,id',
        ]);

        if ($data['type'] === 'section' && empty($data['section_id'])) {
            return response()->json(['message' => 'Veuillez sélectionner un rayon.'], 422);
        }

        $sheet = InventorySheet::create([
            'session_id'  => $inventorySession->id,
            'name'        => $data['name'],
            'type'        => $data['type'],
            'section_id'  => $data['section_id'] ?? null,
            'assigned_to' => $data['assigned_to'] ?? null,
            'status'      => 'draft',
        ]);

        $productIds = $data['product_ids'] ?? null;

        if ($data['type'] === 'section' && !empty($data['section_id'])) {
            $query = Product::where('section_id', $data['section_id']);
            if (!empty($productIds)) {
                $query->whereIn('id', $productIds);
            }
            $products = $query->get();

            if ($products->isNotEmpty()) {
                $stockLevels = StockLevel::where('store_id', $inventorySession->store_id)
                    ->whereIn('product_id', $products->pluck('id'))
                    ->get()
                    ->keyBy('product_id');

                // Skip products already assigned to another sheet in this session
                $existingProductIds = InventorySessionItem::where('session_id', $inventorySession->id)
                    ->pluck('product_id')
                    ->all();

                $rows = $products
                    ->filter(fn($p) => !in_array($p->id, $existingProductIds))
                    ->map(fn($p) => [
                        'session_id'      => $inventorySession->id,
                        'sheet_id'        => $sheet->id,
                        'product_id'      => $p->id,
                        'theoretical_qty' => $stockLevels[$p->id]->qty_on_hand ?? 0,
                        'unit_cost'       => $stockLevels[$p->id]->avg_cost ?? 0,
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ])->values()->toArray();

                if (!empty($rows)) {
                    InventorySessionItem::insert($rows);
                }
            }
        }

        if (in_array($inventorySession->status, ['draft', 'scheduled'])) {
            $inventorySession->update(['status' => 'counting']);
        }

        return response()->json(
            $sheet->load([
                'section:id,name,color,icon',
                'assignedTo:id,name',
                'items.product:id,name,internal_code',
                'items.product.unit:id,abbreviation',
            ]),
            201
        );
    }

    /**
     * My sheets: sheets assigned to the current user in any active inventory session.
     */
    public function mySheets(Request $request)
    {
        $storeId = $request->user()->store_id;
        $userId  = $request->user()->id;

        $session = InventorySession::where('store_id', $storeId)
            ->whereIn('status', ['draft', 'counting', 'pending'])
            ->latest('started_at')
            ->first();

        if (!$session) {
            return response()->json(['session' => null, 'sheets' => []]);
        }

        $sheets = $session->sheets()
            ->where('assigned_to', $userId)
            ->whereNotIn('status', ['cancelled'])
            ->with([
                'section:id,name,color,icon',
                'items.product:id,name,internal_code,barcode',
                'items.product.unit:id,abbreviation',
                'items.countedBy:id,name',
            ])
            ->get();

        return response()->json([
            'session' => [
                'id'           => $session->id,
                'name'         => $session->name,
                'status'       => $session->status,
                'sales_blocked'=> $session->sales_mode === 'blocked',
            ],
            'sheets' => $sheets,
        ]);
    }

    /**
     * Add or update an item in a specific sheet (mobile counting).
     * If product not already in session → auto-assign to this sheet (scan libre).
     * A product cannot belong to two different sheets in the same session.
     */
    public function addSheetItem(Request $request, InventorySession $inventorySession, InventorySheet $sheet)
    {
        abort_if($inventorySession->store_id !== $request->user()->store_id, 403);
        abort_if($sheet->session_id !== $inventorySession->id, 422);

        if (!in_array($inventorySession->status, ['draft', 'counting', 'pending'])) {
            return response()->json(['message' => 'Session non modifiable dans ce statut.'], 422);
        }

        if ($sheet->status === 'validated') {
            return response()->json(['message' => 'Cette fiche est déjà validée.'], 422);
        }

        $data = $request->validate([
            'product_id'         => 'required|exists:products,id',
            'counted_qty'        => 'required|numeric|min:0',
            'new_expiry_date'    => 'nullable|date',
            'new_sale_price'     => 'nullable|numeric|min:0',
            'new_purchase_price' => 'nullable|numeric|min:0',
        ]);

        // Check if product is already in ANOTHER sheet
        $existingItem = InventorySessionItem::where('session_id', $inventorySession->id)
            ->where('product_id', $data['product_id'])
            ->first();

        if ($existingItem && $existingItem->sheet_id && $existingItem->sheet_id !== $sheet->id) {
            // Product belongs to another sheet — check if that sheet is cancelled
            $otherSheet = InventorySheet::find($existingItem->sheet_id);
            if ($otherSheet && $otherSheet->status !== 'cancelled') {
                return response()->json([
                    'message' => "Ce produit est déjà dans la fiche \"{$otherSheet->name}\". Un produit ne peut appartenir qu'à une seule fiche.",
                ], 422);
            }
        }

        $level = StockLevel::where('product_id', $data['product_id'])
            ->where('store_id', $inventorySession->store_id)
            ->first();

        $theoreticalQty = $level?->qty_on_hand ?? 0;
        $unitCost       = $level?->avg_cost ?? 0;

        $item = InventorySessionItem::updateOrCreate(
            ['session_id' => $inventorySession->id, 'product_id' => $data['product_id']],
            [
                'sheet_id'           => $sheet->id,
                'counted_qty'        => $data['counted_qty'],
                'theoretical_qty'    => $existingItem ? $existingItem->theoretical_qty : $theoreticalQty,
                'unit_cost'          => $existingItem ? $existingItem->unit_cost : $unitCost,
                'variance_value'     => ($data['counted_qty'] - ($existingItem?->theoretical_qty ?? $theoreticalQty)) * ($existingItem?->unit_cost ?? $unitCost),
                'counted_at'         => now(),
                'counted_by'         => $request->user()->id,
                'new_expiry_date'    => $data['new_expiry_date'] ?? null,
                'new_sale_price'     => $data['new_sale_price'] ?? null,
                'new_purchase_price' => $data['new_purchase_price'] ?? null,
            ]
        );

        // Move session and sheet to counting if still in draft
        if ($inventorySession->status === 'draft') {
            $inventorySession->update(['status' => 'counting']);
        }
        if ($sheet->status === 'draft') {
            $sheet->update(['status' => 'counting']);
        }

        return response()->json(
            $item->load(['product:id,name,internal_code', 'product.unit:id,abbreviation', 'countedBy:id,name'])
        );
    }

    public function validateSheet(Request $request, InventorySession $inventorySession, InventorySheet $sheet)
    {
        abort_if($inventorySession->store_id !== $request->user()->store_id, 403);
        abort_if($sheet->session_id !== $inventorySession->id, 422);

        if ($sheet->status === 'validated') {
            return response()->json(['message' => 'Cette fiche est déjà validée.'], 422);
        }

        $uncounted = $sheet->items()->whereNull('counted_qty')->count();
        if ($uncounted > 0) {
            return response()->json([
                'message' => "{$uncounted} article(s) non compté(s) dans cette fiche. Complétez le comptage avant de valider.",
            ], 422);
        }

        $sheet->update([
            'status'       => 'validated',
            'validated_by' => $request->user()->id,
            'validated_at' => now(),
        ]);

        // If all non-cancelled sheets are validated, move session to 'pending'
        $hasDraftSheets = $inventorySession->sheets()
            ->whereNotIn('status', ['validated', 'cancelled'])
            ->exists();

        if (!$hasDraftSheets) {
            $inventorySession->update(['status' => 'pending']);
        }

        return response()->json(
            $sheet->fresh()->load(['validatedBy:id,name', 'assignedTo:id,name'])
        );
    }

    public function destroy(InventorySession $inventorySession, InventorySheet $sheet)
    {
        abort_if($inventorySession->store_id !== request()->user()->store_id, 403);

        if ($sheet->status === 'validated') {
            return response()->json(['message' => 'Impossible de supprimer une fiche déjà validée.'], 422);
        }

        $sheet->delete();
        return response()->json(['message' => 'Fiche supprimée.']);
    }
}
