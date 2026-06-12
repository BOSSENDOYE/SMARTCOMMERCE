<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReceptionItem extends Model
{
    protected $fillable = [
        'reception_id', 'product_id',
        'qty_ordered', 'qty_received', 'qty_rejected',
        'unit_price_ht', 'lot_number', 'manufacture_date', 'expiry_date',
    ];

    protected $casts = [
        'manufacture_date' => 'date',
        'expiry_date'      => 'date',
        'qty_ordered'      => 'decimal:3',
        'qty_received'     => 'decimal:3',
        'qty_rejected'     => 'decimal:3',
        'unit_price_ht'    => 'decimal:2',
    ];

    public function reception(): BelongsTo { return $this->belongsTo(PurchaseReception::class, 'reception_id'); }
    public function product(): BelongsTo   { return $this->belongsTo(Product::class); }
}
