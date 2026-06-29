<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportTicketMessage extends Model
{
    protected $fillable = ['ticket_id', 'user_id', 'super_admin_id', 'author_name', 'body', 'is_internal'];

    protected $casts = ['is_internal' => 'boolean'];

    public function ticket(): BelongsTo      { return $this->belongsTo(SupportTicket::class); }
    public function user(): BelongsTo        { return $this->belongsTo(User::class); }
    public function superAdmin(): BelongsTo  { return $this->belongsTo(SuperAdmin::class); }

    public function getAuthorAttribute(): string
    {
        if ($this->author_name) return $this->author_name;
        if ($this->user_id)     return $this->user?->name ?? 'Utilisateur';
        return $this->superAdmin?->name ?? 'Support';
    }
}
