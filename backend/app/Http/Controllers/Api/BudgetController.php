<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Budget;
use App\Models\BudgetLine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BudgetController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    // ── Liste ─────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $q = Budget::where('store_id', $this->storeId($request))
            ->with('createdBy:id,name')
            ->orderByDesc('year')
            ->orderBy('name');

        if ($request->filled('year')) {
            $q->where('year', $request->year);
        }
        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }

        return response()->json($q->get());
    }

    // ── Créer ─────────────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:150',
            'year'        => 'required|integer|min:2000|max:2100',
            'period_type' => 'required|in:monthly,quarterly,annual',
            'notes'       => 'nullable|string|max:1000',
            'lines'       => 'required|array|min:1',
            'lines.*.account_id' => 'required|integer|exists:accounting_accounts,id',
            'lines.*.month'      => 'nullable|integer|min:1|max:12',
            'lines.*.quarter'    => 'nullable|integer|min:1|max:4',
            'lines.*.amount'     => 'required|numeric|min:0',
        ]);

        $budget = DB::transaction(function () use ($data, $request) {
            $budget = Budget::create([
                'store_id'    => $this->storeId($request),
                'created_by'  => $request->user()->id,
                'name'        => $data['name'],
                'year'        => $data['year'],
                'period_type' => $data['period_type'],
                'status'      => 'draft',
                'notes'       => $data['notes'] ?? null,
            ]);

            foreach ($data['lines'] as $line) {
                BudgetLine::create([
                    'budget_id'  => $budget->id,
                    'account_id' => $line['account_id'],
                    'month'      => $line['month'] ?? null,
                    'quarter'    => $line['quarter'] ?? null,
                    'amount'     => $line['amount'],
                ]);
            }

            return $budget;
        });

        return response()->json($budget->load('lines.account'), 201);
    }

    // ── Détail ────────────────────────────────────────────────────────────────

    public function show(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        return response()->json($budget->load(['lines.account', 'createdBy:id,name']));
    }

    // ── Modifier ──────────────────────────────────────────────────────────────

    public function update(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        abort_if($budget->status !== 'draft', 422, 'Seul un budget en brouillon peut être modifié.');

        $data = $request->validate([
            'name'        => 'sometimes|string|max:150',
            'notes'       => 'nullable|string|max:1000',
            'lines'       => 'sometimes|array|min:1',
            'lines.*.account_id' => 'required_with:lines|integer|exists:accounting_accounts,id',
            'lines.*.month'      => 'nullable|integer|min:1|max:12',
            'lines.*.quarter'    => 'nullable|integer|min:1|max:4',
            'lines.*.amount'     => 'required_with:lines|numeric|min:0',
        ]);

        DB::transaction(function () use ($data, $budget) {
            $budget->update(array_filter([
                'name'  => $data['name'] ?? $budget->name,
                'notes' => $data['notes'] ?? $budget->notes,
            ]));

            if (isset($data['lines'])) {
                $budget->lines()->delete();
                foreach ($data['lines'] as $line) {
                    BudgetLine::create([
                        'budget_id'  => $budget->id,
                        'account_id' => $line['account_id'],
                        'month'      => $line['month'] ?? null,
                        'quarter'    => $line['quarter'] ?? null,
                        'amount'     => $line['amount'],
                    ]);
                }
            }
        });

        return response()->json($budget->fresh()->load('lines.account'));
    }

    // ── Supprimer ─────────────────────────────────────────────────────────────

    public function destroy(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        abort_if($budget->status !== 'draft', 422, 'Seul un budget en brouillon peut être supprimé.');

        $budget->lines()->delete();
        $budget->delete();
        return response()->json(['message' => 'Budget supprimé.']);
    }

    // ── Activer ───────────────────────────────────────────────────────────────

    public function activate(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        abort_if($budget->status !== 'draft', 422, 'Le budget doit être en brouillon pour être activé.');

        $budget->update(['status' => 'active']);
        return response()->json($budget);
    }

    // ── Clore ─────────────────────────────────────────────────────────────────

    public function close(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        abort_if($budget->status !== 'active', 422, 'Le budget doit être actif pour être clôturé.');

        $budget->update(['status' => 'closed']);
        return response()->json($budget);
    }

    // ── Comparaison Budget vs Réalisé ─────────────────────────────────────────

    public function comparison(Request $request, Budget $budget)
    {
        abort_if($budget->store_id !== $this->storeId($request), 403);
        $budget->load('lines.account');

        $storeId = $this->storeId($request);
        $year    = $budget->year;
        $month   = $request->input('month');
        $quarter = $request->input('quarter');

        $rows = [];
        $totalPrevu    = 0;
        $totalRealise  = 0;

        foreach ($budget->lines as $line) {
            // Construire la requête SQL pour le réalisé
            $q = DB::table('journal_entry_lines as jel')
                ->join('journal_entries as je', 'je.id', '=', 'jel.journal_entry_id')
                ->where('je.store_id', $storeId)
                ->where('je.status', 'valide')
                ->where('jel.account_id', $line->account_id)
                ->whereYear('je.entry_date', $year);

            // Filtrage période
            if ($budget->period_type === 'monthly' && $month) {
                $q->whereMonth('je.entry_date', $month);
            } elseif ($budget->period_type === 'quarterly' && $quarter) {
                $startMonth = ($quarter - 1) * 3 + 1;
                $endMonth   = $startMonth + 2;
                $q->whereMonth('je.entry_date', '>=', $startMonth)
                  ->whereMonth('je.entry_date', '<=', $endMonth);
            }

            $result  = $q->selectRaw('COALESCE(SUM(jel.debit), 0) as total_debit, COALESCE(SUM(jel.credit), 0) as total_credit')
                         ->first();

            // Pour les comptes de charge (6), le réalisé = débit - crédit
            // Pour les comptes de produit (7), le réalisé = crédit - débit
            $account = $line->account;
            $realise = $account && in_array($account->class, ['6', '7'])
                ? ($account->class === '6'
                    ? (float) $result->total_debit - (float) $result->total_credit
                    : (float) $result->total_credit - (float) $result->total_debit)
                : ((float) $result->total_debit - (float) $result->total_credit);

            $prevu       = (float) $line->amount;
            $ecart       = round($realise - $prevu, 2);
            $ecartPct    = $prevu != 0 ? round($ecart / $prevu * 100, 1) : null;

            $totalPrevu   += $prevu;
            $totalRealise += $realise;

            $rows[] = [
                'account'     => ['id' => $account?->id, 'code' => $account?->code, 'name' => $account?->name, 'class' => $account?->class],
                'budget_line' => ['id' => $line->id, 'month' => $line->month, 'quarter' => $line->quarter],
                'prevu'       => $prevu,
                'realise'     => round($realise, 2),
                'ecart'       => $ecart,
                'ecart_pct'   => $ecartPct,
            ];
        }

        $totalEcart    = round($totalRealise - $totalPrevu, 2);
        $totalEcartPct = $totalPrevu != 0 ? round($totalEcart / $totalPrevu * 100, 1) : null;

        return response()->json([
            'budget'      => $budget,
            'filter'      => ['year' => $year, 'month' => $month, 'quarter' => $quarter],
            'rows'        => $rows,
            'totals'      => [
                'prevu'     => round($totalPrevu, 2),
                'realise'   => round($totalRealise, 2),
                'ecart'     => $totalEcart,
                'ecart_pct' => $totalEcartPct,
            ],
        ]);
    }
}
