<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPayment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'invoice_id', 'user_id', 'amount',
        'payment_method', 'reference', 'notes', 'paid_at',
    ];

    protected $casts = [
        'amount'   => 'decimal:2',
        'paid_at'  => 'datetime',
    ];

    public function invoice(): BelongsTo { return $this->belongsTo(SupplierInvoice::class, 'invoice_id'); }
    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
}
