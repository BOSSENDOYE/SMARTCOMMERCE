<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailySummary extends Model
{
    protected $fillable = [
        'store_id', 'date', 'total_sales', 'total_items',
        'total_cash', 'total_card', 'total_mobile_money',
        'total_credit', 'total_returns', 'total_losses',
        'gross_margin', 'z_report_data',
    ];

    protected $casts = [
        'date' => 'date',
        'z_report_data' => 'array',
    ];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
}
