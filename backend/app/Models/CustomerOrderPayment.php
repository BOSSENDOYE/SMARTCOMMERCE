<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerOrderPayment extends Model
{
    protected $fillable = ['customer_order_id', 'user_id', 'cash_session_id', 'payment_method', 'amount', 'reference', 'paid_at'];

    protected $casts = [
        'amount'  => 'float',
        'paid_at' => 'datetime',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
