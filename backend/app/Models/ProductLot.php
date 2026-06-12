<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductLot extends Model
{
    protected $fillable = [
        'product_id', 'store_id', 'lot_number', 'expiry_date',
        'qty', 'purchase_price_ht',
    ];

    protected $casts = ['expiry_date' => 'date', 'qty' => 'decimal:3'];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
