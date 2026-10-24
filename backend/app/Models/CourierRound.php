<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CourierRound extends Model
{
    protected $fillable = [
        'store_id', 'courier_id', 'reference', 'round_date', 'status',
        'amount_due', 'amount_paid', 'sale_id', 'settled_by', 'settled_at', 'notes',
    ];

    protected $casts = [
        'round_date'  => 'date',
        'settled_at'  => 'datetime',
        'amount_due'  => 'float',
        'amount_paid' => 'float',
    ];

    public function courier(): BelongsTo { return $this->belongsTo(Courier::class); }
    public function items(): HasMany { return $this->hasMany(CourierRoundItem::class); }
    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
    public function settler(): BelongsTo { return $this->belongsTo(User::class, 'settled_by'); }
}
