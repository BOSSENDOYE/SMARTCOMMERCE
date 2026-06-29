<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SupportTicket extends Model
{
    protected $fillable = [
        'ticket_number', 'organization_id', 'store_id', 'created_by', 'assigned_to', 'assigned_super_admin_id',
        'subject', 'category', 'priority', 'status',
        'first_response_at', 'resolved_at', 'closed_at',
    ];

    protected $casts = [
        'first_response_at' => 'datetime',
        'resolved_at'       => 'datetime',
        'closed_at'         => 'datetime',
    ];

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function store(): BelongsTo        { return $this->belongsTo(Store::class); }
    public function creator(): BelongsTo      { return $this->belongsTo(User::class, 'created_by'); }
    public function agent(): BelongsTo        { return $this->belongsTo(User::class, 'assigned_to'); }
    public function messages(): HasMany       { return $this->hasMany(SupportTicketMessage::class, 'ticket_id')->orderBy('created_at'); }

    /** Generate next ticket number like TKT-2026-0001 */
    public static function nextNumber(): string
    {
        $year  = now()->year;
        $last  = static::whereYear('created_at', $year)->max('ticket_number');
        $seq   = $last ? ((int) substr($last, -4)) + 1 : 1;
        return 'TKT-' . $year . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    public function scopeForOrganization($query, ?int $orgId)
    {
        return $orgId ? $query->where('organization_id', $orgId) : $query;
    }

    public function getIsOpenAttribute(): bool
    {
        return !in_array($this->status, ['resolved', 'closed']);
    }
}
