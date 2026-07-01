<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockLevel;
use App\Models\StockMovement;
use App\Models\ProductLot;
use Illuminate\Support\Facades\DB;

class StockService
{
    public function move(
        int $storeId,
        int $productId,
        string $type,
        float $qty,
        float $unitCost = 0,
        ?int $lotId = null,
        ?int $userId = null,
        string $referenceType = null,
        int $referenceId = null,
        string $reason = null,
        string $notes = null
    ): StockMovement {
        return DB::transaction(function () use (
            $storeId, $productId, $type, $qty, $unitCost,
            $lotId, $userId, $referenceType, $referenceId, $reason, $notes
        ) {
            $level = StockLevel::firstOrCreate(
                ['store_id' => $storeId, 'product_id' => $productId],
                ['qty_on_hand' => 0, 'avg_cost' => 0]
            );

            $isIncoming = in_array($type, [
                'purchase_in', 'return_in', 'transfer_in',
                'adjustment_in', 'opening', 'inventory_adjustment'
            ]);

            $qtyDelta = $isIncoming ? abs($qty) : -abs($qty);

            if ($isIncoming && $unitCost > 0) {
                $this->recalcAvgCost($level, abs($qty), $unitCost);
            }

            $level->qty_on_hand += $qtyDelta;
            $level->last_updated = now();
            $level->save();

            if ($lotId) {
                $lot = ProductLot::find($lotId);
                if ($lot) {
                    $lot->current_qty += $qtyDelta;
                    $lot->save();
                }
            }

            return StockMovement::create([
                'store_id' => $storeId,
                'product_id' => $productId,
                'lot_id' => $lotId,
                'user_id' => $userId,
                'type' => $type,
                'qty' => abs($qty),
                'unit_cost' => $unitCost ?: $level->avg_cost,
                'stock_after' => $level->qty_on_hand,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'reason' => $reason,
                'notes' => $notes,
            ]);
        });
    }

    private function recalcAvgCost(StockLevel $level, float $incomingQty, float $incomingCost): void
    {
        $currentQty = max(0, $level->qty_on_hand);
        $currentCost = $level->avg_cost;
        $totalQty = $currentQty + $incomingQty;

        if ($totalQty > 0) {
            $level->avg_cost = round(
                ($currentQty * $currentCost + $incomingQty * $incomingCost) / $totalQty,
                4
            );
        }
    }

    /**
     * Batch destock for a completed sale — single query per table instead of N queries.
     * @param array $items [['product_id', 'qty', 'lot_id'?], ...]
     */
    public function batchSaleOut(int $storeId, array $items, int $userId, int $saleId): void
    {
        if (empty($items)) return;

        $productIds = array_column($items, 'product_id');
        $now = now();

        // Load all stock levels in ONE query
        $levels = StockLevel::where('store_id', $storeId)
            ->whereIn('product_id', $productIds)
            ->get()
            ->keyBy('product_id');

        $movementsToInsert = [];
        $lotDecrements     = [];
        $caseParams        = [];
        $caseBindings      = [];

        foreach ($items as $item) {
            $level = $levels->get($item['product_id']);
            if (!$level) continue;

            $qty = abs($item['qty']);
            $newQty = $level->qty_on_hand - $qty;

            // Prepare CASE WHEN clause (no individual save)
            $caseParams[]   = 'WHEN product_id = ? THEN ?';
            $caseBindings[] = (int)   $item['product_id'];
            $caseBindings[] = (float) $newQty;
            $level->qty_on_hand = $newQty; // update in-memory for stock_after below

            if (!empty($item['lot_id'])) {
                $lotDecrements[$item['lot_id']] = ($lotDecrements[$item['lot_id']] ?? 0) + $qty;
            }

            $movementsToInsert[] = [
                'store_id'       => $storeId,
                'product_id'     => $item['product_id'],
                'lot_id'         => $item['lot_id'] ?? null,
                'user_id'        => $userId,
                'type'           => 'sale_out',
                'qty'            => $qty,
                'unit_cost'      => $level->avg_cost,
                'stock_after'    => $newQty,
                'reference_type' => 'sales',
                'reference_id'   => $saleId,
                'reason'         => null,
                'notes'          => null,
                'created_at'     => $now,
            ];
        }

        // ONE UPDATE for all stock levels (CASE WHEN replaces N individual saves)
        if (!empty($caseParams)) {
            $caseClause     = implode(' ', $caseParams);
            $inPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
            DB::statement(
                "UPDATE stock_levels SET qty_on_hand = CASE {$caseClause} ELSE qty_on_hand END, last_updated = ? WHERE store_id = ? AND product_id IN ({$inPlaceholders})",
                array_merge($caseBindings, [$now, $storeId], $productIds)
            );
        }

        // Batch decrement lots (one query per distinct lot)
        foreach ($lotDecrements as $lotId => $qty) {
            ProductLot::where('id', $lotId)->decrement('current_qty', $qty);
        }

        // ONE INSERT for all stock movements
        if (!empty($movementsToInsert)) {
            StockMovement::insert($movementsToInsert);
        }
    }

    public function getStockValue(int $storeId): array
    {
        $row = StockLevel::where('stock_levels.store_id', $storeId)
            ->where('stock_levels.qty_on_hand', '>', 0)
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->whereNull('products.deleted_at')
            ->selectRaw('
                COALESCE(SUM(stock_levels.qty_on_hand * products.purchase_price_ht), 0)  AS purchase_value,
                COALESCE(SUM(stock_levels.qty_on_hand * products.sale_price_ttc), 0)     AS sale_value
            ')
            ->first();

        return [
            'purchase' => (float) ($row->purchase_value ?? 0),
            'sale'     => (float) ($row->sale_value     ?? 0),
        ];
    }

    public function getLowStockProducts(int $storeId): \Illuminate\Support\Collection
    {
        return Product::active()
            ->forStore($storeId)
            ->whereHas('stockLevel', fn($q) => $q
                ->where('store_id', $storeId)
                ->whereRaw('qty_on_hand <= products.alert_stock')
            )
            ->with(['stockLevel', 'category'])
            ->get();
    }

    public function getExpiringProducts(int $storeId, int $days = 30): \Illuminate\Support\Collection
    {
        return ProductLot::where('store_id', $storeId)
            ->where('current_qty', '>', 0)
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', now()->addDays($days))
            ->where('expiry_date', '>=', now())
            ->with(['product'])
            ->orderBy('expiry_date')
            ->get();
    }
}
