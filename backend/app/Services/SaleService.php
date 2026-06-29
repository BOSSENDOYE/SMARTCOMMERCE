<?php

namespace App\Services;

use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalePayment;
use App\Models\SaleTicket;
use App\Models\Client;
use App\Models\ClientAccountTransaction;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SaleService
{
    public function __construct(private StockService $stockService) {}

    public function createSale(array $data, array $items, array $payments): Sale
    {
        return DB::transaction(function () use ($data, $items, $payments) {
            // Extract non-column fields before Sale::create()
            $globalDiscount = (float) ($data['global_discount_amount'] ?? 0);
            unset($data['global_discount_amount']);

            // Serialize reference generation to prevent duplicate key on concurrent sales
            DB::statement('SELECT pg_advisory_xact_lock(42)');
            $date = now()->format('Ymd');
            $last = Sale::whereDate('created_at', today())
                ->orderByDesc('id')->value('reference');
            $seq = $last ? (int)substr($last, -6) + 1 : 1;
            $data['reference'] = 'VTE' . $date . str_pad($seq, 6, '0', STR_PAD_LEFT);

            $sale = Sale::create($data);

            // Pre-load products (only those with product_id)
            $productIds = array_values(array_filter(array_column($items, 'product_id')));
            $products = !empty($productIds)
                ? Product::with(['stockLevel' => fn($q) => $q->where('store_id', $data['store_id'])])
                    ->whereIn('id', $productIds)->get()->keyBy('id')
                : collect();

            // Pre-load restaurant items (only those with restaurant_item_id)
            $restaurantItemIds = array_values(array_filter(array_column($items, 'restaurant_item_id')));
            $restaurantItems = !empty($restaurantItemIds)
                ? \App\Models\RestaurantItem::whereIn('id', $restaurantItemIds)->get()->keyBy('id')
                : collect();

            $subtotalHt   = 0;
            $vatAmount    = 0;
            $discountAmount = 0;
            $now          = now();
            $saleItemsInsert = [];
            $stockMoveItems  = [];

            foreach ($items as $itemData) {
                if (!empty($itemData['restaurant_item_id'])) {
                    // ── Restaurant item (no stock deduction) ──────────────────
                    $rItem        = $restaurantItems[$itemData['restaurant_item_id']];
                    $qty          = $itemData['qty'];
                    $unitPriceTtc = $itemData['unit_price_ttc'] ?? $rItem->price_ttc;
                    $vatRate      = $rItem->vat_rate;
                    $discountPct  = $itemData['discount_pct'] ?? 0;
                    $discountAmt  = round($unitPriceTtc * $qty * $discountPct / 100, 2);
                    $totalTtc     = round($unitPriceTtc * $qty - $discountAmt, 2);
                    $unitPriceHt  = round($unitPriceTtc / (1 + $vatRate / 100), 4);
                    $totalHt      = round($totalTtc / (1 + $vatRate / 100), 2);

                    $saleItemsInsert[] = [
                        'sale_id'              => $sale->id,
                        'product_id'           => null,
                        'restaurant_item_id'   => $rItem->id,
                        'lot_id'               => null,
                        'qty'                  => $qty,
                        'unit_price_ttc'       => $unitPriceTtc,
                        'unit_price_ht'        => $unitPriceHt,
                        'vat_rate'             => $vatRate,
                        'discount_pct'         => $discountPct,
                        'discount_amount'      => $discountAmt,
                        'total_ht'             => $totalHt,
                        'total_ttc'            => $totalTtc,
                        'cost_price'           => $rItem->cost_price ?? 0,
                        'promotion_applied'    => null,
                        'created_at'           => $now,
                        'updated_at'           => $now,
                    ];
                } else {
                    // ── Standard product (with stock deduction) ───────────────
                    $product      = $products[$itemData['product_id']];
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
                        'restaurant_item_id'=> null,
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
                }

                $subtotalHt     += $totalHt;
                $vatAmount      += $totalTtc - $totalHt;
                $discountAmount += $discountAmt;
            }

            // ONE INSERT for all sale items instead of N individual INSERTs
            SaleItem::insert($saleItemsInsert);

            // Batch destock only for product items
            if (!empty($stockMoveItems)) {
                $this->stockService->batchSaleOut($sale->store_id, $stockMoveItems, $sale->user_id, $sale->id);
            }

            // Add cart-level global discount to per-item discounts
            $discountAmount += $globalDiscount;
            $totalTtc   = $subtotalHt + $vatAmount - $discountAmount;
            // account_deposit = monnaie déposée sur le compte client, ne compte pas comme paiement de la vente
            $paidAmount = collect($payments)
                ->filter(fn($p) => $p['payment_method'] !== 'account_deposit')
                ->sum('amount');

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
            $this->handleAccountPayment($sale, $payments, $data['user_id'] ?? null);

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

    private function handleAccountPayment(Sale $sale, array $payments, ?int $userId): void
    {
        if (!$sale->client_id) return;

        $client = $sale->client;

        // ── Paiement depuis le compte (débit compte dépôt) ────────────────────
        $accountAmount = collect($payments)
            ->where('payment_method', 'account')
            ->sum('amount');

        if ($accountAmount > 0) {
            $before = (float) $client->account_balance;
            $after  = $before - $accountAmount;
            $client->update(['account_balance' => $after]);
            ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'sale_id'        => $sale->id,
                'created_by'     => $userId,
                'type'           => 'sale_debit',
                'amount'         => $accountAmount,
                'balance_before' => $before,
                'balance_after'  => $after,
                'note'           => 'Paiement vente ' . $sale->reference,
            ]);
            $client = $client->fresh();
        }

        // ── Crédit client (client nous doit de l'argent) ──────────────────────
        $creditAmount = collect($payments)
            ->where('payment_method', 'credit')
            ->sum('amount');

        if ($creditAmount > 0) {
            $before = (float) ($client->credit_balance ?? 0);
            $after  = $before + $creditAmount;
            $client->update(['credit_balance' => $after]);
            ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'sale_id'        => $sale->id,
                'created_by'     => $userId,
                'type'           => 'credit_sale',
                'amount'         => $creditAmount,
                'balance_before' => $before,
                'balance_after'  => $after,
                'note'           => 'Crédit vente ' . $sale->reference,
            ]);
            $client = $client->fresh();
        }

        // ── Dépôt monnaie sur le compte client (overpayment → avoir) ─────────
        $depositAmount = collect($payments)
            ->where('payment_method', 'account_deposit')
            ->sum('amount');

        if ($depositAmount > 0) {
            $before = (float) $client->account_balance;
            $after  = $before + $depositAmount;
            $client->update(['account_balance' => $after]);
            ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'sale_id'        => $sale->id,
                'created_by'     => $userId,
                'type'           => 'change_deposit',
                'amount'         => $depositAmount,
                'balance_before' => $before,
                'balance_after'  => $after,
                'note'           => 'Dépôt monnaie vente ' . $sale->reference,
            ]);
        }
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

            // Décrémenter credit_balance si la vente était à crédit et pas encore soldée
            if ($sale->client_id) {
                $creditAmt    = (float) $sale->payments()->where('payment_method', 'credit')->sum('amount');
                $encaissedAmt = (float) $sale->payments()->whereNotNull('paid_at')->sum('amount');
                $outstanding  = round(max(0, $creditAmt - $encaissedAmt), 2);
                if ($outstanding > 0.01) {
                    $saleClient = $sale->client;
                    $saleClient->update(['credit_balance' => max(0, (float) $saleClient->credit_balance - $outstanding)]);
                }
            }

            // Refund to account if method is 'account'
            if ($refundMethod === 'account' && $sale->client_id) {
                $client = $sale->client;
                $before = (float) $client->account_balance;
                $amount = $refundAmount > 0 ? $refundAmount : (float) $sale->paid_amount;
                $after  = $before + $amount;
                $client->update(['account_balance' => $after]);
                ClientAccountTransaction::create([
                    'client_id'      => $client->id,
                    'sale_id'        => $sale->id,
                    'created_by'     => $supervisorId,
                    'type'           => 'sale_refund',
                    'amount'         => $amount,
                    'balance_before' => $before,
                    'balance_after'  => $after,
                    'note'           => 'Remboursement annulation ' . $sale->reference,
                ]);
            }

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
