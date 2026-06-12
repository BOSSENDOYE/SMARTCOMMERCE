<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreTransferItem extends Model
{
    protected $fillable = [
        'store_transfer_id', 'product_id', 'qty_requested',
        'qty_sent', 'qty_received', 'unit_cost',
    ];

    public function transfer(): BelongsTo { return $this->belongsTo(StoreTransfer::class, 'store_transfer_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
