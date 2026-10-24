<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UnsoldReportLine extends Model
{
    protected $fillable = [
        'unsold_report_id', 'product_id', 'qty', 'destination',
        'unit_cost', 'total_cost', 'target_product_id', 'target_qty',
    ];

    protected $casts = [
        'qty'        => 'float',
        'unit_cost'  => 'float',
        'total_cost' => 'float',
        'target_qty' => 'float',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function targetProduct(): BelongsTo { return $this->belongsTo(Product::class, 'target_product_id'); }
}
