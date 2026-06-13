<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JournalEntry extends Model
{
    protected $fillable = [
        'store_id', 'reference', 'entry_date', 'description', 'type',
        'source_id', 'source_type', 'status', 'created_by', 'validated_by', 'validated_at',
    ];

    protected $casts = [
        'entry_date'   => 'date',
        'validated_at' => 'datetime',
    ];

    public function lines(): HasMany          { return $this->hasMany(JournalEntryLine::class); }
    public function createdBy(): BelongsTo    { return $this->belongsTo(User::class, 'created_by'); }
    public function validatedBy(): BelongsTo  { return $this->belongsTo(User::class, 'validated_by'); }
    public function store(): BelongsTo        { return $this->belongsTo(Store::class); }

    /** Vérifie que l'écriture est équilibrée (Σ débit == Σ crédit). */
    public function isBalanced(): bool
    {
        $debit  = $this->lines->sum('debit');
        $credit = $this->lines->sum('credit');
        return abs($debit - $credit) < 0.01;
    }
}
