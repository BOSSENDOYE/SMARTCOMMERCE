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
        'type', 'client_category_id', 'ninea', 'notes', 'is_active',
        'loyalty_points', 'credit_balance', 'credit_limit', 'account_balance',
    ];

    protected $casts = [
        'loyalty_points'  => 'integer',
        'credit_balance'  => 'decimal:0',
        'credit_limit'    => 'decimal:0',
        'account_balance' => 'decimal:2',
    ];

    public function category() { return $this->belongsTo(ClientCategory::class, 'client_category_id'); }
    public function sales(): HasMany { return $this->hasMany(Sale::class); }
    public function loyaltyTransactions(): HasMany { return $this->hasMany(LoyaltyTransaction::class); }
    public function accountTransactions(): HasMany { return $this->hasMany(ClientAccountTransaction::class); }
    public function reservations(): HasMany { return $this->hasMany(Reservation::class); }
}
