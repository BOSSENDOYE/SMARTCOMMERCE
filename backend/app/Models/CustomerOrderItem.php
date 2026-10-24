<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerOrderItem extends Model
{
    protected $fillable = ['customer_order_id', 'product_id', 'qty', 'unit_price_ttc', 'total_ttc', 'details'];

    protected $casts = [
        'qty'            => 'float',
        'unit_price_ttc' => 'float',
        'total_ttc'      => 'float',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
