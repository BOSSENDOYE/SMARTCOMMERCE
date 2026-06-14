<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmActivity extends Model
{
    protected $table = 'crm_activities';

    protected $fillable = [
        'lead_id', 'user_id', 'type', 'title', 'description',
        'scheduled_at', 'completed_at',
    ];

    protected $casts = [
        'scheduled_at'  => 'datetime',
        'completed_at'  => 'datetime',
    ];

    public function lead(): BelongsTo { return $this->belongsTo(CrmLead::class, 'lead_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    public function getIsDoneAttribute(): bool
    {
        return $this->completed_at !== null;
    }
}
