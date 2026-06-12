<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    protected $fillable = [
        'store_id', 'table_id', 'client_id', 'client_name', 'client_phone',
        'reservation_date', 'reservation_time', 'covers',
        'status', 'special_requests', 'reminder_sent',
    ];

    protected $casts = ['reminder_sent' => 'boolean'];

    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function table(): BelongsTo { return $this->belongsTo(Table::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
