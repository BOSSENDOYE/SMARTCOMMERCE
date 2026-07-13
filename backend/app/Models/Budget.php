<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Budget extends Model
{
    protected $fillable = [
        'store_id', 'created_by', 'name', 'year', 'period_type', 'status', 'notes',
    ];

    protected $casts = [
        'year' => 'integer',
    ];

    public function store(): BelongsTo     { return $this->belongsTo(Store::class); }
    public function createdBy(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function lines(): HasMany       { return $this->hasMany(BudgetLine::class)->with('account'); }
}
