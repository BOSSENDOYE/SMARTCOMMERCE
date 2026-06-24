<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyTransaction extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'client_id', 'sale_id', 'type',
        'points', 'balance_after', 'notes',
    ];

    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
}
