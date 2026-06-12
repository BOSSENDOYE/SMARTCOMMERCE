<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SaleReturn extends Model
{
    protected $table = 'returns';

    protected $fillable = [
        'sale_id', 'store_id', 'reason', 'status',
        'refund_method', 'total_refund', 'user_id', 'validated_by',
    ];

    public function sale(): BelongsTo { return $this->belongsTo(Sale::class); }
    public function items(): HasMany { return $this->hasMany(SaleReturnItem::class, 'return_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
