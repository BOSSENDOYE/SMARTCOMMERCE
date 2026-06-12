<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierInvoice extends Model
{
    protected $fillable = [
        'supplier_id', 'store_id', 'reception_id',
        'reference', 'amount_ht', 'vat_amount', 'amount_ttc',
        'amount_paid', 'payment_status', 'invoice_date', 'due_date',
    ];

    protected $casts = [
        'invoice_date'   => 'date',
        'due_date'       => 'date',
        'amount_ht'      => 'decimal:2',
        'vat_amount'     => 'decimal:2',
        'amount_ttc'     => 'decimal:2',
        'amount_paid'    => 'decimal:2',
        'balance_due'    => 'decimal:2',
    ];

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function payments(): HasMany   { return $this->hasMany(SupplierPayment::class, 'invoice_id'); }
}
