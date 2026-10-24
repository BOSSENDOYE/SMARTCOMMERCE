<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourierPayment extends Model
{
    protected $fillable = ['store_id', 'courier_id', 'courier_round_id', 'user_id', 'cash_session_id', 'payment_method', 'amount', 'kind'];

    protected $casts = ['amount' => 'float'];

    public function courier(): BelongsTo { return $this->belongsTo(Courier::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
