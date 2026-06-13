<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'product_id', 'restaurant_item_id', 'station_id', 'qty', 'unit_price',
        'course', 'status', 'cover_number', 'options', 'notes',
        'sent_at', 'prepared_at', 'served_at',
    ];

    protected $casts = [
        'options' => 'array',
        'sent_at' => 'datetime',
        'prepared_at' => 'datetime',
        'served_at' => 'datetime',
    ];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function restaurantItem(): BelongsTo { return $this->belongsTo(RestaurantItem::class); }
}
