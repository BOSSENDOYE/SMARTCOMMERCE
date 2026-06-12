<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    protected $fillable = [
        'store_id', 'client_id', 'guest_name', 'guest_phone',
        'party_size', 'reservation_date', 'duration_minutes',
        'status', 'notes', 'table_id', 'created_by',
    ];

    protected $casts = ['reservation_date' => 'datetime'];

    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function table(): BelongsTo { return $this->belongsTo(Table::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
