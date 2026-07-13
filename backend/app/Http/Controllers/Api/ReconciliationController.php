<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountReconciliation;
use App\Models\JournalEntryLine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReconciliationController extends Controller
{
    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    // ── Liste des lettrages ───────────────────────────────────────────────────

    public function index(Request $request)
    {
        $q = AccountReconciliation::where('store_id', $this->storeId($request))
            ->with(['account:id,code,name', 'letteredBy:id,name'])
            ->orderByDesc('lettered_at');

        if ($request->filled('account_id')) {
            $q->where('account_id', $request->account_id);
        }
        if ($request->filled('date_from')) {
            $q->whereDate('lettered_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $q->whereDate('lettered_at', '<=', $request->date_to);
        }

        return response()->json($q->paginate($request->input('per_page', 20)));
    }

    // ── Lignes disponibles (non lettrées) ─────────────────────────────────────

    public function availableLines(Request $request)
    {
        $request->validate([
            'account_id' => 'required|integer|exists:accounting_accounts,id',
        ]);

        $lines = JournalEntryLine::where('account_id', $request->account_id)
            ->whereNull('reconciliation_id')
            ->whereHas('journalEntry', fn($q) => $q
                ->where('store_id', $this->storeId($request))
                ->where('status', 'valide')
            )
            ->with(['journalEntry:id,reference,entry_date,description'])
            ->orderByDesc('id')
            ->get();

        return response()->json($lines);
    }

    // ── Créer un lettrage ─────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $data = $request->validate([
            'account_id' => 'required|integer|exists:accounting_accounts,id',
            'line_ids'   => 'required|array|min:2',
            'line_ids.*' => 'integer|exists:journal_entry_lines,id',
            'notes'      => 'nullable|string|max:500',
        ]);

        $storeId = $this->storeId($request);

        $lines = JournalEntryLine::whereIn('id', $data['line_ids'])
            ->whereNull('reconciliation_id')
            ->where('account_id', $data['account_id'])
            ->whereHas('journalEntry', fn($q) => $q->where('store_id', $storeId)->where('status', 'valide'))
            ->get();

        abort_if($lines->count() !== count($data['line_ids']), 422,
            'Certaines lignes sont invalides, déjà lettrées, ou appartiennent à un autre magasin.');

        $totalDebit  = round((float) $lines->sum('debit'), 2);
        $totalCredit = round((float) $lines->sum('credit'), 2);
        $difference  = round(abs($totalDebit - $totalCredit), 2);

        $reconciliation = DB::transaction(function () use ($data, $lines, $totalDebit, $totalCredit, $difference, $storeId, $request) {
            $rec = AccountReconciliation::create([
                'store_id'      => $storeId,
                'account_id'    => $data['account_id'],
                'lettered_by'   => $request->user()->id,
                'reference'     => AccountReconciliation::generateReference($storeId),
                'lettered_at'   => now(),
                'amount_debit'  => $totalDebit,
                'amount_credit' => $totalCredit,
                'difference'    => $difference,
                'notes'         => $data['notes'] ?? null,
            ]);

            JournalEntryLine::whereIn('id', $lines->pluck('id'))
                ->update(['reconciliation_id' => $rec->id]);

            return $rec;
        });

        $warning = $difference > 0
            ? "Lettrage partiel : écart de {$difference} FCFA."
            : null;

        return response()->json([
            'reconciliation' => $reconciliation->load(['account', 'letteredBy', 'lines.journalEntry']),
            'warning'        => $warning,
        ], 201);
    }

    // ── Détail ────────────────────────────────────────────────────────────────

    public function show(Request $request, AccountReconciliation $reconciliation)
    {
        abort_if($reconciliation->store_id !== $this->storeId($request), 403);
        return response()->json(
            $reconciliation->load(['account', 'letteredBy', 'lines.journalEntry'])
        );
    }

    // ── Délettrage ────────────────────────────────────────────────────────────

    public function destroy(Request $request, AccountReconciliation $reconciliation)
    {
        abort_if($reconciliation->store_id !== $this->storeId($request), 403);

        DB::transaction(function () use ($reconciliation) {
            JournalEntryLine::where('reconciliation_id', $reconciliation->id)
                ->update(['reconciliation_id' => null]);
            $reconciliation->delete();
        });

        return response()->json(['message' => 'Lettrage annulé.']);
    }
}
