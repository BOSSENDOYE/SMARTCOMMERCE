<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id', 'product_id', 'description', 'quantity', 'unit',
        'unit_price', 'discount_percent', 'vat_rate',
        'total_ht', 'total_ttc', 'sort_order',
    ];

    protected $casts = [
        'quantity'         => 'decimal:3',
        'unit_price'       => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'vat_rate'         => 'decimal:2',
        'total_ht'         => 'decimal:2',
        'total_ttc'        => 'decimal:2',
    ];

    public function invoice(): BelongsTo { return $this->belongsTo(Invoice::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    /** Recalcule total_ht et total_ttc */
    public function recalculate(): void
    {
        $base  = (float) $this->quantity * (float) $this->unit_price;
        $after = $base * (1 - (float) $this->discount_percent / 100);
        $ttc   = $after * (1 + (float) $this->vat_rate / 100);

        $this->total_ht  = round($after, 2);
        $this->total_ttc = round($ttc, 2);
    }
}
