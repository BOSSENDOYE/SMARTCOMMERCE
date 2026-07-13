<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingAccount;
use App\Models\FixedAsset;
use App\Models\FixedAssetDepreciation;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FixedAssetController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    private function nextJournalRef(int $storeId): string
    {
        $year  = now()->format('Y');
        $month = now()->format('m');
        $base  = "IMM-{$year}{$month}-";
        $last  = JournalEntry::where('store_id', $storeId)
            ->where('reference', 'like', "{$base}%")
            ->orderByDesc('reference')
            ->value('reference');
        $seq = $last ? ((int) substr($last, strlen($base))) + 1 : 1;
        return $base . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    // ── Stats globales ────────────────────────────────────────────────────────

    public function summary(Request $request)
    {
        $storeId = $this->storeId($request);
        $assets  = FixedAsset::where('store_id', $storeId)
            ->whereIn('status', ['active', 'fully_depreciated'])
            ->with(['depreciations' => fn($q) => $q->where('posted', true)])
            ->get();

        $grossValue   = $assets->sum('acquisition_cost');
        $accumulated  = $assets->sum(fn($a) => $a->depreciations->sum('amount'));
        $nbActive     = $assets->where('status', 'active')->count();

        return response()->json([
            'gross_value'    => round($grossValue, 2),
            'accumulated'    => round($accumulated, 2),
            'net_book_value' => round($grossValue - $accumulated, 2),
            'count_active'   => $nbActive,
            'count_total'    => $assets->count(),
        ]);
    }

    // ── Liste ─────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $q = FixedAsset::where('store_id', $this->storeId($request))
            ->with([
                'assetAccount:id,code,name',
                'depreciations' => fn($q) => $q->where('posted', true)->select('fixed_asset_id', DB::raw('SUM(amount) as total'))->groupBy('fixed_asset_id'),
            ])
            ->orderByDesc('acquisition_date');

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $q->where(fn($sq) => $sq->where('name', 'like', $s)->orWhere('reference', 'like', $s));
        }

        return response()->json($q->paginate($request->input('per_page', 20)));
    }

    // ── Créer ─────────────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'                    => 'required|string|max:200',
            'description'             => 'nullable|string',
            'acquisition_date'        => 'required|date',
            'acquisition_cost'        => 'required|numeric|min:0.01',
            'residual_value'          => 'nullable|numeric|min:0',
            'depreciation_method'     => 'required|in:linear,declining',
            'useful_life_years'       => 'required|integer|min:1|max:50',
            'asset_account_id'        => 'required|integer|exists:accounting_accounts,id',
            'depreciation_account_id' => 'required|integer|exists:accounting_accounts,id',
            'accumulated_account_id'  => 'required|integer|exists:accounting_accounts,id',
            'notes'                   => 'nullable|string',
        ]);

        $asset = DB::transaction(function () use ($data, $request) {
            $storeId = $this->storeId($request);

            $asset = FixedAsset::create(array_merge($data, [
                'store_id'          => $storeId,
                'created_by'        => $request->user()->id,
                'reference'         => FixedAsset::generateReference($storeId),
                'residual_value'    => $data['residual_value'] ?? 0,
                'useful_life_months' => $data['useful_life_years'] * 12,
                'status'            => 'active',
            ]));

            // Générer et persister le plan d'amortissement
            $schedule = $asset->generateSchedule();
            foreach ($schedule as $row) {
                FixedAssetDepreciation::create(array_merge($row, [
                    'fixed_asset_id' => $asset->id,
                    'posted'         => false,
                ]));
            }

            return $asset;
        });

        return response()->json($asset->load(['assetAccount', 'depreciationAccount', 'accumulatedAccount', 'depreciations']), 201);
    }

    // ── Détail ────────────────────────────────────────────────────────────────

    public function show(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        return response()->json(
            $fixedAsset->load(['assetAccount', 'depreciationAccount', 'accumulatedAccount', 'depreciations.journalEntry', 'createdBy:id,name'])
        );
    }

    // ── Modifier ──────────────────────────────────────────────────────────────

    public function update(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        $hasPosted = $fixedAsset->depreciations()->where('posted', true)->exists();
        abort_if($hasPosted, 422, 'Des écritures ont déjà été passées pour cette immobilisation.');

        $data = $request->validate([
            'name'        => 'sometimes|string|max:200',
            'description' => 'nullable|string',
            'notes'       => 'nullable|string',
        ]);

        $fixedAsset->update($data);
        return response()->json($fixedAsset);
    }

    // ── Supprimer ─────────────────────────────────────────────────────────────

    public function destroy(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        $hasPosted = $fixedAsset->depreciations()->where('posted', true)->exists();
        abort_if($hasPosted, 422, 'Des écritures ont déjà été passées. Impossible de supprimer.');

        DB::transaction(function () use ($fixedAsset) {
            $fixedAsset->depreciations()->delete();
            $fixedAsset->delete();
        });

        return response()->json(['message' => 'Immobilisation supprimée.']);
    }

    // ── Plan d'amortissement ─────────────────────────────────────────────────

    public function schedule(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        return response()->json($fixedAsset->depreciations()->orderBy('period_year')->orderBy('period_month')->get());
    }

    // ── Passer la dotation ────────────────────────────────────────────────────

    public function postDepreciation(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);

        $data = $request->validate([
            'period_year'  => 'nullable|integer',
            'period_month' => 'nullable|integer|min:1|max:12',
        ]);

        $year  = $data['period_year']  ?? now()->year;
        $month = $data['period_month'] ?? now()->month;

        $dep = FixedAssetDepreciation::where('fixed_asset_id', $fixedAsset->id)
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->first();

        abort_if(!$dep, 404, "Aucune dotation pour cette période.");
        abort_if($dep->posted, 422, "La dotation de cette période est déjà passée.");

        DB::transaction(function () use ($fixedAsset, $dep, $request) {
            $storeId = $fixedAsset->store_id;
            $userId  = $request->user()->id;

            $entry = JournalEntry::create([
                'store_id'    => $storeId,
                'reference'   => $this->nextJournalRef($storeId),
                'entry_date'  => $dep->depreciation_date,
                'description' => "Dotation amort. {$fixedAsset->name} {$dep->period_year}/{$dep->period_month}",
                'type'        => 'ajustement',
                'source_type' => 'fixed_asset',
                'source_id'   => $fixedAsset->id,
                'status'      => 'valide',
                'created_by'  => $userId,
                'validated_by' => $userId,
                'validated_at' => now(),
            ]);

            JournalEntryLine::create([
                'journal_entry_id' => $entry->id,
                'account_id'       => $fixedAsset->depreciation_account_id,
                'label'            => "Dotation amort. {$fixedAsset->name}",
                'debit'            => $dep->amount,
                'credit'           => 0,
            ]);

            JournalEntryLine::create([
                'journal_entry_id' => $entry->id,
                'account_id'       => $fixedAsset->accumulated_account_id,
                'label'            => "Amort. cumulé {$fixedAsset->name}",
                'debit'            => 0,
                'credit'           => $dep->amount,
            ]);

            $dep->update(['posted' => true, 'journal_entry_id' => $entry->id]);

            // Vérifier si complètement amorti
            $remaining = FixedAssetDepreciation::where('fixed_asset_id', $fixedAsset->id)
                ->where('posted', false)
                ->count();

            if ($remaining === 0) {
                $fixedAsset->update(['status' => 'fully_depreciated']);
            }
        });

        return response()->json($dep->fresh());
    }

    // ── Poster toutes les dotations dues ─────────────────────────────────────

    public function postAllDue(Request $request)
    {
        $storeId = $this->storeId($request);
        $userId  = $request->user()->id;

        $today = now();
        $year  = $today->year;
        $month = $today->month;

        $dues = FixedAssetDepreciation::where('posted', false)
            ->whereHas('fixedAsset', fn($q) => $q->where('store_id', $storeId)->where('status', 'active'))
            ->where(function ($q) use ($year, $month) {
                $q->where('period_year', '<', $year)
                  ->orWhere(fn($sq) => $sq->where('period_year', $year)->where('period_month', '<=', $month));
            })
            ->with('fixedAsset')
            ->get();

        $count = 0;
        foreach ($dues as $dep) {
            $asset = $dep->fixedAsset;
            DB::transaction(function () use ($asset, $dep, $userId, $storeId) {
                $entry = JournalEntry::create([
                    'store_id'     => $storeId,
                    'reference'    => $this->nextJournalRef($storeId),
                    'entry_date'   => $dep->depreciation_date,
                    'description'  => "Dotation amort. {$asset->name} {$dep->period_year}/{$dep->period_month}",
                    'type'         => 'ajustement',
                    'source_type'  => 'fixed_asset',
                    'source_id'    => $asset->id,
                    'status'       => 'valide',
                    'created_by'   => $userId,
                    'validated_by' => $userId,
                    'validated_at' => now(),
                ]);

                JournalEntryLine::create(['journal_entry_id' => $entry->id, 'account_id' => $asset->depreciation_account_id, 'label' => "Dotation {$asset->name}", 'debit' => $dep->amount, 'credit' => 0]);
                JournalEntryLine::create(['journal_entry_id' => $entry->id, 'account_id' => $asset->accumulated_account_id,  'label' => "Amort. cumulé {$asset->name}", 'debit' => 0, 'credit' => $dep->amount]);

                $dep->update(['posted' => true, 'journal_entry_id' => $entry->id]);
            });
            $count++;
        }

        // Mettre à jour les statuts
        FixedAsset::where('store_id', $storeId)
            ->where('status', 'active')
            ->whereDoesntHave('depreciations', fn($q) => $q->where('posted', false))
            ->update(['status' => 'fully_depreciated']);

        return response()->json(['posted' => $count]);
    }

    // ── Cession ───────────────────────────────────────────────────────────────

    public function sell(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        abort_if(!in_array($fixedAsset->status, ['active', 'fully_depreciated']), 422, 'Immobilisation déjà cédée ou mise au rebut.');

        $data = $request->validate([
            'sold_at'    => 'required|date',
            'sale_price' => 'required|numeric|min:0',
        ]);

        $accumulated = $fixedAsset->depreciations()->where('posted', true)->sum('amount');
        $vnc         = (float) $fixedAsset->acquisition_cost - (float) $accumulated;
        $gainLoss    = round((float) $data['sale_price'] - $vnc, 2);

        $fixedAsset->update([
            'status'     => 'sold',
            'sold_at'    => $data['sold_at'],
            'sale_price' => $data['sale_price'],
            'gain_loss'  => $gainLoss,
        ]);

        return response()->json([
            'asset'     => $fixedAsset->fresh(),
            'gain_loss' => $gainLoss,
        ]);
    }

    // ── Mise au rebut ─────────────────────────────────────────────────────────

    public function scrap(Request $request, FixedAsset $fixedAsset)
    {
        abort_if($fixedAsset->store_id !== $this->storeId($request), 403);
        abort_if(!in_array($fixedAsset->status, ['active', 'fully_depreciated']), 422, 'Immobilisation déjà cédée ou mise au rebut.');

        $data = $request->validate([
            'scrapped_at' => 'required|date',
            'notes'       => 'nullable|string|max:500',
        ]);

        $fixedAsset->update([
            'status'     => 'scrapped',
            'scrapped_at' => $data['scrapped_at'],
            'notes'      => $data['notes'] ?? $fixedAsset->notes,
        ]);

        return response()->json($fixedAsset->fresh());
    }
}
