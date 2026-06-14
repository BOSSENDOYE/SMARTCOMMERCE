<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceReminder extends Model
{
    protected $fillable = [
        'invoice_id', 'type', 'method', 'sent_at', 'notes', 'sent_by',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
    ];

    public function invoice(): BelongsTo { return $this->belongsTo(Invoice::class); }
    public function sentBy(): BelongsTo  { return $this->belongsTo(User::class, 'sent_by'); }
}
