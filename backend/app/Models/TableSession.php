<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TableSession extends Model
{
    protected $fillable = [
        'table_id', 'store_id', 'status', 'opened_by',
        'closed_by', 'opened_at', 'closed_at', 'covers',
    ];

    protected $casts = ['opened_at' => 'datetime', 'closed_at' => 'datetime'];

    public function table(): BelongsTo { return $this->belongsTo(Table::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function activeOrder(): HasOne { return $this->hasOne(Order::class)->whereNotIn('status', ['cancelled', 'served']); }
}
