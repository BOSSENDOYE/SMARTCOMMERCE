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
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function stores()
    {
        return $this->hasMany(Store::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    /** Nombre de magasins actifs */
    public function activeStores()
    {
        return $this->hasMany(Store::class)->where('is_active', true);
    }
}
