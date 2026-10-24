<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UnsoldReport extends Model
{
    protected $fillable = ['store_id', 'user_id', 'reference', 'report_date', 'total_cost', 'notes'];

    protected $casts = [
        'report_date' => 'date',
        'total_cost'  => 'float',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function lines(): HasMany { return $this->hasMany(UnsoldReportLine::class); }
}
