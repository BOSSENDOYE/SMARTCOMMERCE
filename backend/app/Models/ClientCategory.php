<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClientCategory extends Model
{
    protected $fillable = [
        'store_id', 'name', 'code', 'color', 'sort_order', 'is_pos_default', 'is_active',
    ];

    protected $casts = [
        'is_pos_default' => 'boolean',
        'is_active'      => 'boolean',
    ];

    public function clients() { return $this->hasMany(Client::class); }
    public function priceTiers() { return $this->hasMany(ProductPriceTier::class); }
}
