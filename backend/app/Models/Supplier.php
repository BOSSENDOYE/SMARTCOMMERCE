<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Supplier extends Model
{
    protected $fillable = [
        'store_id', 'company_name', 'ninea', 'rc', 'address',
        'phone', 'email', 'contact_name', 'payment_terms',
        'delivery_days_avg', 'notes', 'is_active', 'balance_due',
    ];

    protected $casts = ['is_active' => 'boolean'];

    public function products(): BelongsToMany { return $this->belongsToMany(Product::class, 'product_suppliers'); }
    public function purchaseOrders(): HasMany { return $this->hasMany(PurchaseOrder::class); }
    public function invoices(): HasMany { return $this->hasMany(SupplierInvoice::class); }
}
