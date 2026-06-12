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
        'area_id', 'number', 'seats', 'status',
        'pos_x', 'pos_y', 'shape', 'is_active',
    ];

    protected $casts = ['is_active' => 'boolean'];

    public function area(): BelongsTo { return $this->belongsTo(DiningArea::class, 'area_id'); }
    public function sessions(): HasMany { return $this->hasMany(TableSession::class); }
    public function activeSession(): HasOne { return $this->hasOne(TableSession::class)->whereNull('closed_at'); }
}
