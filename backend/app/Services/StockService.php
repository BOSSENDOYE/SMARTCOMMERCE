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
        $lotDecrements = [];

        foreach ($items as $item) {
            $level = $levels->get($item['product_id']);
            if (!$level) continue;

            $qty = abs($item['qty']);
            $level->qty_on_hand -= $qty;
            $level->last_updated = $now;
            $level->save(); // UPDATE per level (can't avoid without raw CASE WHEN)

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
                'stock_after'    => $level->qty_on_hand,
                'reference_type' => 'sales',
                'reference_id'   => $saleId,
                'reason'         => null,
                'notes'          => null,
                'created_at'     => $now,
                'updated_at'     => $now,
            ];
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

    public function getStockValue(int $storeId): float
    {
        return StockLevel::where('store_id', $storeId)
            ->where('qty_on_hand', '>', 0)
            ->sum(DB::raw('qty_on_hand * avg_cost'));
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
