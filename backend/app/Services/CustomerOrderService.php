<?php

namespace App\Services;

use App\Models\CashSession;
use App\Models\CashSessionMovement;
use App\Models\CustomerOrder;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Commandes clients (gâteaux, pièces montées, grosses quantités de pain…).
 *
 * Acomptes : enregistrés sur la commande ; un acompte en espèces est aussi tracé
 * comme dépôt dans la session de caisse ouverte (le tiroir reste juste).
 * Livraison : une vraie vente est créée (stock + CA) — l'acompte y est imputé
 * en paiement « voucher » (référence = n° de commande), le solde est encaissé.
 */
class CustomerOrderService
{
    public const PAYMENT_METHODS = ['cash', 'wave', 'orange_money', 'free_money', 'card', 'check', 'mobile_money', 'bank_transfer'];

    public function __construct(private SaleService $sales) {}

    public function create(int $storeId, int $userId, array $data): CustomerOrder
    {
        return DB::transaction(function () use ($storeId, $userId, $data) {
            $order = CustomerOrder::create([
                'store_id'       => $storeId,
                'user_id'        => $userId,
                'client_id'      => $data['client_id'] ?? null,
                'reference'      => $this->nextReference(),
                'customer_name'  => $data['customer_name'],
                'customer_phone' => $data['customer_phone'] ?? null,
                'pickup_at'      => $data['pickup_at'],
                'notes'          => $data['notes'] ?? null,
                'status'         => 'pending',
            ]);

            $this->syncItems($order, $data['items']);

            if (! empty($data['deposit']['amount'])) {
                $this->addPayment($order, $userId, $data['deposit']['payment_method'], (float) $data['deposit']['amount'], $data['deposit']['reference'] ?? null);
            }

            return $order->fresh();
        });
    }

    public function update(CustomerOrder $order, array $data): CustomerOrder
    {
        $this->assertOpen($order);

        return DB::transaction(function () use ($order, $data) {
            $order->update(array_intersect_key($data, array_flip(['client_id', 'customer_name', 'customer_phone', 'pickup_at', 'notes'])));

            if (isset($data['items'])) {
                $this->syncItems($order, $data['items']);
                if ($order->paid_amount > $order->total_ttc) {
                    throw ValidationException::withMessages(['items' => 'Le total de la commande ne peut pas être inférieur aux acomptes déjà versés.']);
                }
            }

            return $order->fresh();
        });
    }

    public function addPayment(CustomerOrder $order, int $userId, string $method, float $amount, ?string $reference = null): CustomerOrder
    {
        $this->assertOpen($order);

        if ($amount > $order->balance + 0.001) {
            throw ValidationException::withMessages(['amount' => 'Le montant dépasse le reste à payer (' . number_format($order->balance, 0, ',', ' ') . ' FCFA).']);
        }

        return DB::transaction(function () use ($order, $userId, $method, $amount, $reference) {
            $session = $this->openSession($order->store_id, $userId);

            $order->payments()->create([
                'user_id'         => $userId,
                'cash_session_id' => $session?->id,
                'payment_method'  => $method,
                'amount'          => $amount,
                'reference'       => $reference,
                'paid_at'         => now(),
            ]);

            if ($method === 'cash' && $session) {
                CashSessionMovement::create([
                    'cash_session_id' => $session->id,
                    'user_id'         => $userId,
                    'type'            => 'deposit',
                    'amount'          => $amount,
                    'motive'          => "Acompte commande {$order->reference}",
                    'receipt_ref'     => $order->reference,
                ]);
            }

            $order->increment('paid_amount', $amount);

            return $order->fresh();
        });
    }

    public function setStatus(CustomerOrder $order, string $status): CustomerOrder
    {
        $this->assertOpen($order);
        $order->update(['status' => $status]);

        return $order;
    }

    /** Remise au client : crée la vente, impute l'acompte et encaisse le solde. */
    public function deliver(CustomerOrder $order, int $userId, string $balanceMethod): CustomerOrder
    {
        $this->assertOpen($order);

        return DB::transaction(function () use ($order, $userId, $balanceMethod) {
            $order->load('items');
            $session = $this->openSession($order->store_id, $userId);

            $payments = [];
            if ($order->paid_amount > 0) {
                $payments[] = ['payment_method' => 'voucher', 'amount' => $order->paid_amount, 'voucher_code' => $order->reference];
            }
            if ($order->balance > 0) {
                $payments[] = ['payment_method' => $balanceMethod, 'amount' => $order->balance];
            }

            $sale = $this->sales->createSale(
                data: [
                    'store_id'        => $order->store_id,
                    'cash_session_id' => $session?->id,
                    'client_id'       => $order->client_id,
                    'user_id'         => $userId,
                    'status'          => 'draft',
                    'channel'         => 'takeaway',
                    'is_synced'       => true,
                    'synced_at'       => now(),
                    'notes'           => "Commande client {$order->reference} — {$order->customer_name}",
                ],
                items: $order->items->map(fn ($i) => [
                    'product_id'     => $i->product_id,
                    'qty'            => $i->qty,
                    'unit_price_ttc' => $i->unit_price_ttc,
                ])->all(),
                payments: $payments,
            );

            if ($order->balance > 0) {
                $order->payments()->create([
                    'user_id'         => $userId,
                    'cash_session_id' => $session?->id,
                    'payment_method'  => $balanceMethod,
                    'amount'          => $order->balance,
                    'reference'       => $sale->reference,
                    'paid_at'         => now(),
                ]);
            }

            $order->update([
                'status'       => 'delivered',
                'paid_amount'  => $order->total_ttc,
                'sale_id'      => $sale->id,
                'delivered_at' => now(),
            ]);

            return $order->fresh();
        });
    }

    /** Annulation ; si $refund, l'acompte est remboursé (sortie de caisse si espèces). */
    public function cancel(CustomerOrder $order, int $userId, ?string $reason, bool $refund, string $refundMethod = 'cash'): CustomerOrder
    {
        $this->assertOpen($order);

        return DB::transaction(function () use ($order, $userId, $reason, $refund, $refundMethod) {
            if ($refund && $order->paid_amount > 0) {
                $session = $this->openSession($order->store_id, $userId);

                $order->payments()->create([
                    'user_id'         => $userId,
                    'cash_session_id' => $session?->id,
                    'payment_method'  => $refundMethod,
                    'amount'          => -$order->paid_amount,
                    'reference'       => 'Remboursement',
                    'paid_at'         => now(),
                ]);

                if ($refundMethod === 'cash' && $session) {
                    CashSessionMovement::create([
                        'cash_session_id' => $session->id,
                        'user_id'         => $userId,
                        'type'            => 'withdrawal',
                        'amount'          => $order->paid_amount,
                        'motive'          => "Remboursement acompte {$order->reference}",
                        'receipt_ref'     => $order->reference,
                    ]);
                }

                $order->paid_amount = 0;
            }

            $order->update([
                'status'              => 'cancelled',
                'paid_amount'         => $order->paid_amount,
                'cancelled_at'        => now(),
                'cancellation_reason' => $reason,
            ]);

            return $order->fresh();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private function syncItems(CustomerOrder $order, array $items): void
    {
        $products = Product::where('store_id', $order->store_id)
            ->whereIn('id', array_column($items, 'product_id'))
            ->get()->keyBy('id');

        $order->items()->delete();
        $total = 0;
        foreach ($items as $item) {
            $product = $products->get($item['product_id']);
            if (! $product) {
                throw ValidationException::withMessages(['items' => 'Produit invalide pour ce magasin.']);
            }
            $price = (float) ($item['unit_price_ttc'] ?? $product->sale_price_ttc);
            $line  = round($price * $item['qty'], 2);
            $total += $line;

            $order->items()->create([
                'product_id'     => $product->id,
                'qty'            => $item['qty'],
                'unit_price_ttc' => $price,
                'total_ttc'      => $line,
                'details'        => $item['details'] ?? null,
            ]);
        }

        $order->update(['total_ttc' => round($total, 2)]);
    }

    private function assertOpen(CustomerOrder $order): void
    {
        if (in_array($order->status, ['delivered', 'cancelled'])) {
            throw ValidationException::withMessages(['status' => 'Cette commande est déjà ' . ($order->status === 'delivered' ? 'livrée' : 'annulée') . '.']);
        }
    }

    /** Session de caisse ouverte : celle de l'utilisateur en priorité, sinon une du magasin. */
    private function openSession(int $storeId, int $userId): ?CashSession
    {
        return CashSession::where('store_id', $storeId)
            ->where('status', 'open')
            ->orderByRaw('CASE WHEN user_id = ? THEN 0 ELSE 1 END', [$userId])
            ->latest('opened_at')
            ->first();
    }

    private function nextReference(): string
    {
        $prefix = 'CMD' . now()->format('Ymd');
        $last   = CustomerOrder::where('reference', 'like', $prefix . '%')
            ->lockForUpdate()
            ->orderByDesc('reference')
            ->value('reference');
        $seq = $last ? (int) substr($last, -4) + 1 : 1;

        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }
}
