<?php

namespace App\Services;

use App\Models\DailySheet;
use App\Models\Product;
use App\Models\SheetAudit;
use App\Models\SheetLine;
use App\Models\SheetShift;
use App\Models\StockLevel;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\UnsoldReport;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Fiche journalière : trois équipes (matin, soir, nuit) par jour, contrôlées par la caisse.
 *
 * Par équipe et par produit :
 *   Départ   = stock du point de vente à l'ouverture (figé)
 *   Ajouté   = mises en vente depuis la production pendant l'équipe
 *   Vendu    = ventes enregistrées en caisse pendant l'équipe
 *   Autres   = tout autre mouvement du stock POS (retours livreurs, pertes, transferts…)
 *   Attendu  = Départ + Ajouté − Vendu + Autres  (= stock théorique)
 *   Reste    = comptage saisi à la clôture
 *   Écart    = Attendu − Reste  (> 0 : manquant, signalé au responsable)
 *
 * Toutes les colonnes sont recalculées à partir des mouvements de stock réels :
 * un mouvement fait depuis un autre écran pendant l'équipe est pris en compte.
 */
class DailySheetService
{
    private const INCOMING = ['purchase_in', 'return_in', 'transfer_in', 'adjustment_in', 'opening', 'inventory_adjustment', 'production_in', 'courier_return'];

    public function __construct(private DistributionService $distribution, private ProductionService $production, private StockService $stock) {}

    // ── Lecture ──────────────────────────────────────────────────────────────

    public function sheet(int $storeId, Carbon $date): ?DailySheet
    {
        return DailySheet::with(['shifts.responsible:id,name', 'shifts.closer:id,name', 'shifts.lines.product:id,name,category_id'])
            ->where('store_id', $storeId)->whereDate('sheet_date', $date->toDateString())->first();
    }

    /**
     * Lignes d'une équipe : figées si clôturée, calculées en direct si ouverte.
     */
    public function lines(SheetShift $shift): Collection
    {
        $lines = $shift->lines()->with('product:id,name,category_id,product_kind', 'product.category:id,name,sort_order,unsold_end_of_day')->get()->keyBy('product_id');

        if ($shift->status === 'closed') {
            return $lines->map(fn (SheetLine $l) => $this->present($l, [
                'added' => $l->added_qty, 'sold' => $l->pos_sold_qty, 'other' => $l->other_qty,
                'expected' => $l->expected_qty, 'remaining' => $l->remaining_qty, 'gap' => $l->gap_qty,
            ]))->values();
        }

        $moves = $this->movements($shift->store_id, $shift->start_movement_id);

        // Produits mouvementés pendant l'équipe mais absents de la fiche (créés après l'ouverture)
        foreach ($moves->keys()->diff($lines->keys()) as $productId) {
            $product = Product::with('category:id,name,sort_order,unsold_end_of_day')->find($productId);
            if (! $product || $product->product_kind !== 'finished') continue;
            $lines[$productId] = new SheetLine([
                'sheet_shift_id' => $shift->id, 'product_id' => $productId,
                'unit_price' => $product->sale_price_ttc, 'opening_qty' => 0,
            ]);
            $lines[$productId]->setRelation('product', $product);
        }

        return $lines->map(function (SheetLine $l) use ($moves) {
            $m = $moves->get($l->product_id, ['added' => 0, 'sold' => 0, 'other' => 0]);
            return $this->present($l, $m + ['expected' => round($l->opening_qty + $m['added'] - $m['sold'] + $m['other'], 3), 'remaining' => null, 'gap' => null]);
        })->values();
    }

    private function present(SheetLine $l, array $v): array
    {
        return [
            'product_id'        => $l->product_id,
            'name'              => $l->product?->name,
            'category'          => $l->product?->category?->name,
            'category_order'    => $l->product?->category?->sort_order ?? 999,
            'unsold_end_of_day' => (bool) $l->product?->category?->unsold_end_of_day,
            'unit_price'        => (float) $l->unit_price,
            'opening'           => (float) $l->opening_qty,
            'added'             => (float) ($v['added'] ?? 0),
            'sold'              => (float) ($v['sold'] ?? 0),
            'other'             => (float) ($v['other'] ?? 0),
            'expected'          => (float) ($v['expected'] ?? 0),
            'remaining'         => $v['remaining'] !== null ? (float) $v['remaining'] : null,
            'gap'               => $v['gap'] !== null ? (float) $v['gap'] : null,
        ];
    }

    /**
     * Mouvements du stock POS depuis l'ouverture, ventilés en ajouté / vendu / autres.
     * Repère par id (et non par heure) : deux équipes ouvertes/clôturées dans la même
     * seconde ne se partagent jamais un mouvement.
     */
    private function movements(int $storeId, int $afterMovementId): Collection
    {
        $rows = StockMovement::where('store_id', $storeId)
            ->where('id', '>', $afterMovementId)
            ->groupBy('product_id', 'type', 'reason')
            ->selectRaw('product_id, type, reason, SUM(qty) AS qty')
            ->get();

        $result = [];
        foreach ($rows as $r) {
            $acc = $result[$r->product_id] ?? ['added' => 0, 'sold' => 0, 'other' => 0];
            $qty = (float) $r->qty;

            if ($r->type === 'production_in' && $r->reason === 'allocation_pos') {
                $acc['added'] += $qty;
            } elseif ($r->type === 'adjustment_out' && $r->reason === 'allocation_cancel') {
                $acc['added'] -= $qty;
            } elseif ($r->type === 'sale_out') {
                $acc['sold'] += $qty;
            } else {
                $acc['other'] += in_array($r->type, self::INCOMING) ? $qty : -$qty;
            }
            $result[$r->product_id] = array_map(fn ($v) => round($v, 3), $acc);
        }

        return collect($result);
    }

    /** Écart au-delà de la tolérance fixée par le gérant (le plus grand des deux seuils). */
    public function overTolerance(Store $store, array $line): bool
    {
        if (($line['gap'] ?? 0) <= 0) return false;
        $base = max(0, $line['opening'] + $line['added']);
        $allowed = max((float) $store->sheet_gap_tolerance_qty, $base * (float) $store->sheet_gap_tolerance_pct / 100);

        return $line['gap'] > $allowed + 0.0005;
    }

    // ── Droits ───────────────────────────────────────────────────────────────

    public function canManage(User $user): bool
    {
        return $user->can('manage_daily_sheets');
    }

    public function canFill(SheetShift $shift, User $user): bool
    {
        return $this->canManage($user) || ($user->id === $shift->responsible_id && $user->can('fill_daily_sheets'));
    }

    private function assertCanFill(SheetShift $shift, User $user): void
    {
        if (! $this->canFill($shift, $user)) {
            throw ValidationException::withMessages(['shift' => 'Seuls le responsable de l\'équipe et le gérant peuvent la modifier.']);
        }
        if ($shift->status !== 'open') {
            throw ValidationException::withMessages(['shift' => 'Cette équipe est clôturée.']);
        }
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    public function open(int $storeId, Carbon $date, string $shiftKey, int $responsibleId, User $user): SheetShift
    {
        if (! isset(SheetShift::SHIFTS[$shiftKey])) {
            throw ValidationException::withMessages(['shift' => 'Équipe inconnue.']);
        }
        if (! $this->canManage($user) && $responsibleId !== $user->id) {
            throw ValidationException::withMessages(['responsible_id' => 'Vous ne pouvez ouvrir une équipe qu\'à votre nom.']);
        }
        $responsible = User::where('store_id', $storeId)->find($responsibleId);
        if (! $responsible || ! $responsible->can('fill_daily_sheets')) {
            throw ValidationException::withMessages(['responsible_id' => 'Ce responsable n\'a pas accès à la fiche journalière.']);
        }

        return DB::transaction(function () use ($storeId, $date, $shiftKey, $responsibleId, $user) {
            $open = SheetShift::with('sheet')->where('store_id', $storeId)->where('status', 'open')->lockForUpdate()->first();
            if ($open) {
                throw ValidationException::withMessages([
                    'shift' => 'L\'équipe ' . SheetShift::LABELS[$open->shift] . ' du ' . $open->sheet->sheet_date->format('d/m/Y') . ' est encore ouverte : clôturez-la d\'abord.',
                ]);
            }

            $sheet = DailySheet::firstOrCreate(['store_id' => $storeId, 'sheet_date' => $date->toDateString()]);
            $position = SheetShift::SHIFTS[$shiftKey];

            if ($sheet->shifts()->where('shift', $shiftKey)->exists()) {
                throw ValidationException::withMessages(['shift' => 'L\'équipe ' . SheetShift::LABELS[$shiftKey] . ' de ce jour a déjà été ouverte.']);
            }
            if ($position > 1 && ! $sheet->shifts()->where('position', $position - 1)->where('status', 'closed')->exists()) {
                $previous = array_search($position - 1, SheetShift::SHIFTS);
                throw ValidationException::withMessages(['shift' => 'Clôturez d\'abord l\'équipe ' . SheetShift::LABELS[$previous] . '.']);
            }

            $shift = SheetShift::create([
                'daily_sheet_id' => $sheet->id,
                'store_id'       => $storeId,
                'shift'          => $shiftKey,
                'position'       => $position,
                'status'         => 'open',
                'responsible_id' => $responsibleId,
                'opened_by'         => $user->id,
                'opened_at'         => now(),
                'start_movement_id' => (int) StockMovement::max('id'),
            ]);

            // Départ = stock du point de vente à l'ouverture, pour tous les produits finis actifs
            $stock = StockLevel::where('store_id', $storeId)->pluck('qty_on_hand', 'product_id');
            $products = Product::where('store_id', $storeId)->where('product_kind', 'finished')->where('is_active', true)->get(['id', 'sale_price_ttc']);
            foreach ($products as $p) {
                $shift->lines()->create([
                    'product_id'  => $p->id,
                    'unit_price'  => $p->sale_price_ttc,
                    'opening_qty' => (float) ($stock[$p->id] ?? 0),
                ]);
            }

            $this->audit($shift, $user, 'open', null, null, ['responsible_id' => $responsibleId]);

            return $shift;
        });
    }

    /** Colonne « Ajouté » : mise en vente depuis la production, refusée au-delà du disponible. */
    public function add(SheetShift $shift, int $productId, float $qty, User $user): void
    {
        $this->assertCanFill($shift, $user);
        $this->assertFinished($shift->store_id, $productId);

        DB::transaction(function () use ($shift, $productId, $qty, $user) {
            $this->distribution->allocateProductToPos($shift->store_id, $productId, $qty, $user->id);
            $this->audit($shift, $user, 'add', $productId, $qty);
        });
    }

    /** Correction d'une saisie « Ajouté » de l'équipe en cours. */
    public function remove(SheetShift $shift, int $productId, float $qty, User $user): void
    {
        $this->assertCanFill($shift, $user);

        $added = (float) ($this->movements($shift->store_id, $shift->start_movement_id)->get($productId)['added'] ?? 0);
        if ($qty > $added + 0.0005) {
            throw ValidationException::withMessages(['qty' => "Seulement {$added} ajoutés pendant cette équipe."]);
        }

        DB::transaction(function () use ($shift, $productId, $qty, $user) {
            $this->distribution->returnPosToPending($shift->store_id, $productId, $qty, $user->id);
            $this->audit($shift, $user, 'remove', $productId, $qty);
        });
    }

    /**
     * Clôture : comptage du reste, écarts figés et signalés, stock du point de vente
     * recalé sur le comptage. Nuit : le reste des catégories « invendu en fin de
     * journée » (pains) part en invendus.
     *
     * @param array $counts [product_id => reste compté]
     */
    public function close(SheetShift $shift, array $counts, User $user, string $unsoldDestination = 'waste'): SheetShift
    {
        $this->assertCanFill($shift, $user);
        if (! in_array($unsoldDestination, ['waste', 'donation', 'staff'])) {
            throw ValidationException::withMessages(['unsold_destination' => 'Destination des invendus invalide.']);
        }

        return DB::transaction(function () use ($shift, $counts, $user, $unsoldDestination) {
            $shift = SheetShift::lockForUpdate()->findOrFail($shift->id);
            $lines = $this->lines($shift)->keyBy('product_id');
            $errors = [];

            foreach ($lines as $productId => $line) {
                $hasActivity = abs($line['opening']) + abs($line['added']) + abs($line['sold']) + abs($line['other']) > 0;
                if (! array_key_exists($productId, $counts) && $hasActivity) {
                    $errors[] = "{$line['name']} : reste non saisi.";
                    continue;
                }
                $remaining = (float) ($counts[$productId] ?? 0);
                $max = max(0, $line['expected']);
                if ($remaining < 0) {
                    $errors[] = "{$line['name']} : le reste ne peut pas être négatif.";
                } elseif ($remaining > $max + 0.0005) {
                    $errors[] = "{$line['name']} : reste {$remaining} supérieur au disponible ({$max}).";
                }
            }
            if ($errors) {
                throw ValidationException::withMessages(['counts' => $errors]);
            }

            $unsoldLines = [];
            foreach ($lines as $productId => $line) {
                $remaining = round((float) ($counts[$productId] ?? 0), 3);
                $gap = round($line['expected'] - $remaining, 3);

                SheetLine::updateOrCreate(
                    ['sheet_shift_id' => $shift->id, 'product_id' => $productId],
                    [
                        'unit_price'    => $line['unit_price'],
                        'opening_qty'   => $line['opening'],
                        'added_qty'     => $line['added'],
                        'pos_sold_qty'  => $line['sold'],
                        'other_qty'     => $line['other'],
                        'expected_qty'  => $line['expected'],
                        'remaining_qty' => $remaining,
                        'gap_qty'       => $gap,
                    ]
                );

                // Recale le stock POS sur le comptage réel
                $current = (float) StockLevel::where('store_id', $shift->store_id)->where('product_id', $productId)->value('qty_on_hand');
                $delta = round($current - $remaining, 3);
                if (abs($delta) > 0.0005) {
                    $this->stock->move(
                        $shift->store_id, $productId, $delta > 0 ? 'adjustment_out' : 'adjustment_in', abs($delta), 0,
                        null, $user->id, 'sheet_shifts', $shift->id, 'sheet_gap', 'Écart fiche ' . SheetShift::LABELS[$shift->shift]
                    );
                }

                if ($shift->shift === 'nuit' && $line['unsold_end_of_day'] && $remaining > 0) {
                    $unsoldLines[] = ['product_id' => $productId, 'qty' => $remaining, 'destination' => $unsoldDestination];
                }
            }

            $unsoldReportId = null;
            if ($unsoldLines) {
                $sheetDate = $shift->sheet()->value('sheet_date');
                $report = $this->production->recordUnsold(
                    $shift->store_id, $user->id, Carbon::parse($sheetDate), $unsoldLines, 'Reste de nuit (fiche journalière)'
                );
                $unsoldReportId = $report->id;
            }

            $shift->update([
                'status'           => 'closed',
                'closed_by'        => $user->id,
                'closed_at'        => now(),
                'unsold_report_id' => $unsoldReportId,
            ]);

            $closed = $shift->lines()->get();
            $this->audit($shift, $user, 'close', null, null, [
                'gap_qty'   => round($closed->sum('gap_qty'), 3),
                'gap_value' => round($closed->sum(fn ($l) => max(0, $l->gap_qty) * $l->unit_price), 2),
                'unsold_report_id' => $unsoldReportId,
            ]);

            return $shift->fresh();
        });
    }

    /** Réouverture par le gérant : annule le recalage du stock et les invendus de nuit. */
    public function reopen(SheetShift $shift, User $user): SheetShift
    {
        if (! $this->canManage($user)) {
            throw ValidationException::withMessages(['shift' => 'Seul le gérant peut rouvrir une équipe.']);
        }
        if ($shift->status !== 'closed') {
            throw ValidationException::withMessages(['shift' => 'Cette équipe n\'est pas clôturée.']);
        }
        if (SheetShift::where('store_id', $shift->store_id)->where('status', 'open')->exists()) {
            throw ValidationException::withMessages(['shift' => 'Une autre équipe est ouverte : clôturez-la d\'abord.']);
        }
        $later = SheetShift::where('store_id', $shift->store_id)->where('id', '>', $shift->id)->exists();
        if ($later) {
            throw ValidationException::withMessages(['shift' => 'Une équipe suivante a déjà été ouverte : réouverture impossible.']);
        }

        return DB::transaction(function () use ($shift, $user) {
            // Annule le recalage du stock
            $gaps = StockMovement::where('reference_type', 'sheet_shifts')->where('reference_id', $shift->id)->where('reason', 'sheet_gap')->get();
            foreach ($gaps as $m) {
                $this->stock->move(
                    $shift->store_id, $m->product_id, $m->type === 'adjustment_out' ? 'adjustment_in' : 'adjustment_out', (float) $m->qty, 0,
                    null, $user->id, 'sheet_shifts', $shift->id, 'sheet_gap_cancel', 'Réouverture fiche'
                );
            }

            // Annule les invendus de nuit générés à la clôture
            if ($shift->unsold_report_id && $report = UnsoldReport::with('lines')->find($shift->unsold_report_id)) {
                foreach ($report->lines as $line) {
                    $this->stock->move(
                        $shift->store_id, $line->product_id, 'adjustment_in', $line->qty, $line->unit_cost,
                        null, $user->id, 'sheet_shifts', $shift->id, 'unsold_cancel', "Annulation {$report->reference}"
                    );
                }
                $shift->update(['unsold_report_id' => null]);
                $report->delete();
            }

            $shift->lines()->update([
                'added_qty' => null, 'pos_sold_qty' => null, 'other_qty' => null,
                'expected_qty' => null, 'remaining_qty' => null, 'gap_qty' => null,
            ]);
            $shift->update(['status' => 'open', 'closed_by' => null, 'closed_at' => null]);
            $this->audit($shift, $user, 'reopen');

            return $shift->fresh();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────

    private function assertFinished(int $storeId, int $productId): void
    {
        $ok = Product::where('store_id', $storeId)->where('id', $productId)->where('product_kind', 'finished')->exists();
        if (! $ok) {
            throw ValidationException::withMessages(['product_id' => 'Produit invalide pour la fiche.']);
        }
    }

    private function audit(SheetShift $shift, User $user, string $action, ?int $productId = null, ?float $qty = null, ?array $details = null): void
    {
        SheetAudit::create([
            'sheet_shift_id' => $shift->id,
            'user_id'        => $user->id,
            'action'         => $action,
            'product_id'     => $productId,
            'qty'            => $qty,
            'details'        => $details,
            'created_at'     => now(),
        ]);
    }
}
