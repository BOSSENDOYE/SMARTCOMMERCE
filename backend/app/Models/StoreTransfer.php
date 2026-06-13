<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StoreTransfer extends Model
{
    protected $fillable = [
        'reference', 'from_store_id', 'to_store_id', 'status',
        'created_by', 'validated_by', 'shipped_by', 'received_by',
        'notes', 'rejection_reason',
        'validated_at', 'shipped_at', 'received_at',
    ];

    protected $casts = [
        'validated_at' => 'datetime',
        'shipped_at'   => 'datetime',
        'received_at'  => 'datetime',
    ];

    public function fromStore(): BelongsTo  { return $this->belongsTo(Store::class, 'from_store_id'); }
    public function toStore(): BelongsTo    { return $this->belongsTo(Store::class, 'to_store_id'); }
    public function createdBy(): BelongsTo  { return $this->belongsTo(User::class, 'created_by'); }
    public function validatedBy(): BelongsTo { return $this->belongsTo(User::class, 'validated_by'); }
    public function shippedBy(): BelongsTo  { return $this->belongsTo(User::class, 'shipped_by'); }
    public function receivedBy(): BelongsTo { return $this->belongsTo(User::class, 'received_by'); }
    public function items(): HasMany        { return $this->hasMany(StoreTransferItem::class); }
}
