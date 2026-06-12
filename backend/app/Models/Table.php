<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Table extends Model
{
    protected $table = 'tables';

    protected $fillable = [
        'dining_area_id', 'store_id', 'label', 'capacity',
        'pos_x', 'pos_y', 'status', 'is_active',
    ];

    protected $casts = ['is_active' => 'boolean'];

    public function diningArea(): BelongsTo { return $this->belongsTo(DiningArea::class); }
    public function sessions(): HasMany { return $this->hasMany(TableSession::class); }
    public function activeSession(): HasOne { return $this->hasOne(TableSession::class)->where('status', 'open'); }
}
