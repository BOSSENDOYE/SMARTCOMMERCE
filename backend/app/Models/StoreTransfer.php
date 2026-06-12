<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StoreTransfer extends Model
{
    protected $fillable = [
        'from_store_id', 'to_store_id', 'status', 'reference',
        'notes', 'created_by', 'validated_by', 'validated_at',
    ];

    protected $casts = ['validated_at' => 'datetime'];

    public function fromStore(): BelongsTo { return $this->belongsTo(Store::class, 'from_store_id'); }
    public function toStore(): BelongsTo { return $this->belongsTo(Store::class, 'to_store_id'); }
    public function items(): HasMany { return $this->hasMany(StoreTransferItem::class); }
}
