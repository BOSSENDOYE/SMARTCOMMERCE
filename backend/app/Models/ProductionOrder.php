<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionOrder extends Model
{
    protected $fillable = [
        'store_id', 'product_id', 'user_id', 'reference',
        'batches', 'qty_produced', 'qty_allocated', 'unit_cost', 'total_cost',
        'status', 'notes', 'produced_at', 'cancelled_by', 'cancelled_at',
    ];

    protected $casts = [
        'batches'      => 'float',
        'qty_produced' => 'float',
        'qty_allocated' => 'float',
        'unit_cost'    => 'float',
        'total_cost'   => 'float',
        'produced_at'  => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function canceller(): BelongsTo { return $this->belongsTo(User::class, 'cancelled_by'); }
    public function lines(): HasMany { return $this->hasMany(ProductionOrderLine::class); }
    public function distributions(): HasMany { return $this->hasMany(DistributionMovement::class); }

    protected $appends = ['qty_pending'];

    /** Quantité produite pas encore répartie (point de vente / livreurs). */
    public function getQtyPendingAttribute(): float
    {
        return $this->status === 'completed' ? round(max(0, $this->qty_produced - $this->qty_allocated), 3) : 0;
    }
}
