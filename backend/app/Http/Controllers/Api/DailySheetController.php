<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SheetShift;
use App\Models\Store;
use App\Models\User;
use App\Services\DailySheetService;
use App\Services\DistributionService;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * Fiche journalière (boulangerie) : équipes matin / soir / nuit contrôlées par la caisse.
 */
class DailySheetController extends Controller
{
    public function __construct(private DailySheetService $sheets) {}

    public function show(Request $request, DistributionService $distribution)
    {
        $user    = $request->user();
        $store   = Store::findOrFail($user->store_id);
        $date    = $request->date ? Carbon::parse($request->date) : today();
        $sheet   = $this->sheets->sheet($store->id, $date);

        $shifts = collect(SheetShift::SHIFTS)->map(function ($position, $key) use ($sheet, $store, $user) {
            $shift = $sheet?->shifts->firstWhere('shift', $key);
            if (! $shift) {
                return ['shift' => $key, 'label' => SheetShift::LABELS[$key], 'position' => $position, 'status' => 'not_started'];
            }

            $lines = $this->sheets->lines($shift)->map(fn ($l) => $l + ['over_tolerance' => $this->sheets->overTolerance($store, $l)]);
            $gaps  = $lines->filter(fn ($l) => ($l['gap'] ?? 0) > 0);

            return [
                'id'           => $shift->id,
                'shift'        => $key,
                'label'        => SheetShift::LABELS[$key],
                'position'     => $position,
                'status'       => $shift->status,
                'responsible'  => $shift->responsible?->only(['id', 'name']),
                'closed_by'    => $shift->closer?->only(['id', 'name']),
                'opened_at'    => $shift->opened_at,
                'closed_at'    => $shift->closed_at,
                'can_fill'     => $this->sheets->canFill($shift, $user),
                'lines'        => $lines->sortBy([['category_order', 'asc'], ['name', 'asc']])->values(),
                'totals'       => [
                    'added'           => round($lines->sum('added'), 3),
                    'sold'            => round($lines->sum('sold'), 3),
                    'sold_value'      => round($lines->sum(fn ($l) => $l['sold'] * $l['unit_price']), 2),
                    'gap_qty'         => round($gaps->sum('gap'), 3),
                    'gap_value'       => round($gaps->sum(fn ($l) => $l['gap'] * $l['unit_price']), 2),
                    'over_tolerance'  => $lines->where('over_tolerance', true)->count(),
                ],
            ];
        })->values();

        // Quantités produites encore à mettre en vente (aide à la saisie « Ajouté »)
        $productIds = $shifts->pluck('lines')->filter()->flatten(1)->pluck('product_id')->filter()->unique();
        $pending = $productIds->mapWithKeys(fn ($id) => [$id => $distribution->pendingFor($store->id, $id)])->filter(fn ($q) => $q > 0);

        return response()->json([
            'date'       => $date->toDateString(),
            'shifts'     => $shifts,
            'pending'    => $pending,
            'can_manage' => $this->sheets->canManage($user),
            'can_fill'   => $user->can('fill_daily_sheets'),
            'tolerance'  => [
                'pct' => (float) $store->sheet_gap_tolerance_pct,
                'qty' => (float) $store->sheet_gap_tolerance_qty,
            ],
        ]);
    }

    /** Personnes pouvant être responsables d'une équipe. */
    public function responsibles(Request $request)
    {
        return response()->json(
            User::where('store_id', $request->user()->store_id)->where('is_active', true)->orderBy('name')->get(['id', 'name'])
                ->filter(fn (User $u) => $u->can('fill_daily_sheets'))->values()
        );
    }

    public function open(Request $request)
    {
        $data = $request->validate([
            'date'           => 'required|date',
            'shift'          => 'required|in:matin,soir,nuit',
            'responsible_id' => 'required|integer',
        ]);

        $shift = $this->sheets->open($request->user()->store_id, Carbon::parse($data['date']), $data['shift'], (int) $data['responsible_id'], $request->user());

        return response()->json($shift, 201);
    }

    public function add(Request $request, SheetShift $sheetShift)
    {
        abort_unless($sheetShift->store_id == $request->user()->store_id, 404);
        $data = $request->validate(['product_id' => 'required|integer', 'qty' => 'required|numeric|min:0.001']);

        $this->sheets->add($sheetShift, (int) $data['product_id'], (float) $data['qty'], $request->user());

        return response()->json(['ok' => true]);
    }

    public function remove(Request $request, SheetShift $sheetShift)
    {
        abort_unless($sheetShift->store_id == $request->user()->store_id, 404);
        $data = $request->validate(['product_id' => 'required|integer', 'qty' => 'required|numeric|min:0.001']);

        $this->sheets->remove($sheetShift, (int) $data['product_id'], (float) $data['qty'], $request->user());

        return response()->json(['ok' => true]);
    }

    public function close(Request $request, SheetShift $sheetShift)
    {
        abort_unless($sheetShift->store_id == $request->user()->store_id, 404);
        $data = $request->validate([
            'counts'             => 'present|array',
            'counts.*'           => 'numeric',
            'unsold_destination' => 'nullable|in:waste,donation,staff',
        ]);

        $shift = $this->sheets->close($sheetShift, $data['counts'], $request->user(), $data['unsold_destination'] ?? 'waste');

        return response()->json($shift);
    }

    public function reopen(Request $request, SheetShift $sheetShift)
    {
        abort_unless($sheetShift->store_id == $request->user()->store_id, 404);

        return response()->json($this->sheets->reopen($sheetShift, $request->user()));
    }

    /** Tolérance d'écart, réglée par le gérant. */
    public function settings(Request $request)
    {
        abort_unless($this->sheets->canManage($request->user()), 403, 'Réservé au gérant.');
        $data = $request->validate([
            'tolerance_pct' => 'required|numeric|min:0|max:100',
            'tolerance_qty' => 'required|numeric|min:0',
        ]);

        Store::where('id', $request->user()->store_id)->update([
            'sheet_gap_tolerance_pct' => $data['tolerance_pct'],
            'sheet_gap_tolerance_qty' => $data['tolerance_qty'],
        ]);

        return response()->json(['ok' => true]);
    }
}
