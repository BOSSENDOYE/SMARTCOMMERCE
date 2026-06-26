<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalePayment extends Model
{
    protected $fillable = [
        'sale_id', 'payment_method', 'amount', 'reference', 'voucher_code',
        'is_confirmed', 'paid_at', 'notes', 'recorded_by',
    ];

    protected $casts = [
        'paid_at'      => 'datetime',
        'is_confirmed' => 'boolean',
        'amount'       => 'decimal:2',
    ];

    public function sale(): BelongsTo       { return $this->belongsTo(Sale::class); }
    public function recordedBy(): BelongsTo { return $this->belongsTo(User::class, 'recorded_by'); }
}
