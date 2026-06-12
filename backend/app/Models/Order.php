<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'store_id', 'table_session_id', 'sale_id', 'user_id',
        'reference', 'status', 'channel', 'client_name', 'client_phone',
        'covers', 'notes', 'total_amount',
    ];

    public function tableSession(): BelongsTo { return $this->belongsTo(TableSession::class); }
    public function items(): HasMany { return $this->hasMany(OrderItem::class); }
    public function server(): BelongsTo { return $this->belongsTo(User::class, 'server_id'); }
}
