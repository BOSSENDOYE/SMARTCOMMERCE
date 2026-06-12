<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseReception extends Model
{
    protected $fillable = [
        'purchase_order_id', 'store_id', 'user_id',
        'reference', 'supplier_delivery_ref', 'status',
        'notes', 'received_at',
    ];

    protected $casts = ['received_at' => 'datetime'];

    public function order(): BelongsTo    { return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id'); }
    public function items(): HasMany      { return $this->hasMany(PurchaseReceptionItem::class, 'reception_id'); }
    public function receiver(): BelongsTo { return $this->belongsTo(User::class, 'user_id'); }
}
