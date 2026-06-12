<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockLevel extends Model
{
    public $timestamps = false;

    protected $fillable = ['store_id', 'product_id', 'qty_on_hand', 'qty_reserved', 'qty_on_order', 'avg_cost', 'last_updated'];

    protected $casts = [
        'qty_on_hand' => 'decimal:3',
        'avg_cost' => 'decimal:4',
        'last_updated' => 'datetime',
    ];

    public function store() { return $this->belongsTo(Store::class); }
    public function product() { return $this->belongsTo(Product::class); }
}
