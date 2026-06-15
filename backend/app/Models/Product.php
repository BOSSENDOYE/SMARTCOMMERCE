<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id', 'internal_code', 'name', 'short_name', 'description',
        'category_id', 'brand_id', 'unit_id',
        'purchase_price_ht', 'sale_price_ttc', 'vat_rate',
        'is_weight_based', 'price_per_kg',
        'min_stock', 'max_stock', 'stock_appro', 'alert_stock',
        'packaging_qty', 'packaging_type', 'image',
        'is_active', 'track_expiry', 'is_recipe',
        'section_id', 'slot',
    ];

    protected $casts = [
        'purchase_price_ht' => 'decimal:2',
        'sale_price_ttc' => 'decimal:2',
        'vat_rate' => 'decimal:2',
        'min_stock'   => 'decimal:3',
        'max_stock'   => 'decimal:3',
        'stock_appro' => 'decimal:3',
        'alert_stock' => 'decimal:3',
        'is_weight_based' => 'boolean',
        'is_active' => 'boolean',
        'track_expiry' => 'boolean',
        'is_recipe' => 'boolean',
    ];

    public function store() { return $this->belongsTo(Store::class); }
    public function category() { return $this->belongsTo(Category::class); }
    public function section() { return $this->belongsTo(StoreSection::class); }
    public function brand() { return $this->belongsTo(Brand::class); }
    public function unit() { return $this->belongsTo(Unit::class); }
    public function barcodes() { return $this->hasMany(ProductBarcode::class); }
    public function priceHistory() { return $this->hasMany(ProductPriceHistory::class); }
    public function suppliers() { return $this->belongsToMany(Supplier::class, 'product_suppliers')->withPivot('supplier_ref', 'negotiated_price_ht', 'is_preferred'); }
    public function stockLevel() { return $this->hasOne(StockLevel::class); }
    public function stockMovements() { return $this->hasMany(StockMovement::class); }
    public function lots() { return $this->hasMany(ProductLot::class); }
    public function recipeIngredients() { return $this->hasMany(RecipeIngredient::class); }
    public function promotions() { return $this->belongsToMany(Promotion::class, 'promotion_products'); }
    public function containers() { return $this->hasMany(ProductContainer::class)->orderBy('sort_order'); }

    public function getSalePriceHtAttribute(): float
    {
        return round($this->sale_price_ttc / (1 + $this->vat_rate / 100), 2);
    }

    public function scopeActive($query) { return $query->where('is_active', true); }
    public function scopeForStore($query, $storeId) { return $query->where('store_id', $storeId)->orWhereNull('store_id'); }
    public function scopeByBarcode($query, string $barcode)
    {
        return $query->whereHas('barcodes', fn($q) => $q->where('barcode', $barcode));
    }

    public function getStockQty(?int $storeId = null): float
    {
        return $this->stockLevel?->qty_on_hand ?? 0;
    }
}
