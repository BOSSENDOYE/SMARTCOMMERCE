<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductPriceTier extends Model
{
    protected $fillable = ['product_id', 'client_category_id', 'price'];

    protected $casts = ['price' => 'decimal:2'];

    public function product() { return $this->belongsTo(Product::class); }
    public function clientCategory() { return $this->belongsTo(ClientCategory::class); }
}
