<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventorySessionItem extends Model
{
    protected $fillable = [
        'session_id', 'sheet_id', 'product_id', 'counted_by',
        'theoretical_qty', 'counted_qty',
        'unit_cost', 'variance_value', 'counted_at',
        'new_expiry_date', 'new_sale_price', 'new_purchase_price',
    ];

    protected $casts = [
        'theoretical_qty'   => 'decimal:3',
        'counted_qty'       => 'decimal:3',
        'unit_cost'         => 'decimal:2',
        'variance_value'    => 'decimal:2',
        'counted_at'        => 'datetime',
        'new_expiry_date'   => 'date',
        'new_sale_price'    => 'decimal:2',
        'new_purchase_price'=> 'decimal:2',
    ];

    public function session(): BelongsTo   { return $this->belongsTo(InventorySession::class, 'session_id'); }
    public function sheet(): BelongsTo     { return $this->belongsTo(InventorySheet::class, 'sheet_id'); }
    public function product(): BelongsTo   { return $this->belongsTo(Product::class); }
    public function countedBy(): BelongsTo { return $this->belongsTo(User::class, 'counted_by'); }
}
