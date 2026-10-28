<?php

namespace App\Services;

use App\Models\CashSession;
use App\Models\CashSessionMovement;
use App\Models\Courier;
use App\Models\CourierPayment;
use App\Models\CourierRound;
use App\Models\CourierRoundItem;
use App\Models\DistributionMovement;
use App\Models\Product;
use App\Models\ProductionOrder;
use App\Models\StockLevel;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Répartition des productions entre le point de vente et les livreurs.
 *
 *  - Point de vente : la quantité entre en stock POS (production_in) → visible en caisse.
 *  - Livreur : dotation sur sa tournée ouverte, hors stock POS, à sa charge.
 *  - Réaffectation en cours de journée : POS ↔ livreur, livreur ↔ livreur (courier_out / courier_return).
 *  - Fin de tournée : les invendus reviennent en stock POS (courier_return) ; les ventes sont
 *    enregistrées comme une vente (canal livraison, au prix livreur) ; le manquant reste à sa charge.
 *
 * Toute affectation est tracée dans distribution_movements.
 */
class DistributionService
{
    public function __construct(private StockService $stock, private SaleService $sales) {}

    /**
     * @param array $lines [['destination' => 'pos'|'courier', 'courier_id' => ?, 'qty' => float], ...]
     */
    public function allocate(ProductionOrder $order, int $userId, array $lines): ProductionOrder
    {
        if ($order->status !== 'completed') {
            throw ValidationException::withMessages(['order' => 'Cette production est annulée.']);
        }

        return DB::transaction(function () use ($order, $userId, $lines) {
            $order = ProductionOrder::lockForUpdate()->findOrFail($order->id);
            $total = round(array_sum(array_column($lines, 'qty')), 3);

            if ($total > $order->qty_pending + 0.0005) {
                throw ValidationException::withMessages([
                    'lines' => "Le total réparti ({$total}) dépasse la quantité en attente ({$order->qty_pending}).",
                ]);
            }

            foreach ($lines as $line) {
                $qty = (float) $line['qty'];
                if ($qty <= 0) continue;

                if ($line['destination'] === 'pos') {
                    $this->stock->move(
                        $order->store_id, $order->product_id, 'production_in', $qty, $order->unit_cost,
                        null, $userId, 'production_orders', $order->id, 'allocation_pos', $order->reference
                    );
                    $this->log($order->store_id, $order->product_id, $userId, $qty, 'production', 'pos', $order->id);
                } else {
                    $round = $this->openRound($this->courier($order->store_id, $line['courier_id']), $userId);
                    $this->addToRound($round, $order->product_id, $qty, (float) $order->unit_cost);
                    $this->log($order->store_id, $order->product_id, $userId, $qty, 'production', 'courier', $order->id, null, $round->id);
                }
            }

            $order->increment('qty_allocated', $total);

            return $order->fresh();
        });
    }

    /** Quantité produite encore en attente de répartition pour un produit. */
    public function pendingFor(int $storeId, int $productId): float
    {
        return (float) ProductionOrder::where('store_id', $storeId)->where('product_id', $productId)
            ->where('status', 'completed')
            ->selectRaw('COALESCE(SUM(qty_produced - qty_allocated), 0) AS q')->value('q');
    }

    /**
     * Met un produit en vente au point de vente en piochant dans les productions
     * en attente, des plus anciennes aux plus récentes (ex. colonne « Ajouté » de la fiche).
     */
    public function allocateProductToPos(int $storeId, int $productId, float $qty, int $userId): void
    {
        DB::transaction(function () use ($storeId, $productId, $qty, $userId) {
            $orders = ProductionOrder::where('store_id', $storeId)->where('product_id', $productId)
                ->where('status', 'completed')->whereColumn('qty_allocated', '<', 'qty_produced')
                ->orderBy('produced_at')->orderBy('id')->lockForUpdate()->get();

            $available = round($orders->sum(fn ($o) => $o->qty_produced - $o->qty_allocated), 3);
            if ($qty > $available + 0.0005) {
                $name = Product::find($productId)?->name;
                throw ValidationException::withMessages([
                    'qty' => "{$name} : {$qty} demandés, seulement {$available} disponibles en production.",
                ]);
            }

            $remaining = $qty;
            foreach ($orders as $order) {
                if ($remaining <= 0) break;
                $take = round(min($order->qty_produced - $order->qty_allocated, $remaining), 3);
                $this->allocate($order, $userId, [['destination' => 'pos', 'qty' => $take]]);
                $remaining = round($remaining - $take, 3);
            }
        });
    }

    /**
     * Annule une mise en vente : retire la quantité du stock POS et la remet
     * « en attente de répartition » (productions les plus récentes d'abord).
     */
    public function returnPosToPending(int $storeId, int $productId, float $qty, int $userId): void
    {
        DB::transaction(function () use ($storeId, $productId, $qty, $userId) {
            $level = StockLevel::where('store_id', $storeId)->where('product_id', $productId)->lockForUpdate()->first();
            if (! $level || $level->qty_on_hand + 0.0005 < $qty) {
                throw ValidationException::withMessages(['qty' => 'Stock du point de vente insuffisant pour annuler cette mise en vente.']);
            }

            // Part nette mise au point de vente par chaque production
            $orders = ProductionOrder::where('store_id', $storeId)->where('product_id', $productId)
                ->where('status', 'completed')->where('qty_allocated', '>', 0)
                ->orderByDesc('produced_at')->orderByDesc('id')->lockForUpdate()->get();

            $remaining = $qty;
            foreach ($orders as $order) {
                if ($remaining <= 0) break;
                $toPos = (float) DistributionMovement::where('production_order_id', $order->id)->where('source', 'production')->where('destination', 'pos')->sum('qty')
                       - (float) DistributionMovement::where('production_order_id', $order->id)->where('source', 'pos')->where('destination', 'production')->sum('qty');
                $take = round(min($toPos, $remaining), 3);
                if ($take <= 0) continue;

                $this->stock->move(
                    $storeId, $productId, 'adjustment_out', $take, $order->unit_cost,
                    null, $userId, 'production_orders', $order->id, 'allocation_cancel', $order->reference
                );
                $order->decrement('qty_allocated', $take);
                $this->log($storeId, $productId, $userId, $take, 'pos', 'production', $order->id);
                $remaining = round($remaining - $take, 3);
            }

            if ($remaining > 0.0005) {
                throw ValidationException::withMessages(['qty' => 'Cette quantité ne provient pas de productions réparties au point de vente.']);
            }
        });
    }

    /**
     * Réaffectation en cours de journée.
     * @param array $from ['type' => 'pos'|'courier', 'courier_id' => ?]
     * @param array $to   ['type' => 'pos'|'courier', 'courier_id' => ?]
     */
    public function transfer(int $storeId, int $userId, int $productId, array $from, array $to, float $qty): DistributionMovement
    {
        if ($from['type'] === $to['type'] && ($from['type'] === 'pos' || (int) $from['courier_id'] === (int) $to['courier_id'])) {
            throw ValidationException::withMessages(['to' => 'La source et la destination sont identiques.']);
        }

        return DB::transaction(function () use ($storeId, $userId, $productId, $from, $to, $qty) {
            $product = Product::where('store_id', $storeId)->findOrFail($productId);
            $sourceRound = null;
            $unitCost = 0;

            // ── Sortie de la source ───────────────────────────────────────────
            if ($from['type'] === 'pos') {
                $level = StockLevel::where('store_id', $storeId)->where('product_id', $productId)->lockForUpdate()->first();
                if (! $level || $level->qty_on_hand + 0.0005 < $qty) {
                    throw ValidationException::withMessages(['qty' => "Stock point de vente insuffisant pour {$product->name} (" . (float) ($level?->qty_on_hand ?? 0) . ' disponible).']);
                }
                $unitCost = (float) $level->avg_cost;
                $this->stock->move($storeId, $productId, 'courier_out', $qty, $unitCost, null, $userId, 'distribution', null, 'transfer_to_courier');
            } else {
                $sourceRound = $this->openRound($this->courier($storeId, $from['courier_id']), $userId, false);
                $item = $sourceRound?->items()->where('product_id', $productId)->lockForUpdate()->first();
                $outstanding = $item ? $item->qty_given - $item->qty_returned : 0;
                if (! $item || $outstanding + 0.0005 < $qty) {
                    throw ValidationException::withMessages(['qty' => "Le livreur n'a que {$outstanding} {$product->name} en dotation."]);
                }
                $unitCost = (float) $item->unit_cost;
                $item->decrement('qty_given', $qty);
            }

            // ── Entrée dans la destination ────────────────────────────────────
            $destinationRound = null;
            if ($to['type'] === 'pos') {
                $this->stock->move($storeId, $productId, 'courier_return', $qty, $unitCost, null, $userId, 'courier_rounds', $sourceRound?->id, 'transfer_to_pos');
            } else {
                $destinationRound = $this->openRound($this->courier($storeId, $to['courier_id']), $userId);
                $this->addToRound($destinationRound, $productId, $qty, $unitCost);
            }

            return $this->log($storeId, $productId, $userId, $qty, $from['type'], $to['type'], null, $sourceRound?->id, $destinationRound?->id);
        });
    }

    /**
     * Fin de tournée : déclaration des invendus et du montant versé.
     * @param array $returns [product_id => qty_returned]
     */
    public function settle(CourierRound $round, int $userId, array $returns, string $method, float $amountPaid, ?string $notes = null): CourierRound
    {
        if ($round->status !== 'open') {
            throw ValidationException::withMessages(['round' => 'Cette tournée est déjà réglée.']);
        }

        return DB::transaction(function () use ($round, $userId, $returns, $method, $amountPaid, $notes) {
            $round->load(['items.product', 'courier']);
            $saleItems = [];
            $due = 0;

            foreach ($round->items as $item) {
                $returned = (float) ($returns[$item->product_id] ?? 0);
                if ($returned < 0 || $returned > $item->qty_given + 0.0005) {
                    throw ValidationException::withMessages(['returns' => "Invendus de {$item->product->name} : {$returned} pour {$item->qty_given} confiés."]);
                }
                $item->update(['qty_returned' => $returned]);

                if ($returned > 0) {
                    $this->stock->move(
                        $round->store_id, $item->product_id, 'courier_return', $returned, $item->unit_cost,
                        null, $userId, 'courier_rounds', $round->id, 'round_return', $round->reference
                    );
                }

                $sold = round($item->qty_given - $returned, 3);
                if ($sold > 0) {
                    $saleItems[] = ['product_id' => $item->product_id, 'qty' => $sold, 'unit_price_ttc' => $item->unit_price];
                    $due += $sold * $item->unit_price;
                }
            }

            $due        = round($due, 2);
            $session    = $this->openSession($round->store_id, $userId);
            $toSale     = round(min($amountPaid, $due), 2);
            $toDebt     = round(max(0, $amountPaid - $due), 2);
            $saleId     = null;

            // Ventes du livreur → vente (CA), sans mouvement de stock : la marchandise était déjà hors stock POS
            if ($saleItems) {
                $sale = $this->sales->createSale(
                    data: [
                        'store_id'        => $round->store_id,
                        'cash_session_id' => $session?->id,
                        'user_id'         => $userId,
                        'status'          => 'draft',
                        'channel'         => 'delivery',
                        'is_synced'       => true,
                        'synced_at'       => now(),
                        'notes'           => "Tournée {$round->reference} — {$round->courier->name}",
                        'skip_stock'      => true,
                    ],
                    items: $saleItems,
                    payments: $toSale > 0 ? [['payment_method' => $method, 'amount' => $toSale]] : [],
                );
                $saleId = $sale->id;
            }

            if ($toSale > 0) {
                $this->recordPayment($round->courier, $userId, $session, $method, $toSale, 'settlement', $round->id, false);
            }
            // Versement supérieur au dû : rembourse un manquant antérieur
            if ($toDebt > 0) {
                $this->recordPayment($round->courier, $userId, $session, $method, $toDebt, 'debt', $round->id, true);
            }

            $round->update([
                'status'      => 'settled',
                'amount_due'  => $due,
                'amount_paid' => $toSale,
                'sale_id'     => $saleId,
                'settled_by'  => $userId,
                'settled_at'  => now(),
                'notes'       => $notes,
            ]);

            return $round->fresh(['items.product', 'courier']);
        });
    }

    /** Remboursement d'un manquant par le livreur. */
    public function payDebt(Courier $courier, int $userId, string $method, float $amount): CourierPayment
    {
        $debt = $courier->debt();
        if ($amount > $debt + 0.001) {
            throw ValidationException::withMessages(['amount' => "Le montant dépasse le manquant du livreur ({$debt} FCFA)."]);
        }

        return DB::transaction(fn () => $this->recordPayment(
            $courier, $userId, $this->openSession($courier->store_id, $userId), $method, $amount, 'debt', null, true
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────

    private function courier(int $storeId, $courierId): Courier
    {
        $courier = Courier::where('store_id', $storeId)->find($courierId);
        if (! $courier) {
            throw ValidationException::withMessages(['courier_id' => 'Livreur introuvable.']);
        }
        if (! $courier->is_active) {
            throw ValidationException::withMessages(['courier_id' => "{$courier->name} est désactivé."]);
        }

        return $courier;
    }

    /** Tournée ouverte du livreur (créée si besoin quand $create). */
    public function openRound(Courier $courier, int $userId, bool $create = true): ?CourierRound
    {
        $round = CourierRound::where('courier_id', $courier->id)->where('status', 'open')->latest('id')->lockForUpdate()->first();
        if ($round || ! $create) return $round;

        return CourierRound::create([
            'store_id'   => $courier->store_id,
            'courier_id' => $courier->id,
            'reference'  => $this->nextReference(),
            'round_date' => today(),
            'status'     => 'open',
        ]);
    }

    private function addToRound(CourierRound $round, int $productId, float $qty, float $unitCost): void
    {
        $item = CourierRoundItem::where('courier_round_id', $round->id)->where('product_id', $productId)->lockForUpdate()->first();
        if ($item) {
            // Coût moyen pondéré de la dotation
            $newQty = $item->qty_given + $qty;
            $item->update([
                'qty_given' => $newQty,
                'unit_cost' => $newQty > 0 ? round(($item->qty_given * $item->unit_cost + $qty * $unitCost) / $newQty, 4) : $unitCost,
            ]);
            return;
        }

        $product = Product::findOrFail($productId);
        CourierRoundItem::create([
            'courier_round_id' => $round->id,
            'product_id'       => $productId,
            'qty_given'        => $qty,
            'unit_price'       => (float) ($product->courier_price ?? $product->sale_price_ttc),
            'unit_cost'        => $unitCost,
        ]);
    }

    private function recordPayment(Courier $courier, int $userId, ?CashSession $session, string $method, float $amount, string $kind, ?int $roundId, bool $cashMovement): CourierPayment
    {
        // Les règlements de tournée passent par la vente (déjà comptés en caisse) ;
        // les remboursements de manquant sont un dépôt de caisse à part.
        if ($cashMovement && $method === 'cash' && $session) {
            CashSessionMovement::create([
                'cash_session_id' => $session->id,
                'user_id'         => $userId,
                'type'            => 'deposit',
                'amount'          => $amount,
                'motive'          => "Remboursement manquant livreur {$courier->name}",
            ]);
        }

        return CourierPayment::create([
            'store_id'         => $courier->store_id,
            'courier_id'       => $courier->id,
            'courier_round_id' => $roundId,
            'user_id'          => $userId,
            'cash_session_id'  => $session?->id,
            'payment_method'   => $method,
            'amount'           => $amount,
            'kind'             => $kind,
        ]);
    }

    private function log(int $storeId, int $productId, int $userId, float $qty, string $source, string $destination, ?int $orderId = null, ?int $sourceRoundId = null, ?int $destinationRoundId = null): DistributionMovement
    {
        return DistributionMovement::create([
            'store_id'             => $storeId,
            'product_id'           => $productId,
            'production_order_id'  => $orderId,
            'source'               => $source,
            'source_round_id'      => $sourceRoundId,
            'destination'          => $destination,
            'destination_round_id' => $destinationRoundId,
            'qty'                  => $qty,
            'user_id'              => $userId,
            'created_at'           => now(),
        ]);
    }

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
        $prefix = 'TRN' . now()->format('Ymd');
        $last   = CourierRound::where('reference', 'like', $prefix . '%')->lockForUpdate()->orderByDesc('reference')->value('reference');
        $seq    = $last ? (int) substr($last, -4) + 1 : 1;

        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }
}
