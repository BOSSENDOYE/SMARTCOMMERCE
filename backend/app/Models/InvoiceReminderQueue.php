<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceReminderQueue extends Model
{
    protected $table = 'invoice_reminder_queue';

    protected $fillable = [
        'store_id', 'invoice_id', 'rule_id', 'channel',
        'phone', 'email', 'client_name', 'message', 'scheduled_date',
        'sent_at', 'sent_by', 'status',
    ];

    protected $casts = [
        'scheduled_date' => 'date',
        'sent_at'        => 'datetime',
    ];

    public function store(): BelongsTo   { return $this->belongsTo(Store::class); }
    public function invoice(): BelongsTo { return $this->belongsTo(Invoice::class); }
    public function rule(): BelongsTo    { return $this->belongsTo(InvoiceReminderRule::class, 'rule_id'); }
    public function sentBy(): BelongsTo  { return $this->belongsTo(User::class, 'sent_by'); }
}
