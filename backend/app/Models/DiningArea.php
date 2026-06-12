<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiningArea extends Model
{
    protected $fillable = ['store_id', 'name', 'type', 'color', 'sort_order', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function tables(): HasMany { return $this->hasMany(Table::class); }
}
