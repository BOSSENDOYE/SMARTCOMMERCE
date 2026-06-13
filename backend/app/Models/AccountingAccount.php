<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingAccount extends Model
{
    protected $fillable = [
        'store_id', 'code', 'name', 'class', 'nature', 'is_system', 'is_active',
    ];

    protected $casts = [
        'is_system' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function store(): BelongsTo   { return $this->belongsTo(Store::class); }
    public function lines(): HasMany     { return $this->hasMany(JournalEntryLine::class, 'account_id'); }

    /** Totaux débit / crédit / solde sur toutes les écritures validées. */
    public function totals(): array
    {
        $debit  = $this->lines()->whereHas('journalEntry', fn($q) => $q->where('status', 'valide'))->sum('debit');
        $credit = $this->lines()->whereHas('journalEntry', fn($q) => $q->where('status', 'valide'))->sum('credit');
        return [
            'debit'   => (float) $debit,
            'credit'  => (float) $credit,
            'solde'   => (float) ($debit - $credit),
        ];
    }
}
