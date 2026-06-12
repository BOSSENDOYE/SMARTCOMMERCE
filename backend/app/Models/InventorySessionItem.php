<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventorySessionItem extends Model
{
    protected $fillable = [
        'session_id', 'product_id', 'counted_by',
        'theoretical_qty', 'counted_qty',
        'unit_cost', 'variance_value', 'counted_at',
    ];

    protected $casts = [
        'theoretical_qty' => 'decimal:3',
        'counted_qty'     => 'decimal:3',
        'unit_cost'       => 'decimal:2',
        'variance_value'  => 'decimal:2',
        'counted_at'      => 'datetime',
    ];

    public function session(): BelongsTo { return $this->belongsTo(InventorySession::class, 'session_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function countedBy(): BelongsTo { return $this->belongsTo(User::class, 'counted_by'); }
}
