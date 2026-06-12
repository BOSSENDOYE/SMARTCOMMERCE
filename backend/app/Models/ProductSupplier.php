<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSupplier extends Model
{
    protected $table = 'product_suppliers';

    protected $fillable = [
        'product_id', 'supplier_id',
        'supplier_ref', 'negotiated_price_ht', 'is_preferred',
    ];

    protected $casts = [
        'negotiated_price_ht' => 'decimal:2',
        'is_preferred'        => 'boolean',
    ];

    public function product(): BelongsTo  { return $this->belongsTo(Product::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
}
