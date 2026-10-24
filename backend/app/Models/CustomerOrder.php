<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerOrder extends Model
{
    protected $fillable = [
        'store_id', 'client_id', 'user_id', 'reference',
        'customer_name', 'customer_phone', 'pickup_at', 'status',
        'total_ttc', 'paid_amount', 'notes', 'sale_id',
        'delivered_at', 'cancelled_at', 'cancellation_reason',
    ];

    protected $casts = [
        'pickup_at'    => 'datetime',
        'delivered_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'total_ttc'    => 'float',
        'paid_amount'  => 'float',
    ];

    protected $appends = ['balance'];

    public function getBalanceAttribute(): float
    {
        return round(max(0, $this->total_ttc - $this->paid_amount), 2);
    }

    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
    public function items(): HasMany { return $this->hasMany(CustomerOrderItem::class); }
    public function payments(): HasMany { return $this->hasMany(CustomerOrderPayment::class); }
}
