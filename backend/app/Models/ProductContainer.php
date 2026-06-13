<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductContainer extends Model
{
    protected $fillable = [
        'product_id', 'unit_id', 'label', 'conversion_factor',
        'is_purchase_unit', 'is_sale_unit', 'is_stock_unit',
        'price_a', 'price_b', 'price_c', 'barcode', 'sort_order',
    ];

    protected $casts = [
        'conversion_factor' => 'decimal:4',
        'price_a'           => 'decimal:2',
        'price_b'           => 'decimal:2',
        'price_c'           => 'decimal:2',
        'is_purchase_unit'  => 'boolean',
        'is_sale_unit'      => 'boolean',
        'is_stock_unit'     => 'boolean',
    ];

    public function product() { return $this->belongsTo(Product::class); }
    public function unit()    { return $this->belongsTo(Unit::class); }
}
