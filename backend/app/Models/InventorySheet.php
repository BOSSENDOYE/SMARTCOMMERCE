<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventorySheet extends Model
{
    protected $fillable = [
        'session_id', 'name', 'type', 'section_id',
        'assigned_to', 'status', 'validated_by', 'validated_at',
    ];

    // status: draft → counting → validated | cancelled

    protected $casts = [
        'validated_at' => 'datetime',
    ];

    public function session(): BelongsTo     { return $this->belongsTo(InventorySession::class); }
    public function section(): BelongsTo     { return $this->belongsTo(StoreSection::class); }
    public function assignedTo(): BelongsTo  { return $this->belongsTo(User::class, 'assigned_to'); }
    public function validatedBy(): BelongsTo { return $this->belongsTo(User::class, 'validated_by'); }
    public function items(): HasMany         { return $this->hasMany(InventorySessionItem::class, 'sheet_id'); }
}
