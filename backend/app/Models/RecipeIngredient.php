<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecipeIngredient extends Model
{
    protected $fillable = [
        'product_id', 'restaurant_item_id', 'ingredient_id',
        'unit_id', 'quantity', 'is_optional',
    ];

    protected $casts = [
        'quantity'    => 'float',
        'is_optional' => 'boolean',
    ];

    /** Le plat (restaurant_item) qui contient cette recette */
    public function restaurantItem(): BelongsTo { return $this->belongsTo(RestaurantItem::class); }

    /** Produit/ingrédient consommé */
    public function ingredient(): BelongsTo { return $this->belongsTo(Product::class, 'ingredient_id'); }

    /** Unité de mesure */
    public function unit(): BelongsTo { return $this->belongsTo(Unit::class); }
}
