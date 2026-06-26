<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    protected $fillable = ['organization_id', 'name', 'parent_id', 'slug', 'type', 'color', 'icon', 'sort_order', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function parent(): BelongsTo { return $this->belongsTo(Category::class, 'parent_id'); }
    public function children(): HasMany { return $this->hasMany(Category::class, 'parent_id'); }
    public function products(): HasMany { return $this->hasMany(Product::class); }

    /** Retourne les catégories visibles par l'organisation : les siennes + les globales (NULL) */
    public function scopeForOrganization($query, ?int $orgId)
    {
        return $query->where(fn($q) => $q->whereNull('organization_id')->orWhere('organization_id', $orgId));
    }
}
