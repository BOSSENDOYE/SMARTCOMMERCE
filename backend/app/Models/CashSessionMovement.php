<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashSessionMovement extends Model
{
    protected $table = 'cash_session_movements';

    const UPDATED_AT = null;

    protected $fillable = [
        'cash_session_id', 'user_id', 'supervisor_id',
        'type', 'amount', 'motive', 'receipt_ref',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function cashSession(): BelongsTo { return $this->belongsTo(CashSession::class); }
    public function user(): BelongsTo        { return $this->belongsTo(User::class); }
    public function supervisor(): BelongsTo  { return $this->belongsTo(User::class, 'supervisor_id'); }
}
