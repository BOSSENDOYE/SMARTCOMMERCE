<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Loss extends Model
{
    protected $fillable = [
        'store_id', 'product_id', 'qty', 'unit_cost', 'type',
        'reason', 'user_id', 'status', 'validated_by',
    ];

    protected $casts = ['qty' => 'decimal:3', 'unit_cost' => 'decimal:2'];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
