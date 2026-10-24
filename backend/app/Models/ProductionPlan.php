<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionPlan extends Model
{
    protected $fillable = ['store_id', 'product_id', 'user_id', 'plan_date', 'planned_batches', 'production_order_id'];

    protected $casts = [
        'plan_date'       => 'date',
        'planned_batches' => 'float',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function productionOrder(): BelongsTo { return $this->belongsTo(ProductionOrder::class); }
}
