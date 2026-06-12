<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyTransaction extends Model
{
    protected $fillable = [
        'client_id', 'store_id', 'sale_id', 'type',
        'points', 'balance_after', 'description',
    ];

    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
}
