<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BudgetLine extends Model
{
    protected $fillable = [
        'budget_id', 'account_id', 'month', 'quarter', 'amount',
    ];

    protected $casts = [
        'amount'  => 'decimal:2',
        'month'   => 'integer',
        'quarter' => 'integer',
    ];

    public function budget(): BelongsTo  { return $this->belongsTo(Budget::class); }
    public function account(): BelongsTo { return $this->belongsTo(AccountingAccount::class, 'account_id'); }
}
