<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlatformInvoice extends Model
{
    protected $fillable = [
        'organization_id', 'subscription_id', 'invoice_number',
        'amount', 'currency', 'status',
        'issued_at', 'due_at', 'paid_at', 'pdf_path', 'notes',
    ];

    protected $casts = [
        'amount'    => 'integer',
        'issued_at' => 'datetime',
        'due_at'    => 'datetime',
        'paid_at'   => 'datetime',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    public static function generateNumber(): string
    {
        $year = now()->format('Y');
        $last = static::whereYear('created_at', $year)->count() + 1;
        return "INV-{$year}-" . str_pad($last, 5, '0', STR_PAD_LEFT);
    }
}
