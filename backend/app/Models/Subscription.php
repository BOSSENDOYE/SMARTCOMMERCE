<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    protected $fillable = [
        'organization_id', 'plan_id', 'custom_features', 'status', 'billing_cycle',
        'max_stores_override', 'max_users_override',
        'trial_ends_at', 'starts_at', 'ends_at', 'grace_ends_at', 'cancelled_at',
    ];

    protected $casts = [
        'custom_features'    => 'array',
        'trial_ends_at'      => 'datetime',
        'starts_at'          => 'datetime',
        'ends_at'            => 'datetime',
        'grace_ends_at'      => 'datetime',
        'cancelled_at'       => 'datetime',
        'max_stores_override'=> 'integer',
        'max_users_override' => 'integer',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'plan_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(PlatformInvoice::class);
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['trial', 'active']);
    }

    public function isExpired(): bool
    {
        return $this->ends_at->isPast() && !$this->isInGrace();
    }

    public function isInGrace(): bool
    {
        return $this->status === 'active'
            && $this->ends_at->isPast()
            && $this->grace_ends_at
            && $this->grace_ends_at->isFuture();
    }

    public function hasFeature(string $feature): bool
    {
        $customFeatures = $this->custom_features ?? [];
        if (isset($customFeatures[$feature])) {
            return (bool) $customFeatures[$feature];
        }
        return $this->plan?->hasFeature($feature) ?? false;
    }

    /** Nombre max de magasins autorisés (-1 = illimité) */
    public function maxStores(): int
    {
        return $this->max_stores_override ?? $this->plan?->max_stores ?? -1;
    }

    /** Nombre max d'utilisateurs autorisés (-1 = illimité) */
    public function maxUsers(): int
    {
        return $this->max_users_override ?? $this->plan?->max_users ?? -1;
    }

    public function extendDays(int $days): void
    {
        $this->ends_at = $this->ends_at->addDays($days);
        $this->grace_ends_at = $this->ends_at->addDays($this->plan?->grace_period_days ?? 7);
        if ($this->status === 'expired') {
            $this->status = 'active';
        }
        $this->save();
    }
}
