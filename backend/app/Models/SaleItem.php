<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    protected $fillable = [
        'sale_id', 'product_id', 'qty', 'unit_price_ttc',
        'unit_price_ht', 'vat_rate', 'discount_pct',
        'discount_amount', 'total_ttc', 'total_ht', 'margin_amount',
    ];

    protected $casts = ['qty' => 'decimal:3'];

    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
