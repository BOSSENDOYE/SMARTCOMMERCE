<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Promotion extends Model
{
    protected $fillable = [
        'store_id', 'name', 'type', 'value', 'min_amount',
        'buy_qty', 'get_qty', 'tiers',
        'happy_hour_start', 'happy_hour_end',
        'stackable', 'applies_to_all', 'loyalty_only',
        'starts_at', 'ends_at', 'is_active',
    ];

    protected $casts = [
        'is_active'      => 'boolean',
        'stackable'      => 'boolean',
        'applies_to_all' => 'boolean',
        'loyalty_only'   => 'boolean',
        'starts_at'      => 'datetime',
        'ends_at'        => 'datetime',
        'value'          => 'decimal:2',
        'min_amount'     => 'decimal:2',
        'tiers'          => 'array',
    ];

    public function products(): BelongsToMany { return $this->belongsToMany(Product::class, 'promotion_products'); }
    public function categories(): BelongsToMany { return $this->belongsToMany(Category::class, 'promotion_categories'); }
}
