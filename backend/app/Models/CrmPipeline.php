<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CrmPipeline extends Model
{
    protected $fillable = [
        'store_id', 'name', 'description', 'is_default', 'sort_order',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(CrmLead::class, 'pipeline_id');
    }
}
