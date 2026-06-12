<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Loss extends Model
{
    protected $fillable = [
        'store_id', 'product_id', 'lot_id', 'user_id', 'validator_id',
        'reference', 'type', 'qty', 'unit_cost',
        'notes', 'photo', 'status', 'validated_at',
    ];

    // total_cost is a stored generated column (qty * unit_cost), not fillable

    protected $casts = [
        'qty' => 'decimal:3',
        'unit_cost' => 'decimal:2',
        'validated_at' => 'datetime',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function validator(): BelongsTo { return $this->belongsTo(User::class, 'validator_id'); }
}
