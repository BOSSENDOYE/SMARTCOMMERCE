<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryItem extends Model
{
    protected $fillable = [
        'delivery_id', 'product_id', 'description',
        'quantity', 'unit', 'unit_cost', 'sort_order', 'stock_moved',
    ];

    protected $casts = [
        'quantity'   => 'decimal:3',
        'unit_cost'  => 'decimal:4',
        'stock_moved' => 'boolean',
    ];

    public function delivery(): BelongsTo { return $this->belongsTo(Delivery::class); }
    public function product(): BelongsTo  { return $this->belongsTo(Product::class); }
}
