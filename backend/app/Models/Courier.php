<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Courier extends Model
{
    protected $fillable = ['store_id', 'name', 'phone', 'zone', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function rounds(): HasMany { return $this->hasMany(CourierRound::class); }
    public function payments(): HasMany { return $this->hasMany(CourierPayment::class); }

    /** Manquant cumulé : dû des tournées réglées − versements (règlements + remboursements). */
    public function debt(): float
    {
        $due  = (float) $this->rounds()->where('status', 'settled')->sum('amount_due');
        $paid = (float) $this->payments()->sum('amount');

        return round(max(0, $due - $paid), 2);
    }
}
