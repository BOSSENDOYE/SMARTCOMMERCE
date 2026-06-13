<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RestaurantItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id', 'name', 'description', 'station_id',
        'course', 'price_ht', 'vat_rate', 'price_ttc', 'cost_price',
        'preparation_time_minutes', 'image', 'is_available', 'is_active',
        'sort_order', 'notes',
    ];

    protected $casts = [
        'price_ht'   => 'float',
        'vat_rate'   => 'float',
        'price_ttc'  => 'float',
        'cost_price' => 'float',
        'is_available' => 'boolean',
        'is_active'    => 'boolean',
    ];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function station(): BelongsTo { return $this->belongsTo(ProductionStation::class); }
    public function recipeIngredients(): HasMany { return $this->hasMany(RecipeIngredient::class); }
    public function orderItems(): HasMany { return $this->hasMany(OrderItem::class); }
}
