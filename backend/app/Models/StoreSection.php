<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StoreSection extends Model
{
    protected $fillable = ['store_id', 'name', 'code', 'color', 'icon', 'sort_order'];

    protected $casts = ['sort_order' => 'integer'];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'section_id');
    }
}
