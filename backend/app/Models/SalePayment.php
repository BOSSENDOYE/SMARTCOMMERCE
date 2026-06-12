<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalePayment extends Model
{
    protected $fillable = ['sale_id', 'method', 'amount', 'reference', 'change_given'];

    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
}
