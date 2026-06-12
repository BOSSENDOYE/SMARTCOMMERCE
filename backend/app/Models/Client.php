<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id', 'name', 'phone', 'email', 'address',
        'type', 'ninea', 'notes', 'is_active',
        'loyalty_points', 'credit_balance', 'credit_limit',
    ];

    protected $casts = [
        'loyalty_points' => 'integer',
        'credit_balance' => 'decimal:0',
        'credit_limit' => 'decimal:0',
    ];

    public function sales(): HasMany { return $this->hasMany(Sale::class); }
    public function loyaltyTransactions(): HasMany { return $this->hasMany(LoyaltyTransaction::class); }
    public function reservations(): HasMany { return $this->hasMany(Reservation::class); }
}
