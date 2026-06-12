<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    public $timestamps = false;
    const UPDATED_AT = null;

    protected $fillable = [
        'store_id', 'product_id', 'lot_id', 'user_id', 'type',
        'qty', 'unit_cost', 'stock_after',
        'reference_type', 'reference_id', 'reason', 'notes',
    ];

    protected $casts = [
        'qty' => 'decimal:3',
        'unit_cost' => 'decimal:4',
        'stock_after' => 'decimal:3',
        'created_at' => 'datetime',
    ];

    public static function boot()
    {
        parent::boot();
        static::updating(fn() => false);
        static::deleting(fn() => false);
    }

    public function store() { return $this->belongsTo(Store::class); }
    public function product() { return $this->belongsTo(Product::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function lot() { return $this->belongsTo(ProductLot::class); }
}
