<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionOrderLine extends Model
{
    protected $fillable = ['production_order_id', 'ingredient_id', 'qty', 'unit_cost', 'total_cost'];

    protected $casts = [
        'qty'        => 'float',
        'unit_cost'  => 'float',
        'total_cost' => 'float',
    ];

    public function productionOrder(): BelongsTo { return $this->belongsTo(ProductionOrder::class); }
    public function ingredient(): BelongsTo { return $this->belongsTo(Product::class, 'ingredient_id'); }
}
