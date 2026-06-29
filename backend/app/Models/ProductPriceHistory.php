<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPriceHistory extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'product_id', 'user_id',
        'old_price_ttc', 'new_price_ttc',
        'old_purchase_price', 'new_purchase_price',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
