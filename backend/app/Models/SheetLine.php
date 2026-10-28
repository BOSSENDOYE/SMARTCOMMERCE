<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SheetLine extends Model
{
    protected $fillable = [
        'sheet_shift_id', 'product_id', 'unit_price', 'opening_qty', 'added_qty',
        'pos_sold_qty', 'other_qty', 'expected_qty', 'remaining_qty', 'gap_qty',
    ];

    protected $casts = [
        'unit_price'    => 'float',
        'opening_qty'   => 'float',
        'added_qty'     => 'float',
        'pos_sold_qty'  => 'float',
        'other_qty'     => 'float',
        'expected_qty'  => 'float',
        'remaining_qty' => 'float',
        'gap_qty'       => 'float',
    ];

    public function shift(): BelongsTo { return $this->belongsTo(SheetShift::class, 'sheet_shift_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
