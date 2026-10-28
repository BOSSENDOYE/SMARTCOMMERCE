<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SheetAudit extends Model
{
    public $timestamps = false;

    protected $fillable = ['sheet_shift_id', 'user_id', 'action', 'product_id', 'qty', 'details', 'created_at'];

    protected $casts = [
        'qty'        => 'float',
        'details'    => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
