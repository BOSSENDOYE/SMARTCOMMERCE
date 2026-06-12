<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleTicket extends Model
{
    protected $fillable = [
        'sale_id', 'type', 'number', 'qr_code', 'print_count',
        'is_emailed', 'is_whatsapp_sent',
    ];

    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
}
