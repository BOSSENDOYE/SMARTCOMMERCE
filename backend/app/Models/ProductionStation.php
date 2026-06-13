<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionStation extends Model
{
    protected $fillable = [
        'store_id', 'name', 'type', 'uses_kds',
        'prints_tickets', 'alert_time_minutes', 'is_active',
    ];

    protected $casts = [
        'uses_kds'       => 'boolean',
        'prints_tickets' => 'boolean',
        'is_active'      => 'boolean',
    ];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function restaurantItems(): HasMany { return $this->hasMany(RestaurantItem::class, 'station_id'); }
    public function orderItems(): HasMany { return $this->hasMany(OrderItem::class, 'station_id'); }
}
