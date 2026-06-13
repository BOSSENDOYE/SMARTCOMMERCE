<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExpenseCategory extends Model
{
    protected $fillable = [
        'store_id',
        'name',
        'default_account_code',
        'default_charge_account_id',
        'is_vat_deductible',
        'color',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'is_vat_deductible' => 'boolean',
        'is_active'         => 'boolean',
    ];

    public function store(): BelongsTo           { return $this->belongsTo(Store::class); }
    public function defaultChargeAccount(): BelongsTo { return $this->belongsTo(AccountingAccount::class, 'default_charge_account_id'); }
    public function expenses(): HasMany          { return $this->hasMany(Expense::class); }
}
