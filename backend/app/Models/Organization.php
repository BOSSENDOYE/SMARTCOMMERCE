<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Organization extends Model
{
    use HasFactory;

    protected $fillable = [
        'name', 'code', 'ninea', 'rc',
        'address', 'phone', 'email', 'logo',
        'description', 'is_active',
        'mail_host', 'mail_port', 'mail_username', 'mail_password',
        'mail_encryption', 'mail_from_address', 'mail_from_name',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'mail_port' => 'integer',
    ];

    protected $hidden = ['mail_password'];

    public function stores()
    {
        return $this->hasMany(Store::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function activeStores()
    {
        return $this->hasMany(Store::class)->where('is_active', true);
    }

    public function subscriptions()
    {
        return $this->hasMany(Subscription::class);
    }

    /** Abonnement actif courant (le plus récent) */
    public function subscription()
    {
        return $this->hasOne(Subscription::class)->latestOfMany();
    }
}
