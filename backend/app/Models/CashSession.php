<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CashSession extends Model
{
    protected $fillable = [
        'store_id', 'workstation_id', 'user_id', 'status',
        'opening_balance', 'closing_balance_expected', 'closing_balance_actual', 'closing_balance_variance',
        'opening_count', 'closing_count', 'opened_at', 'closed_at', 'closed_by', 'notes',
    ];

    protected $casts = [
        'opening_count' => 'array',
        'closing_count' => 'array',
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function store() { return $this->belongsTo(Store::class); }
    public function workstation() { return $this->belongsTo(Workstation::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function closedByUser() { return $this->belongsTo(User::class, 'closed_by'); }
    public function sales() { return $this->hasMany(Sale::class); }
    public function movements() { return $this->hasMany(CashSessionMovement::class); }
}
