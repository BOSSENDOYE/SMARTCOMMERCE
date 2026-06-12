<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Promotion extends Model
{
    protected $fillable = [
        'store_id', 'name', 'type', 'value', 'min_qty', 'min_amount',
        'starts_at', 'ends_at', 'happy_hour_start', 'happy_hour_end',
        'applies_to', 'is_active', 'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'value' => 'decimal:2',
    ];

    public function products(): BelongsToMany { return $this->belongsToMany(Product::class, 'promotion_products'); }
    public function categories(): BelongsToMany { return $this->belongsToMany(Category::class, 'promotion_categories'); }
}
