<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingAccount;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\JournalEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function sid(Request $r): int
    {
        return $r->user()->store_id;
    }

    private function nextJournalRef(int $storeId): string
    {
        $base = 'DEP-' . now()->format('Ym') . '-';
        $last = JournalEntry::where('store_id', $storeId)
            ->where('reference', 'like', "{$base}%")
            ->orderByDesc('reference')
            ->value('reference');
        $seq  = $last ? ((int) substr($last, strlen($base))) + 1 : 1;
        return $base . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    // ─── Categories ───────────────────────────────────────────────────────────

    /** GET /expense-categories */
    public function categories(Request $r)
    {
        $cats = ExpenseCategory::where('store_id', $this->sid($r))
            ->with('defaultChargeAccount')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($cats);
    }

    /** POST /expense-categories/init  — charge les catégories SYSCOHADA par défaut */
    public function initCategories(Request $r)
    {
        $storeId  = $this->sid($r);
        $accounts = AccountingAccount::where('store_id', $storeId)
            ->pluck('id', 'code');

        $defaults = [
            ['name' => 'Loyer & charges locatives',      'code' => '622', 'color' => 'indigo',  'vat' => true,  'sort' => 1],
            ['name' => 'Salaires & rémunérations',       'code' => '641', 'color' => 'violet',  'vat' => false, 'sort' => 2],
            ['name' => 'Électricité / Eau / Gaz',        'code' => '606', 'color' => 'yellow',  'vat' => true,  'sort' => 3],
            ['name' => 'Transport & déplacements',        'code' => '624', 'color' => 'blue',    'vat' => true,  'sort' => 4],
            ['name' => 'Fournitures de bureau',           'code' => '606', 'color' => 'orange',  'vat' => true,  'sort' => 5],
            ['name' => 'Téléphone & Internet',            'code' => '626', 'color' => 'sky',     'vat' => true,  'sort' => 6],
            ['name' => 'Entretien & réparations',         'code' => '624', 'color' => 'teal',    'vat' => true,  'sort' => 7],
            ['name' => 'Assurances',                      'code' => '625', 'color' => 'emerald', 'vat' => false, 'sort' => 8],
            ['name' => 'Honoraires & prestations',        'code' => '632', 'color' => 'purple',  'vat' => true,  'sort' => 9],
            ['name' => 'Impôts & taxes',                  'code' => '651', 'color' => 'red',     'vat' => false, 'sort' => 10],
            ['name' => 'Frais bancaires',                 'code' => '631', 'color' => 'gray',    'vat' => false, 'sort' => 11],
            ['name' => 'Charges sociales & patronales',   'code' => '645', 'color' => 'pink',    'vat' => false, 'sort' => 12],
            ['name' => 'Autres charges',                  'code' => '658', 'color' => 'slate',   'vat' => false, 'sort' => 13],
        ];

        $created = 0;
        foreach ($defaults as $d) {
            $exists = ExpenseCategory::where('store_id', $storeId)->where('name', $d['name'])->exists();
            if (!$exists) {
                ExpenseCategory::create([
                    'store_id'                  => $storeId,
                    'name'                      => $d['name'],
                    'default_account_code'      => $d['code'],
                    'default_charge_account_id' => $accounts[$d['code']] ?? null,
                    'is_vat_deductible'         => $d['vat'],
                    'color'                     => $d['color'],
                    'sort_order'                => $d['sort'],
                ]);
                $created++;
            }
        }

        return response()->json([
            'message' => "{$created} catégorie(s) créée(s).",
            'created' => $created,
        ]);
    }

    /** POST /expense-categories */
    public function storeCategory(Request $r)
    {
        $data = $r->validate([
            'name'                      => 'required|string|max:100',
            'default_charge_account_id' => 'nullable|exists:accounting_accounts,id',
            'is_vat_deductible'         => 'boolean',
            'color'                     => 'nullable|string|max:20',
            'sort_order'                => 'integer|min:0',
        ]);

        // Vérifier que le compte appartient au magasin
        if (!empty($data['default_charge_account_id'])) {
            $acc = AccountingAccount::findOrFail($data['default_charge_account_id']);
            abort_if($acc->store_id !== $this->sid($r), 403);
            $data['default_account_code'] = $acc->code;
        }

        $cat = ExpenseCategory::create(array_merge($data, ['store_id' => $this->sid($r)]));
        return response()->json($cat->load('defaultChargeAccount'), 201);
    }

    /** PUT /expense-categories/{category} */
    public function updateCategory(Request $r, ExpenseCategory $category)
    {
        abort_if($category->store_id !== $this->sid($r), 403);

        $data = $r->validate([
            'name'                      => 'sometimes|string|max:100',
            'default_charge_account_id' => 'nullable|exists:accounting_accounts,id',
            'is_vat_deductible'         => 'sometimes|boolean',
            'color'                     => 'nullable|string|max:20',
            'is_active'                 => 'sometimes|boolean',
            'sort_order'                => 'sometimes|integer|min:0',
        ]);

        if (array_key_exists('default_charge_account_id', $data) && $data['default_charge_account_id']) {
            $acc = AccountingAccount::findOrFail($data['default_charge_account_id']);
            abort_if($acc->store_id !== $this->sid($r), 403);
            $data['default_account_code'] = $acc->code;
        }

        $category->update($data);
        return response()->json($category->load('defaultChargeAccount'));
    }

    /** DELETE /expense-categories/{category} */
    public function destroyCategory(Request $r, ExpenseCategory $category)
    {
        abort_if($category->store_id !== $this->sid($r), 403);
        abort_if($category->expenses()->exists(), 422, 'Impossible : des dépenses utilisent cette catégorie.');

        $category->delete();
        return response()->json(null, 204);
    }

    // ─── Expenses ─────────────────────────────────────────────────────────────

    /** GET /expenses */
    public function index(Request $r)
    {
        $expenses = Expense::where('store_id', $this->sid($r))
            ->with(['category', 'chargeAccount', 'treasuryAccount', 'user'])
            ->when($r->status,       fn($q) => $q->where('status', $r->status))
            ->when($r->category_id,  fn($q) => $q->where('expense_category_id', $r->category_id))
            ->when($r->payment_method, fn($q) => $q->where('payment_method', $r->payment_method))
            ->when($r->date_from,    fn($q) => $q->whereDate('expense_date', '>=', $r->date_from))
            ->when($r->date_to,      fn($q) => $q->whereDate('expense_date', '<=', $r->date_to))
            ->when($r->search,       fn($q) => $q->where(fn($s) =>
                $s->where('description', 'like', "%{$r->search}%")
                  ->orWhere('beneficiary', 'like', "%{$r->search}%")
                  ->orWhere('reference', 'like', "%{$r->search}%")
            ))
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->paginate((int)($r->per_page ?? 25));

        return response()->json($expenses);
    }

    /** GET /expenses/stats */
    public function stats(Request $r)
    {
        $storeId = $this->sid($r);
        $from    = $r->input('date_from', now()->startOfMonth()->toDateString());
        $to      = $r->input('date_to', now()->toDateString());

        $base = Expense::where('store_id', $storeId)
            ->whereDate('expense_date', '>=', $from)
            ->whereDate('expense_date', '<=', $to);

        return response()->json([
            'total_ttc'    => (float) (clone $base)->sum('amount_ttc'),
            'total_ht'     => (float) (clone $base)->sum('amount_ht'),
            'count'        => (clone $base)->count(),
            'validated'    => (clone $base)->where('status', 'validated')->count(),
            'draft'        => (clone $base)->where('status', 'draft')->count(),
            'cancelled'    => (clone $base)->where('status', 'cancelled')->count(),
            'total_validated_ttc' => (float) (clone $base)->where('status', 'validated')->sum('amount_ttc'),
            'by_category'  => Expense::where('store_id', $storeId)
                ->whereDate('expense_date', '>=', $from)
                ->whereDate('expense_date', '<=', $to)
                ->where('status', 'validated')
                ->selectRaw('expense_category_id, SUM(amount_ttc) as total, COUNT(*) as count')
                ->groupBy('expense_category_id')
                ->with('category:id,name,color')
                ->get(),
            'period' => compact('from', 'to'),
        ]);
    }

    /** POST /expenses */
    public function store(Request $r)
    {
        $data = $r->validate([
            'expense_date'          => 'required|date',
            'expense_category_id'   => 'nullable|exists:expense_categories,id',
            'charge_account_id'     => 'required|exists:accounting_accounts,id',
            'treasury_account_id'   => 'required|exists:accounting_accounts,id',
            'description'           => 'required|string|max:255',
            'beneficiary'           => 'nullable|string|max:150',
            'amount_ht'             => 'required|numeric|min:0',
            'vat_rate'              => 'required|numeric|min:0|max:100',
            'payment_method'        => 'required|in:cash,wave,orange_money,free_money,card,virement,cheque',
            'notes'                 => 'nullable|string|max:1000',
            'validate_now'          => 'boolean',
        ]);

        $storeId   = $this->sid($r);
        $amountHt  = (float) $data['amount_ht'];
        $vatRate   = (float) $data['vat_rate'];
        $vatAmount = round($amountHt * $vatRate / 100, 2);
        $amountTtc = round($amountHt + $vatAmount, 2);

        // Vérifier ownership des comptes
        $this->assertAccountBelongsToStore($data['charge_account_id'], $storeId);
        $this->assertAccountBelongsToStore($data['treasury_account_id'], $storeId);

        return DB::transaction(function () use ($data, $storeId, $amountHt, $vatRate, $vatAmount, $amountTtc, $r) {
            $expense = Expense::create([
                'store_id'            => $storeId,
                'reference'           => Expense::nextReference($storeId),
                'expense_date'        => $data['expense_date'],
                'expense_category_id' => $data['expense_category_id'] ?? null,
                'charge_account_id'   => $data['charge_account_id'],
                'treasury_account_id' => $data['treasury_account_id'],
                'description'         => $data['description'],
                'beneficiary'         => $data['beneficiary'] ?? null,
                'amount_ht'           => $amountHt,
                'vat_rate'            => $vatRate,
                'vat_amount'          => $vatAmount,
                'amount_ttc'          => $amountTtc,
                'payment_method'      => $data['payment_method'],
                'user_id'             => $r->user()->id,
                'status'              => 'draft',
                'notes'               => $data['notes'] ?? null,
            ]);

            if (!empty($data['validate_now'])) {
                $this->createJournalEntry($expense, $r->user()->id);
            }

            return response()->json(
                $expense->load(['category', 'chargeAccount', 'treasuryAccount', 'user']),
                201
            );
        });
    }

    /** PUT /expenses/{expense} */
    public function update(Request $r, Expense $expense)
    {
        abort_if($expense->store_id !== $this->sid($r), 403);
        abort_if($expense->status !== 'draft', 422, 'Seules les dépenses en brouillon sont modifiables.');

        $data = $r->validate([
            'expense_date'          => 'sometimes|date',
            'expense_category_id'   => 'nullable|exists:expense_categories,id',
            'charge_account_id'     => 'sometimes|exists:accounting_accounts,id',
            'treasury_account_id'   => 'sometimes|exists:accounting_accounts,id',
            'description'           => 'sometimes|string|max:255',
            'beneficiary'           => 'nullable|string|max:150',
            'amount_ht'             => 'sometimes|numeric|min:0',
            'vat_rate'              => 'sometimes|numeric|min:0|max:100',
            'payment_method'        => 'sometimes|in:cash,wave,orange_money,free_money,card,virement,cheque',
            'notes'                 => 'nullable|string|max:1000',
        ]);

        $storeId = $this->sid($r);
        if (!empty($data['charge_account_id']))   $this->assertAccountBelongsToStore($data['charge_account_id'],   $storeId);
        if (!empty($data['treasury_account_id'])) $this->assertAccountBelongsToStore($data['treasury_account_id'], $storeId);

        // Recalculer si les montants changent
        $amountHt  = (float) ($data['amount_ht']  ?? $expense->amount_ht);
        $vatRate   = (float) ($data['vat_rate']   ?? $expense->vat_rate);
        $vatAmount = round($amountHt * $vatRate / 100, 2);
        $amountTtc = round($amountHt + $vatAmount, 2);

        $expense->update(array_merge($data, [
            'amount_ht'  => $amountHt,
            'vat_rate'   => $vatRate,
            'vat_amount' => $vatAmount,
            'amount_ttc' => $amountTtc,
        ]));

        return response()->json($expense->load(['category', 'chargeAccount', 'treasuryAccount', 'user']));
    }

    /** POST /expenses/{expense}/validate */
    public function validate(Request $r, Expense $expense)
    {
        abort_if($expense->store_id !== $this->sid($r), 403);
        abort_if($expense->status !== 'draft', 422, 'Cette dépense est déjà validée ou annulée.');
        abort_if(!$expense->charge_account_id,   422, 'Veuillez définir un compte de charge.');
        abort_if(!$expense->treasury_account_id, 422, 'Veuillez définir un compte de trésorerie.');

        return DB::transaction(function () use ($expense, $r) {
            $this->createJournalEntry($expense, $r->user()->id);
            return response()->json($expense->load(['category', 'chargeAccount', 'treasuryAccount', 'user', 'journalEntry']));
        });
    }

    /** POST /expenses/{expense}/cancel */
    public function cancel(Request $r, Expense $expense)
    {
        abort_if($expense->store_id !== $this->sid($r), 403);
        abort_if($expense->status === 'cancelled', 422, 'Cette dépense est déjà annulée.');

        $r->validate(['reason' => 'required|string|max:255']);

        return DB::transaction(function () use ($expense, $r) {
            // Si déjà validée : créer une écriture d'extourne
            if ($expense->status === 'validated' && $expense->journal_entry_id) {
                $this->createReversalEntry($expense, $r->user()->id, $r->reason);
            }

            $expense->update([
                'status'               => 'cancelled',
                'cancelled_by'         => $r->user()->id,
                'cancelled_at'         => now(),
                'cancellation_reason'  => $r->reason,
            ]);

            return response()->json($expense->load(['category', 'chargeAccount', 'treasuryAccount', 'user']));
        });
    }

    /** GET /expenses/{expense} */
    public function show(Request $r, Expense $expense)
    {
        abort_if($expense->store_id !== $this->sid($r), 403);
        return response()->json($expense->load(['category', 'chargeAccount', 'treasuryAccount', 'user', 'journalEntry.lines.account']));
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Génère l'écriture comptable SYSCOHADA pour une dépense :
     *
     *  [TVA déductible]
     *    Débit  charge_account   amount_ht
     *    Débit  44566 TVA déduc  vat_amount
     *    Crédit treasury_account amount_ttc
     *
     *  [Pas de TVA ou TVA non déductible]
     *    Débit  charge_account   amount_ttc
     *    Crédit treasury_account amount_ttc
     */
    private function createJournalEntry(Expense $expense, int $userId): void
    {
        $storeId  = $expense->store_id;
        $category = $expense->expense_category_id
            ? ExpenseCategory::find($expense->expense_category_id)
            : null;

        $isVatDeductible = $category?->is_vat_deductible ?? true;
        $hasVat          = $expense->vat_rate > 0 && $expense->vat_amount > 0;

        $entry = JournalEntry::create([
            'store_id'     => $storeId,
            'reference'    => $this->nextJournalRef($storeId),
            'entry_date'   => $expense->expense_date->toDateString(),
            'description'  => "Dépense {$expense->reference} — {$expense->description}",
            'type'         => 'charge',
            'source_id'    => $expense->id,
            'source_type'  => 'expense',
            'status'       => 'valide',
            'created_by'   => $userId,
            'validated_by' => $userId,
            'validated_at' => now(),
        ]);

        if ($hasVat && $isVatDeductible) {
            // Débit charge (HT)
            $entry->lines()->create([
                'account_id' => $expense->charge_account_id,
                'label'      => $expense->description . ($expense->beneficiary ? " — {$expense->beneficiary}" : ''),
                'debit'      => $expense->amount_ht,
                'credit'     => 0,
            ]);

            // Débit TVA déductible (44566)
            $vatAccount = AccountingAccount::where('store_id', $storeId)->where('code', '44566')->first();
            if ($vatAccount) {
                $entry->lines()->create([
                    'account_id' => $vatAccount->id,
                    'label'      => "TVA déductible — {$expense->reference}",
                    'debit'      => $expense->vat_amount,
                    'credit'     => 0,
                ]);
            }

            // Crédit trésorerie (TTC)
            $entry->lines()->create([
                'account_id' => $expense->treasury_account_id,
                'label'      => "Règlement {$expense->reference} — {$this->pmLabel($expense->payment_method)}",
                'debit'      => 0,
                'credit'     => $expense->amount_ttc,
            ]);
        } else {
            // Pas de TVA déductible : débit = TTC sur le compte de charge
            $entry->lines()->create([
                'account_id' => $expense->charge_account_id,
                'label'      => $expense->description . ($expense->beneficiary ? " — {$expense->beneficiary}" : ''),
                'debit'      => $expense->amount_ttc,
                'credit'     => 0,
            ]);
            $entry->lines()->create([
                'account_id' => $expense->treasury_account_id,
                'label'      => "Règlement {$expense->reference} — {$this->pmLabel($expense->payment_method)}",
                'debit'      => 0,
                'credit'     => $expense->amount_ttc,
            ]);
        }

        $expense->update([
            'status'           => 'validated',
            'journal_entry_id' => $entry->id,
        ]);
    }

    /** Écriture d'extourne pour annulation d'une dépense déjà validée. */
    private function createReversalEntry(Expense $expense, int $userId, string $reason): void
    {
        $original = JournalEntry::with('lines')->find($expense->journal_entry_id);
        if (!$original) return;

        $entry = JournalEntry::create([
            'store_id'     => $expense->store_id,
            'reference'    => $this->nextJournalRef($expense->store_id),
            'entry_date'   => now()->toDateString(),
            'description'  => "EXTOURNE — {$expense->reference} — {$reason}",
            'type'         => 'ajustement',
            'source_id'    => $expense->id,
            'source_type'  => 'expense_reversal',
            'status'       => 'valide',
            'created_by'   => $userId,
            'validated_by' => $userId,
            'validated_at' => now(),
        ]);

        // Inverser débit ↔ crédit
        foreach ($original->lines as $line) {
            $entry->lines()->create([
                'account_id' => $line->account_id,
                'label'      => "Extourne — {$line->label}",
                'debit'      => $line->credit,
                'credit'     => $line->debit,
            ]);
        }
    }

    private function assertAccountBelongsToStore(int $accountId, int $storeId): void
    {
        $acc = AccountingAccount::findOrFail($accountId);
        abort_if($acc->store_id !== $storeId, 403, 'Ce compte comptable n\'appartient pas à votre magasin.');
    }

    private function pmLabel(string $method): string
    {
        return match ($method) {
            'cash'         => 'Espèces',
            'wave'         => 'Wave',
            'orange_money' => 'Orange Money',
            'free_money'   => 'Free Money',
            'card'         => 'Carte bancaire',
            'virement'     => 'Virement bancaire',
            'cheque'       => 'Chèque',
            default        => $method,
        };
    }
}
