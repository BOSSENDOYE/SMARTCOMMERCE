<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Expense extends Model
{
    protected $fillable = [
        'store_id',
        'reference',
        'expense_date',
        'expense_category_id',
        'charge_account_id',
        'treasury_account_id',
        'description',
        'beneficiary',
        'amount_ht',
        'vat_rate',
        'vat_amount',
        'amount_ttc',
        'payment_method',
        'user_id',
        'journal_entry_id',
        'status',
        'notes',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount_ht'    => 'decimal:2',
        'vat_rate'     => 'decimal:2',
        'vat_amount'   => 'decimal:2',
        'amount_ttc'   => 'decimal:2',
        'cancelled_at' => 'datetime',
    ];

    public function store(): BelongsTo          { return $this->belongsTo(Store::class); }
    public function category(): BelongsTo       { return $this->belongsTo(ExpenseCategory::class, 'expense_category_id'); }
    public function chargeAccount(): BelongsTo  { return $this->belongsTo(AccountingAccount::class, 'charge_account_id'); }
    public function treasuryAccount(): BelongsTo{ return $this->belongsTo(AccountingAccount::class, 'treasury_account_id'); }
    public function user(): BelongsTo           { return $this->belongsTo(User::class, 'user_id'); }
    public function cancelledBy(): BelongsTo    { return $this->belongsTo(User::class, 'cancelled_by'); }
    public function journalEntry(): BelongsTo   { return $this->belongsTo(JournalEntry::class); }

    /** Génère la référence auto EXP-YYYYMM-XXXX pour un magasin donné. */
    public static function nextReference(int $storeId): string
    {
        $base = 'EXP-' . now()->format('Ym') . '-';
        $last = static::where('store_id', $storeId)
            ->where('reference', 'like', "{$base}%")
            ->orderByDesc('reference')
            ->value('reference');

        $seq = $last ? ((int) substr($last, strlen($base))) + 1 : 1;
        return $base . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}
