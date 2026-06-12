<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'store_id', 'supplier_id', 'reference', 'status',
        'generation_type', 'expected_date', 'total_ht', 'total_ttc',
        'notes', 'user_id',
    ];

    protected $casts = ['expected_date' => 'date'];

    public function supplier(): BelongsTo   { return $this->belongsTo(Supplier::class); }
    public function items(): HasMany        { return $this->hasMany(PurchaseOrderItem::class); }
    public function creator(): BelongsTo   { return $this->belongsTo(User::class, 'user_id'); }
    public function receptions(): HasMany  { return $this->hasMany(PurchaseReception::class); }
}
