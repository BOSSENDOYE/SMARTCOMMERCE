<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class AccountReconciliation extends Model
{
    protected $fillable = [
        'store_id', 'account_id', 'lettered_by', 'reference',
        'lettered_at', 'amount_debit', 'amount_credit', 'difference', 'notes',
    ];

    protected $casts = [
        'lettered_at'   => 'datetime',
        'amount_debit'  => 'decimal:2',
        'amount_credit' => 'decimal:2',
        'difference'    => 'decimal:2',
    ];

    public function store(): BelongsTo      { return $this->belongsTo(Store::class); }
    public function account(): BelongsTo    { return $this->belongsTo(AccountingAccount::class, 'account_id'); }
    public function letteredBy(): BelongsTo { return $this->belongsTo(User::class, 'lettered_by'); }
    public function lines(): HasMany        { return $this->hasMany(JournalEntryLine::class, 'reconciliation_id'); }

    public static function generateReference(int $storeId): string
    {
        $year   = now()->year;
        $prefix = "LTR-{$year}-";
        $len    = strlen($prefix);
        $pos    = $len + 1;

        $maxNum = DB::selectOne(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(reference, {$pos}) AS INTEGER)), 0) AS n
             FROM account_reconciliations
             WHERE reference LIKE ?",
            [$prefix . '%']
        )->n ?? 0;

        return $prefix . str_pad((int) $maxNum + 1, 6, '0', STR_PAD_LEFT);
    }
}
