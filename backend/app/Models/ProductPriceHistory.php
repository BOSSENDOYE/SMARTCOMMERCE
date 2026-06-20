<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPriceHistory extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'product_id', 'old_price', 'new_price', 'type', 'changed_by',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class, 'changed_by'); }
}
