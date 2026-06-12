<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workstation extends Model
{
    protected $fillable = ['store_id', 'name', 'type', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function cashSessions(): HasMany { return $this->hasMany(CashSession::class); }
}
