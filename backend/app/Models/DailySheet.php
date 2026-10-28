<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DailySheet extends Model
{
    protected $fillable = ['store_id', 'sheet_date'];

    protected $casts = ['sheet_date' => 'date'];

    public function shifts(): HasMany { return $this->hasMany(SheetShift::class)->orderBy('position'); }
}
