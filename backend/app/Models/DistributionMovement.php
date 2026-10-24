<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionMovement extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'store_id', 'product_id', 'production_order_id', 'source', 'source_round_id',
        'destination', 'destination_round_id', 'qty', 'user_id', 'created_at',
    ];

    protected $casts = [
        'qty'        => 'float',
        'created_at' => 'datetime',
    ];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function productionOrder(): BelongsTo { return $this->belongsTo(ProductionOrder::class); }
    public function sourceRound(): BelongsTo { return $this->belongsTo(CourierRound::class, 'source_round_id'); }
    public function destinationRound(): BelongsTo { return $this->belongsTo(CourierRound::class, 'destination_round_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
