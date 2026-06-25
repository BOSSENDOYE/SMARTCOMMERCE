<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnboardingRequest extends Model
{
    protected $fillable = [
        'status', 'company_name', 'contact_name', 'email', 'phone',
        'activity_type', 'city', 'country', 'plan_slug', 'duration_months',
        'notes', 'rejection_reason', 'reviewed_by', 'reviewed_at',
    ];

    protected $casts = [
        'duration_months' => 'integer',
        'reviewed_at'     => 'datetime',
    ];

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(SuperAdmin::class, 'reviewed_by');
    }
}
