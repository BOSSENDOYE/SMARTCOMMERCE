<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventorySession extends Model
{
    protected $fillable = [
        'store_id', 'name', 'type', 'status',
        'started_by', 'validated_by',
        'started_at', 'validated_at',
        'freeze_movements', 'total_variance_value', 'shrinkage_rate_pct',
        'scheduled_at', 'sales_mode', 'remind_before_minutes', 'reminder_sent_at',
    ];

    // status: scheduled → draft → counting → pending (all sheets validated) → completed
    // sales_mode: normal | blocked

    protected $casts = [
        'started_at'          => 'datetime',
        'validated_at'        => 'datetime',
        'scheduled_at'        => 'datetime',
        'reminder_sent_at'    => 'datetime',
        'freeze_movements'    => 'boolean',
        'total_variance_value' => 'decimal:2',
        'shrinkage_rate_pct'  => 'decimal:4',
    ];

    public function startedBy(): BelongsTo { return $this->belongsTo(User::class, 'started_by'); }
    public function validator(): BelongsTo { return $this->belongsTo(User::class, 'validated_by'); }
    public function items(): HasMany  { return $this->hasMany(InventorySessionItem::class, 'session_id'); }
    public function sheets(): HasMany { return $this->hasMany(InventorySheet::class, 'session_id'); }
}
