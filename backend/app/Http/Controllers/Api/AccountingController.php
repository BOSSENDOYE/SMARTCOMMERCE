<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingAccount;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AccountingController extends Controller
{
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private function storeId(Request $request): int
    {
        return $request->user()->store_id;
    }

    private function nextReference(int $storeId, string $prefix): string
    {
        $year  = now()->format('Y');
        $month = now()->format('m');
        $base  = "{$prefix}-{$year}{$month}-";
        $last  = JournalEntry::where('store_id', $storeId)
            ->where('reference', 'like', "{$base}%")
            ->orderByDesc('reference')
            ->value('reference');
        $seq = $last ? ((int) substr($last, strlen($base))) + 1 : 1;
        return $base . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    // -----------------------------------------------------------------------
    // Plan comptable
    // -----------------------------------------------------------------------

    public function accounts(Request $request)
    {
        $accounts = AccountingAccount::where('store_id', $this->storeId($request))
            ->orderBy('code')
            ->get();

        return response()->json($accounts);
    }

    public function storeAccount(Request $request)
    {
        $data = $request->validate([
            'code'   => ['required', 'string', 'max:20',
                Rule::unique('accounting_accounts')->where('store_id', $this->storeId($request))],
            'name'   => 'required|string|max:150',
            'class'  => 'required|in:1,2,3,4,5,6,7',
            'nature' => 'required|in:actif,passif,charge,produit,tresorerie',
        ]);

        $account = AccountingAccount::create(array_merge($data, [
            'store_id'  => $this->storeId($request),
            'is_system' => false,
        ]));

        return response()->json($account, 201);
    }

    public function updateAccount(Request $request, AccountingAccount $account)
    {
        abort_if($account->store_id !== $this->storeId($request), 403);

        $data = $request->validate([
            'name'      => 'sometimes|string|max:150',
            'is_active' => 'sometimes|boolean',
        ]);

        // Les comptes système ne peuvent pas changer de code / class
        if (!$account->is_system) {
            $data = array_merge($data, $request->validate([
                'code'   => ['sometimes', 'string', 'max:20',
                    Rule::unique('accounting_accounts')
                        ->where('store_id', $this->storeId($request))
                        ->ignore($account->id)],
                'class'  => 'sometimes|in:1,2,3,4,5,6,7',
                'nature' => 'sometimes|in:actif,passif,charge,produit,tresorerie',
            ]));
        }

        $account->update($data);
        return response()->json($account);
    }

    public function destroyAccount(Request $request, AccountingAccount $account)
    {
        abort_if($account->store_id !== $this->storeId($request), 403);
        abort_if($account->is_system, 422, 'Les comptes système ne peuvent pas être supprimés.');
        abort_if($account->lines()->exists(), 422, 'Ce compte a des écritures associées.');

        $account->delete();
        return response()->json(null, 204);
    }

    // -----------------------------------------------------------------------
    // Journal
    // -----------------------------------------------------------------------

    public function journal(Request $request)
    {
        $entries = JournalEntry::where('store_id', $this->storeId($request))
            ->with(['lines.account', 'createdBy'])
            ->when($request->type,       fn($q) => $q->where('type', $request->type))
            ->when($request->status,     fn($q) => $q->where('status', $request->status))
            ->when($request->date_from,  fn($q) => $q->whereDate('entry_date', '>=', $request->date_from))
            ->when($request->date_to,    fn($q) => $q->whereDate('entry_date', '<=', $request->date_to))
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->paginate((int) ($request->per_page ?? 50));

        return response()->json($entries);
    }

    public function storeEntry(Request $request)
    {
        $data = $request->validate([
            'entry_date'      => 'required|date',
            'description'     => 'required|string|max:255',
            'type'            => 'required|in:vente,achat,paiement,charge,ajustement,perte,autre',
            'lines'           => 'required|array|min:2',
            'lines.*.account_id' => 'required|exists:accounting_accounts,id',
            'lines.*.label'   => 'required|string|max:255',
            'lines.*.debit'   => 'required|numeric|min:0',
            'lines.*.credit'  => 'required|numeric|min:0',
        ]);

        // Vérifier équilibre
        $totalDebit  = collect($data['lines'])->sum('debit');
        $totalCredit = collect($data['lines'])->sum('credit');
        abort_if(abs($totalDebit - $totalCredit) >= 0.01, 422, 'L\'écriture doit être équilibrée (Σ Débit = Σ Crédit).');

        DB::transaction(function () use ($data, $request) {
            $entry = JournalEntry::create([
                'store_id'    => $this->storeId($request),
                'reference'   => $this->nextReference($this->storeId($request), 'JNL'),
                'entry_date'  => $data['entry_date'],
                'description' => $data['description'],
                'type'        => $data['type'],
                'status'      => 'brouillon',
                'created_by'  => $request->user()->id,
            ]);

            foreach ($data['lines'] as $line) {
                $entry->lines()->create($line);
            }

            $this->_entry = $entry->load('lines.account');
        });

        return response()->json($this->_entry, 201);
    }

    private JournalEntry $_entry;

    public function validateEntry(Request $request, JournalEntry $entry)
    {
        abort_if($entry->store_id !== $this->storeId($request), 403);
        abort_if($entry->status === 'valide', 422, 'Cette écriture est déjà validée.');

        $entry->load('lines');
        abort_if(!$entry->isBalanced(), 422, 'L\'écriture n\'est pas équilibrée.');

        $entry->update([
            'status'       => 'valide',
            'validated_by' => $request->user()->id,
            'validated_at' => now(),
        ]);

        return response()->json($entry->load('lines.account', 'validatedBy'));
    }

    // -----------------------------------------------------------------------
    // Grand livre (Ledger per account)
    // -----------------------------------------------------------------------

    public function generalLedger(Request $request, AccountingAccount $account)
    {
        abort_if($account->store_id !== $this->storeId($request), 403);

        $lines = JournalEntryLine::where('account_id', $account->id)
            ->whereHas('journalEntry', function ($q) use ($request) {
                $q->where('store_id', $this->storeId($request))
                  ->where('status', 'valide')
                  ->when($request->date_from, fn($q2) => $q2->whereDate('entry_date', '>=', $request->date_from))
                  ->when($request->date_to,   fn($q2) => $q2->whereDate('entry_date', '<=', $request->date_to));
            })
            ->with(['journalEntry:id,reference,entry_date,description,type'])
            ->orderBy('journal_entry_id')
            ->get();

        // Calcul solde progressif
        $runningBalance = 0.0;
        $rows = $lines->map(function ($line) use (&$runningBalance) {
            $runningBalance += $line->debit - $line->credit;
            return [
                'id'          => $line->id,
                'date'        => $line->journalEntry->entry_date,
                'reference'   => $line->journalEntry->reference,
                'description' => $line->label,
                'type'        => $line->journalEntry->type,
                'debit'       => (float) $line->debit,
                'credit'      => (float) $line->credit,
                'solde'       => $runningBalance,
            ];
        });

        return response()->json([
            'account' => $account,
            'lines'   => $rows,
            'totals'  => [
                'debit'  => $rows->sum('debit'),
                'credit' => $rows->sum('credit'),
                'solde'  => $runningBalance,
            ],
        ]);
    }

    // -----------------------------------------------------------------------
    // Balance des comptes (Trial Balance)
    // -----------------------------------------------------------------------

    public function trialBalance(Request $request)
    {
        $storeId = $this->storeId($request);
        $from    = $request->input('date_from');
        $to      = $request->input('date_to');

        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($storeId, $from, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $storeId)
                     ->where('e.status', 'valide')
                     ->when($from, fn($q) => $q->whereDate('e.entry_date', '>=', $from))
                     ->when($to,   fn($q) => $q->whereDate('e.entry_date', '<=', $to));
            })
            ->where('a.store_id', $storeId)
            ->where('a.is_active', true)
            ->select(
                'a.id', 'a.code', 'a.name', 'a.class', 'a.nature',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit'),
                DB::raw('COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as solde')
            )
            ->groupBy('a.id', 'a.code', 'a.name', 'a.class', 'a.nature')
            ->orderBy('a.code')
            ->get();

        return response()->json([
            'data'   => $rows,
            'totals' => [
                'debit'  => $rows->sum('total_debit'),
                'credit' => $rows->sum('total_credit'),
            ],
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // -----------------------------------------------------------------------
    // Compte de résultat (Income Statement / P&L)
    // -----------------------------------------------------------------------

    public function incomeStatement(Request $request)
    {
        $storeId = $this->storeId($request);
        $from    = $request->input('date_from', now()->startOfYear()->toDateString());
        $to      = $request->input('date_to', now()->toDateString());

        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($storeId, $from, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $storeId)
                     ->where('e.status', 'valide')
                     ->whereDate('e.entry_date', '>=', $from)
                     ->whereDate('e.entry_date', '<=', $to);
            })
            ->where('a.store_id', $storeId)
            ->where('a.is_active', true)
            ->whereIn('a.class', ['6', '7'])
            ->select(
                'a.code', 'a.name', 'a.class', 'a.nature',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit')
            )
            ->groupBy('a.code', 'a.name', 'a.class', 'a.nature')
            ->orderBy('a.code')
            ->get();

        $produits = $rows->where('class', '7');
        $charges  = $rows->where('class', '6');

        $totalProduits = $produits->sum('total_credit') - $produits->sum('total_debit');
        $totalCharges  = $charges->sum('total_debit')  - $charges->sum('total_credit');
        $resultat      = $totalProduits - $totalCharges;

        return response()->json([
            'produits'       => $produits->values(),
            'charges'        => $charges->values(),
            'total_produits' => $totalProduits,
            'total_charges'  => $totalCharges,
            'resultat'       => $resultat,
            'period'         => ['from' => $from, 'to' => $to],
        ]);
    }

    // -----------------------------------------------------------------------
    // Bilan OHADA (Actif / Passif)
    // -----------------------------------------------------------------------

    public function bilan(Request $request)
    {
        $storeId = $this->storeId($request);
        $to      = $request->input('date_to', now()->toDateString());

        // Solde cumulé de chaque compte jusqu'à la date demandée
        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($storeId, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $storeId)
                     ->where('e.status', 'valide')
                     ->whereDate('e.entry_date', '<=', $to);
            })
            ->where('a.store_id', $storeId)
            ->where('a.is_active', true)
            ->select(
                'a.id', 'a.code', 'a.name', 'a.class', 'a.nature',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit'),
                DB::raw('COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as solde')
            )
            ->groupBy('a.id', 'a.code', 'a.name', 'a.class', 'a.nature')
            ->orderBy('a.code')
            ->get();

        // Résultat de l'exercice = Total produits (Cl.7) - Total charges (Cl.6)
        $totalProduits = $rows->where('class', '7')->sum(fn($r) => $r->total_credit - $r->total_debit);
        $totalCharges  = $rows->where('class', '6')->sum(fn($r) => $r->total_debit  - $r->total_credit);
        $resultat      = $totalProduits - $totalCharges;

        // ── ACTIF ─────────────────────────────────────────────────────────
        $immobilise = $rows->where('class', '2')
            ->where('solde', '>', 0)
            ->values();

        $stocks = $rows->where('class', '3')
            ->where('solde', '>', 0)
            ->values();

        $creances = $rows->where('class', '4')
            ->where('nature', 'actif')
            ->where('solde', '>', 0)
            ->values();

        $tresorerieActif = $rows->where('nature', 'tresorerie')
            ->where('solde', '>', 0)
            ->values();

        // Perte de l'exercice = actif si résultat < 0
        $perteActif = $resultat < 0 ? abs($resultat) : 0;

        $totalActif = $immobilise->sum('solde')
                    + $stocks->sum('solde')
                    + $creances->sum('solde')
                    + $tresorerieActif->sum('solde')
                    + $perteActif;

        // ── PASSIF ────────────────────────────────────────────────────────
        $capitaux = $rows->where('class', '1')
            ->where('nature', 'passif')
            ->map(fn($r) => (object) array_merge((array) $r, ['montant' => abs((float) $r->solde)]))
            ->values();

        $dettes = $rows->where('class', '4')
            ->where('nature', 'passif')
            ->where('solde', '<', 0)
            ->map(fn($r) => (object) array_merge((array) $r, ['montant' => abs((float) $r->solde)]))
            ->values();

        // Bénéfice = passif si résultat > 0
        $beneficePassif = $resultat > 0 ? $resultat : 0;

        $totalPassif = $capitaux->sum('montant')
                     + $dettes->sum('montant')
                     + $beneficePassif;

        return response()->json([
            'actif' => [
                'immobilise'   => $immobilise,
                'stocks'       => $stocks,
                'creances'     => $creances,
                'tresorerie'   => $tresorerieActif,
                'perte_exercice' => $perteActif,
                'total'        => $totalActif,
            ],
            'passif' => [
                'capitaux'     => $capitaux,
                'resultat'     => $beneficePassif,
                'dettes'       => $dettes,
                'total'        => $totalPassif,
            ],
            'resultat'     => $resultat,
            'equilibre'    => abs($totalActif - $totalPassif) < 1,
            'date_to'      => $to,
        ]);
    }

    // -----------------------------------------------------------------------
    // Génération automatique depuis les ventes
    // -----------------------------------------------------------------------

    public function generateFromSales(Request $request)
    {
        $storeId = $this->storeId($request);
        $from    = $request->input('date_from', now()->toDateString());
        $to      = $request->input('date_to',   now()->toDateString());

        // Comptes obligatoires
        $accounts = AccountingAccount::where('store_id', $storeId)
            ->whereIn('code', ['571', '521', '701', '44571'])
            ->pluck('id', 'code');

        $missing = array_diff(['571', '701', '44571'], $accounts->keys()->toArray());
        if ($missing) {
            return response()->json([
                'message' => 'Comptes manquants : ' . implode(', ', $missing) . '. Initialisez le plan comptable.',
            ], 422);
        }

        $sales = Sale::where('store_id', $storeId)
            ->where('status', 'completed')
            ->whereBetween(DB::raw('date(created_at)'), [$from, $to])
            ->whereNotExists(fn($q) =>
                $q->from('journal_entries')
                  ->where('source_type', 'sale')
                  ->whereColumn('source_id', 'sales.id')
                  ->where('store_id', $storeId)
            )
            ->with('payments')
            ->get();

        $created = 0;
        foreach ($sales as $sale) {
            DB::transaction(function () use ($sale, $storeId, $accounts, $request, &$created) {
                // Choisir compte trésorerie selon mode de paiement dominant
                $cashMethods = ['especes', 'cash'];
                $hasCash = $sale->payments->contains(fn($p) => in_array($p->method, $cashMethods));
                $treasuryCode = $hasCash ? '571' : ($accounts->has('521') ? '521' : '571');
                $treasuryId   = $accounts[$treasuryCode] ?? $accounts['571'];

                $entry = JournalEntry::create([
                    'store_id'    => $storeId,
                    'reference'   => $this->nextReference($storeId, 'VTE'),
                    'entry_date'  => $sale->created_at->toDateString(),
                    'description' => "Vente #{$sale->receipt_number}",
                    'type'        => 'vente',
                    'source_id'   => $sale->id,
                    'source_type' => 'sale',
                    'status'      => 'valide',
                    'created_by'  => $request->user()->id,
                    'validated_by' => $request->user()->id,
                    'validated_at' => now(),
                ]);

                // Débit trésorerie = total TTC
                $entry->lines()->create([
                    'account_id' => $treasuryId,
                    'label'      => "Encaissement vente #{$sale->receipt_number}",
                    'debit'      => $sale->total_ttc,
                    'credit'     => 0,
                ]);

                // Crédit ventes HT
                $htAmount = $sale->subtotal_ht ?? ($sale->total_ttc - ($sale->vat_amount ?? 0));
                $entry->lines()->create([
                    'account_id' => $accounts['701'],
                    'label'      => "Ventes marchandises #{$sale->receipt_number}",
                    'debit'      => 0,
                    'credit'     => $htAmount,
                ]);

                // Crédit TVA collectée
                if ($sale->vat_amount > 0) {
                    $entry->lines()->create([
                        'account_id' => $accounts['44571'],
                        'label'      => "TVA collectée #{$sale->receipt_number}",
                        'debit'      => 0,
                        'credit'     => $sale->vat_amount,
                    ]);
                }

                $created++;
            });
        }

        return response()->json([
            'message' => "{$created} écriture(s) générée(s) depuis les ventes.",
            'count'   => $created,
            'period'  => compact('from', 'to'),
        ]);
    }

    // -----------------------------------------------------------------------
    // Génération automatique depuis les factures fournisseurs
    // -----------------------------------------------------------------------

    public function generateFromPurchases(Request $request)
    {
        $storeId = $this->storeId($request);
        $from    = $request->input('date_from', now()->toDateString());
        $to      = $request->input('date_to',   now()->toDateString());

        $accounts = AccountingAccount::where('store_id', $storeId)
            ->whereIn('code', ['601', '44566', '401'])
            ->pluck('id', 'code');

        $missing = array_diff(['601', '44566', '401'], $accounts->keys()->toArray());
        if ($missing) {
            return response()->json([
                'message' => 'Comptes manquants : ' . implode(', ', $missing) . '. Initialisez le plan comptable.',
            ], 422);
        }

        $invoices = SupplierInvoice::where('store_id', $storeId)
            ->whereBetween(DB::raw('date(invoice_date)'), [$from, $to])
            ->whereNotExists(fn($q) =>
                $q->from('journal_entries')
                  ->where('source_type', 'supplier_invoice')
                  ->whereColumn('source_id', 'supplier_invoices.id')
                  ->where('store_id', $storeId)
            )
            ->with('supplier')
            ->get();

        $created = 0;
        foreach ($invoices as $invoice) {
            DB::transaction(function () use ($invoice, $storeId, $accounts, $request, &$created) {
                $entry = JournalEntry::create([
                    'store_id'    => $storeId,
                    'reference'   => $this->nextReference($storeId, 'ACH'),
                    'entry_date'  => $invoice->invoice_date->toDateString(),
                    'description' => "Achat fournisseur {$invoice->supplier->company_name} — {$invoice->reference}",
                    'type'        => 'achat',
                    'source_id'   => $invoice->id,
                    'source_type' => 'supplier_invoice',
                    'status'      => 'valide',
                    'created_by'  => $request->user()->id,
                    'validated_by' => $request->user()->id,
                    'validated_at' => now(),
                ]);

                // Débit achats HT
                $entry->lines()->create([
                    'account_id' => $accounts['601'],
                    'label'      => "Achat marchandises — {$invoice->reference}",
                    'debit'      => $invoice->amount_ht,
                    'credit'     => 0,
                ]);

                // Débit TVA déductible
                if ($invoice->vat_amount > 0) {
                    $entry->lines()->create([
                        'account_id' => $accounts['44566'],
                        'label'      => "TVA déductible — {$invoice->reference}",
                        'debit'      => $invoice->vat_amount,
                        'credit'     => 0,
                    ]);
                }

                // Crédit fournisseur TTC
                $entry->lines()->create([
                    'account_id' => $accounts['401'],
                    'label'      => "Dette fournisseur — {$invoice->reference}",
                    'debit'      => 0,
                    'credit'     => $invoice->amount_ttc,
                ]);

                $created++;
            });
        }

        return response()->json([
            'message' => "{$created} écriture(s) générée(s) depuis les achats fournisseurs.",
            'count'   => $created,
            'period'  => compact('from', 'to'),
        ]);
    }

    // -----------------------------------------------------------------------
    // Génération automatique depuis les dépenses validées
    // -----------------------------------------------------------------------

    public function generateFromExpenses(Request $request)
    {
        $storeId = $this->storeId($request);
        $from    = $request->input('date_from', now()->toDateString());
        $to      = $request->input('date_to',   now()->toDateString());

        // Dépenses validées sans écriture ou dont l'écriture a été supprimée
        $expenses = Expense::where('store_id', $storeId)
            ->where('status', 'validated')
            ->whereNull('journal_entry_id')
            ->whereDate('expense_date', '>=', $from)
            ->whereDate('expense_date', '<=', $to)
            ->with(['category', 'chargeAccount', 'treasuryAccount'])
            ->get();

        $expenseController = app(\App\Http\Controllers\Api\ExpenseController::class);
        $created = 0;
        foreach ($expenses as $expense) {
            DB::transaction(function () use ($expense, $request, &$created, $expenseController) {
                // Appel privé via réflexion — on reconstruit l'écriture
                $method = new \ReflectionMethod($expenseController, 'createJournalEntry');
                $method->setAccessible(true);
                $method->invoke($expenseController, $expense, $request->user()->id);
                $created++;
            });
        }

        return response()->json([
            'message' => "{$created} écriture(s) générée(s) depuis les dépenses.",
            'count'   => $created,
            'period'  => compact('from', 'to'),
        ]);
    }

    // -----------------------------------------------------------------------
    // Initialisation du plan comptable SYSCOHADA (simplifié)
    // -----------------------------------------------------------------------

    public function initAccounts(Request $request)
    {
        $storeId = $this->storeId($request);

        $plan = [
            // Classe 1 — Ressources durables
            ['code' => '101',   'name' => 'Capital social',                      'class' => '1', 'nature' => 'passif'],
            ['code' => '130',   'name' => 'Résultat net de l\'exercice',         'class' => '1', 'nature' => 'passif'],
            // Classe 3 — Stocks
            ['code' => '31',    'name' => 'Marchandises en stock',               'class' => '3', 'nature' => 'actif'],
            // Classe 4 — Tiers
            ['code' => '401',   'name' => 'Fournisseurs',                        'class' => '4', 'nature' => 'passif'],
            ['code' => '411',   'name' => 'Clients',                             'class' => '4', 'nature' => 'actif'],
            ['code' => '421',   'name' => 'Personnel — rémunérations dues',      'class' => '4', 'nature' => 'passif'],
            ['code' => '44566', 'name' => 'TVA déductible sur achats',           'class' => '4', 'nature' => 'actif'],
            ['code' => '44571', 'name' => 'TVA collectée sur ventes',            'class' => '4', 'nature' => 'passif'],
            ['code' => '447',   'name' => 'État — impôts et taxes à payer',      'class' => '4', 'nature' => 'passif'],
            // Classe 5 — Trésorerie
            ['code' => '521',   'name' => 'Banque',                              'class' => '5', 'nature' => 'tresorerie'],
            ['code' => '571',   'name' => 'Caisse principale',                   'class' => '5', 'nature' => 'tresorerie'],
            // Classe 6 — Charges
            ['code' => '601',   'name' => 'Achats de marchandises',              'class' => '6', 'nature' => 'charge'],
            ['code' => '606',   'name' => 'Fournitures non stockables',          'class' => '6', 'nature' => 'charge'],
            ['code' => '622',   'name' => 'Locations et charges locatives',      'class' => '6', 'nature' => 'charge'],
            ['code' => '624',   'name' => 'Entretien, réparations, maintenance', 'class' => '6', 'nature' => 'charge'],
            ['code' => '625',   'name' => 'Primes d\'assurance',                 'class' => '6', 'nature' => 'charge'],
            ['code' => '626',   'name' => 'Frais de télécommunications',         'class' => '6', 'nature' => 'charge'],
            ['code' => '631',   'name' => 'Frais bancaires',                     'class' => '6', 'nature' => 'charge'],
            ['code' => '632',   'name' => 'Honoraires et prestations',           'class' => '6', 'nature' => 'charge'],
            ['code' => '641',   'name' => 'Rémunérations du personnel',          'class' => '6', 'nature' => 'charge'],
            ['code' => '645',   'name' => 'Charges sociales et patronales',      'class' => '6', 'nature' => 'charge'],
            ['code' => '651',   'name' => 'Impôts et taxes directs',             'class' => '6', 'nature' => 'charge'],
            ['code' => '658',   'name' => 'Charges diverses',                    'class' => '6', 'nature' => 'charge'],
            ['code' => '695',   'name' => 'Impôt sur le résultat',               'class' => '6', 'nature' => 'charge'],
            // Classe 7 — Produits
            ['code' => '701',   'name' => 'Ventes de marchandises',              'class' => '7', 'nature' => 'produit'],
            ['code' => '706',   'name' => 'Services rendus',                     'class' => '7', 'nature' => 'produit'],
            ['code' => '754',   'name' => 'Produits divers',                     'class' => '7', 'nature' => 'produit'],
        ];

        $created = 0;
        $skipped = 0;
        foreach ($plan as $item) {
            $exists = AccountingAccount::where('store_id', $storeId)
                ->where('code', $item['code'])
                ->exists();

            if (!$exists) {
                AccountingAccount::create(array_merge($item, [
                    'store_id'  => $storeId,
                    'is_system' => true,
                ]));
                $created++;
            } else {
                $skipped++;
            }
        }

        return response()->json([
            'message' => "{$created} compte(s) créé(s), {$skipped} déjà existant(s).",
            'created' => $created,
            'skipped' => $skipped,
        ]);
    }
}
