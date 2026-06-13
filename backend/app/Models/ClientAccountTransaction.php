<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClientAccountTransaction extends Model
{
    protected $fillable = [
        'client_id', 'sale_id', 'created_by',
        'type', 'amount', 'balance_before', 'balance_after', 'note',
    ];

    protected $casts = [
        'amount'         => 'decimal:2',
        'balance_before' => 'decimal:2',
        'balance_after'  => 'decimal:2',
    ];

    public function client()  { return $this->belongsTo(Client::class); }
    public function sale()    { return $this->belongsTo(Sale::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
