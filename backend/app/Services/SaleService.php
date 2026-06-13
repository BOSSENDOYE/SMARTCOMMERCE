<?php

namespace App\Services;

use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalePayment;
use App\Models\SaleTicket;
use App\Models\Client;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SaleService
{
    public function __construct(private StockService $stockService) {}

    public function createSale(array $data, array $items, array $payments): Sale
    {
        return DB::transaction(function () use ($data, $items, $payments) {
            // Generate reference before INSERT (NOT NULL constraint)
            $date = now()->format('Ymd');
            $last = Sale::whereDate('created_at', today())
                ->where('store_id', $data['store_id'])
                ->orderByDesc('id')->value('reference');
            $seq = $last ? (int)substr($last, -6) + 1 : 1;
            $data['reference'] = 'VTE' . $date . str_pad($seq, 6, '0', STR_PAD_LEFT);

            $sale = Sale::create($data);

            // Pre-load ALL products + stock levels in ONE query (eliminates N+1)
            $productIds = array_column($items, 'product_id');
            $products = Product::with(['stockLevel' => fn($q) => $q->where('store_id', $data['store_id'])])
                ->whereIn('id', $productIds)
                ->get()
                ->keyBy('id');

            $subtotalHt   = 0;
            $vatAmount    = 0;
            $discountAmount = 0;
            $now          = now();
            $saleItemsInsert = [];
            $stockMoveItems  = [];

            foreach ($items as $itemData) {
                $product = $products[$itemData['product_id']];

                $qty          = $itemData['qty'];
                $unitPriceTtc = $itemData['unit_price_ttc'] ?? $product->sale_price_ttc;
                $vatRate      = $product->vat_rate;
                $discountPct  = $itemData['discount_pct'] ?? 0;
                $discountAmt  = round($unitPriceTtc * $qty * $discountPct / 100, 2);
                $totalTtc     = round($unitPriceTtc * $qty - $discountAmt, 2);
                $unitPriceHt  = round($unitPriceTtc / (1 + $vatRate / 100), 4);
                $totalHt      = round($totalTtc / (1 + $vatRate / 100), 2);

                $saleItemsInsert[] = [
                    'sale_id'           => $sale->id,
                    'product_id'        => $product->id,
                    'lot_id'            => $itemData['lot_id'] ?? null,
                    'qty'               => $qty,
                    'unit_price_ttc'    => $unitPriceTtc,
                    'unit_price_ht'     => $unitPriceHt,
                    'vat_rate'          => $vatRate,
                    'discount_pct'      => $discountPct,
                    'discount_amount'   => $discountAmt,
                    'total_ht'          => $totalHt,
                    'total_ttc'         => $totalTtc,
                    'cost_price'        => $product->stockLevel?->avg_cost ?? 0,
                    'promotion_applied' => $itemData['promotion_applied'] ?? null,
                    'created_at'        => $now,
                    'updated_at'        => $now,
                ];

                $stockMoveItems[] = [
                    'product_id' => $product->id,
                    'qty'        => $qty,
                    'lot_id'     => $itemData['lot_id'] ?? null,
                ];

                $subtotalHt     += $totalHt;
                $vatAmount      += $totalTtc - $totalHt;
                $discountAmount += $discountAmt;
            }

            // ONE INSERT for all sale items instead of N individual INSERTs
            SaleItem::insert($saleItemsInsert);

            // Batch destock: 1 SELECT + N UPDATEs + 1 INSERT (instead of N×(SELECT+UPDATE+INSERT))
            $this->stockService->batchSaleOut($sale->store_id, $stockMoveItems, $sale->user_id, $sale->id);

            $totalTtc   = $subtotalHt + $vatAmount - $discountAmount;
            $paidAmount = collect($payments)->sum('amount');

            $sale->update([
                'subtotal_ht'     => $subtotalHt,
                'vat_amount'      => $vatAmount,
                'discount_amount' => $discountAmount,
                'total_ttc'       => $totalTtc,
                'paid_amount'     => $paidAmount,
                'change_amount'   => max(0, $paidAmount - $totalTtc),
                'status'          => 'completed',
            ]);

            // ONE INSERT for all payments
            SalePayment::insert(array_map(fn($p) => [
                'sale_id'        => $sale->id,
                'payment_method' => $p['payment_method'],
                'amount'         => $p['amount'],
                'reference'      => $p['reference'] ?? null,
                'voucher_code'   => $p['voucher_code'] ?? null,
                'created_at'     => $now,
                'updated_at'     => $now,
            ], $payments));

            $this->issueTicket($sale);
            $this->handleLoyalty($sale);

            return $sale->fresh(['items', 'payments', 'ticket', 'client']);
        });
    }

    private function issueTicket(Sale $sale): SaleTicket
    {
        $date = now()->format('Ymd');
        // Use MAX(id) order instead of COUNT to avoid full table scan
        $lastNumber = SaleTicket::whereDate('created_at', today())
            ->where('type', 'receipt')
            ->orderByDesc('id')
            ->value('number');
        $seq = $lastNumber ? (int)substr($lastNumber, -6) + 1 : 1;

        return SaleTicket::create([
            'sale_id'     => $sale->id,
            'type'        => 'receipt',
            'number'      => 'TKT' . $date . str_pad($seq, 6, '0', STR_PAD_LEFT),
            'qr_code'     => Str::uuid(),
            'print_count' => 1,
        ]);
    }

    private function handleLoyalty(Sale $sale): void
    {
        if (!$sale->client_id) return;

        $client = $sale->client;
        // 1 point per 100 FCFA spent
        $pointsEarned = floor($sale->total_ttc / 100);

        if ($pointsEarned > 0) {
            // Compute balance before increment to avoid extra fresh() SELECT
            $balanceAfter = ($client->loyalty_points ?? 0) + $pointsEarned;
            $client->increment('loyalty_points', $pointsEarned);
            \App\Models\LoyaltyTransaction::create([
                'client_id'    => $client->id,
                'sale_id'      => $sale->id,
                'type'         => 'earn',
                'points'       => $pointsEarned,
                'balance_after' => $balanceAfter,
            ]);
            $sale->update(['loyalty_points_earned' => $pointsEarned]);
        }
    }

    public function cancelSale(
        Sale $sale,
        string $reason,
        int $supervisorId,
        string $refundMethod = 'none',
        float $refundAmount = 0,
    ): Sale {
        return DB::transaction(function () use ($sale, $reason, $supervisorId, $refundMethod, $refundAmount) {
            if ($sale->status === 'cancelled') {
                throw new \Exception('Cette vente est déjà annulée.');
            }

            // Re-stock all items
            foreach ($sale->items as $item) {
                $this->stockService->move(
                    storeId: $sale->store_id,
                    productId: $item->product_id,
                    type: 'return_in',
                    qty: $item->qty,
                    lotId: $item->lot_id,
                    userId: $supervisorId,
                    referenceType: 'sales',
                    referenceId: $sale->id,
                    reason: 'Annulation: ' . $reason,
                );
            }

            $hasRefund = $refundMethod !== 'none' && $refundMethod !== null;

            $sale->update([
                'status'               => 'cancelled',
                'cancellation_reason'  => $reason,
                'cancelled_by'         => $supervisorId,
                'cancelled_at'         => now(),
                'refund_method'        => $hasRefund ? $refundMethod : null,
                'refund_amount'        => $hasRefund ? ($refundAmount > 0 ? $refundAmount : (float) $sale->paid_amount) : null,
                'refunded_at'          => $hasRefund ? now() : null,
            ]);

            \App\Services\AuditService::log('sale_cancelled', 'sales', $sale->id, [
                'reason'        => $reason,
                'supervisor_id' => $supervisorId,
                'refund_method' => $refundMethod,
                'refund_amount' => $refundAmount,
            ]);

            return $sale->fresh(['items', 'payments', 'client', 'user']);
        });
    }
}
