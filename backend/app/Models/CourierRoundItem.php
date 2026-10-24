<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourierRoundItem extends Model
{
    protected $fillable = ['courier_round_id', 'product_id', 'qty_given', 'qty_returned', 'unit_price', 'unit_cost'];

    protected $casts = [
        'qty_given'    => 'float',
        'qty_returned' => 'float',
        'unit_price'   => 'float',
        'unit_cost'    => 'float',
    ];

    public function round(): BelongsTo { return $this->belongsTo(CourierRound::class, 'courier_round_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
