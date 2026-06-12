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

            $subtotalHt = 0;
            $vatAmount = 0;
            $discountAmount = 0;

            foreach ($items as $itemData) {
                $product = Product::findOrFail($itemData['product_id']);

                $qty = $itemData['qty'];
                $unitPriceTtc = $itemData['unit_price_ttc'] ?? $product->sale_price_ttc;
                $vatRate = $product->vat_rate;
                $discountPct = $itemData['discount_pct'] ?? 0;
                $discountAmt = round($unitPriceTtc * $qty * $discountPct / 100, 2);
                $totalTtc = round($unitPriceTtc * $qty - $discountAmt, 2);
                $unitPriceHt = round($unitPriceTtc / (1 + $vatRate / 100), 4);
                $totalHt = round($totalTtc / (1 + $vatRate / 100), 2);

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $product->id,
                    'lot_id' => $itemData['lot_id'] ?? null,
                    'qty' => $qty,
                    'unit_price_ttc' => $unitPriceTtc,
                    'unit_price_ht' => $unitPriceHt,
                    'vat_rate' => $vatRate,
                    'discount_pct' => $discountPct,
                    'discount_amount' => $discountAmt,
                    'total_ht' => $totalHt,
                    'total_ttc' => $totalTtc,
                    'cost_price' => $product->stockLevel?->avg_cost ?? 0,
                    'promotion_applied' => $itemData['promotion_applied'] ?? null,
                ]);

                $subtotalHt += $totalHt;
                $vatAmount += $totalTtc - $totalHt;
                $discountAmount += $discountAmt;

                // Destock
                $this->stockService->move(
                    storeId: $sale->store_id,
                    productId: $product->id,
                    type: 'sale_out',
                    qty: $qty,
                    lotId: $itemData['lot_id'] ?? null,
                    userId: $sale->user_id,
                    referenceType: 'sales',
                    referenceId: $sale->id,
                );
            }

            $totalTtc = $subtotalHt + $vatAmount - $discountAmount;
            $paidAmount = collect($payments)->sum('amount');

            $sale->update([
                'subtotal_ht' => $subtotalHt,
                'vat_amount' => $vatAmount,
                'discount_amount' => $discountAmount,
                'total_ttc' => $totalTtc,
                'paid_amount' => $paidAmount,
                'change_amount' => max(0, $paidAmount - $totalTtc),
                'status' => 'completed',
            ]);

            foreach ($payments as $payment) {
                SalePayment::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $payment['payment_method'],
                    'amount' => $payment['amount'],
                    'reference' => $payment['reference'] ?? null,
                    'voucher_code' => $payment['voucher_code'] ?? null,
                ]);
            }

            $this->issueTicket($sale);
            $this->handleLoyalty($sale);

            return $sale->fresh(['items', 'payments', 'ticket', 'client']);
        });
    }

    private function issueTicket(Sale $sale): SaleTicket
    {
        $date = now()->format('Ymd');
        $seq = SaleTicket::whereDate('created_at', today())
            ->where('type', 'receipt')
            ->count() + 1;

        return SaleTicket::create([
            'sale_id' => $sale->id,
            'type' => 'receipt',
            'number' => 'TKT' . $date . str_pad($seq, 6, '0', STR_PAD_LEFT),
            'qr_code' => Str::uuid(),
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
            $client->increment('loyalty_points', $pointsEarned);
            \App\Models\LoyaltyTransaction::create([
                'client_id' => $client->id,
                'sale_id' => $sale->id,
                'type' => 'earn',
                'points' => $pointsEarned,
                'balance_after' => $client->fresh()->loyalty_points,
            ]);
            $sale->update(['loyalty_points_earned' => $pointsEarned]);
        }
    }

    public function cancelSale(Sale $sale, string $reason, int $supervisorId): Sale
    {
        return DB::transaction(function () use ($sale, $reason, $supervisorId) {
            if ($sale->status === 'cancelled') {
                throw new \Exception('Cette vente est déjà annulée.');
            }

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

            $sale->update([
                'status' => 'cancelled',
                '_force_update' => true,
            ]);

            \App\Services\AuditService::log('sale_cancelled', 'sales', $sale->id, [
                'reason' => $reason,
                'supervisor_id' => $supervisorId,
            ]);

            return $sale;
        });
    }
}
