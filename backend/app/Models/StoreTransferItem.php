<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreTransferItem extends Model
{
    protected $fillable = [
        'store_transfer_id', 'product_id',
        'qty_requested', 'qty_approved', 'qty_shipped', 'qty_received',
        'unit_cost', 'notes',
    ];

    protected $casts = [
        'qty_requested' => 'decimal:3',
        'qty_approved'  => 'decimal:3',
        'qty_shipped'   => 'decimal:3',
        'qty_received'  => 'decimal:3',
        'unit_cost'     => 'decimal:2',
    ];

    public function transfer(): BelongsTo { return $this->belongsTo(StoreTransfer::class, 'store_transfer_id'); }
    public function product(): BelongsTo  { return $this->belongsTo(Product::class); }
}
