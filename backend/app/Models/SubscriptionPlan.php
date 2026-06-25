<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'name', 'slug', 'description', 'max_stores', 'max_users',
        'features', 'price_monthly', 'price_quarterly', 'price_yearly',
        'trial_days', 'grace_period_days', 'is_active', 'sort_order',
    ];

    protected $casts = [
        'features'          => 'array',
        'is_active'         => 'boolean',
        'price_monthly'     => 'integer',
        'price_quarterly'   => 'integer',
        'price_yearly'      => 'integer',
        'max_stores'        => 'integer',
        'max_users'         => 'integer',
        'trial_days'        => 'integer',
        'grace_period_days' => 'integer',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class, 'plan_id');
    }

    public function hasFeature(string $feature): bool
    {
        return in_array($feature, $this->features ?? []);
    }
}
