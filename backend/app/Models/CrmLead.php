<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CrmLead extends Model
{
    use SoftDeletes;

    protected $table = 'crm_leads';

    protected $fillable = [
        'store_id', 'client_id', 'assigned_to',
        'title', 'contact_name', 'contact_phone', 'contact_email', 'company_name',
        'stage', 'source', 'probability', 'expected_amount', 'expected_close_date',
        'lost_reason', 'notes', 'won_at', 'lost_at',
    ];

    protected $casts = [
        'expected_amount'     => 'decimal:2',
        'expected_close_date' => 'date',
        'probability'         => 'integer',
        'won_at'              => 'datetime',
        'lost_at'             => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function store(): BelongsTo      { return $this->belongsTo(Store::class); }
    public function client(): BelongsTo     { return $this->belongsTo(Client::class); }
    public function assignedTo(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function activities(): HasMany   { return $this->hasMany(CrmActivity::class, 'lead_id')->orderByDesc('created_at'); }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Nom d'affichage du contact */
    public function getDisplayNameAttribute(): string
    {
        return $this->client?->name
            ?? $this->contact_name
            ?? $this->company_name
            ?? 'Inconnu';
    }

    /** Numéro de téléphone affiché */
    public function getDisplayPhoneAttribute(): string
    {
        return $this->client?->phone ?? $this->contact_phone ?? '';
    }

    /** Probabilité par défaut selon le stage */
    public static function defaultProbability(string $stage): int
    {
        return match ($stage) {
            'new'         => 10,
            'qualified'   => 30,
            'proposal'    => 50,
            'negotiation' => 75,
            'won'         => 100,
            'lost'        => 0,
            default       => 10,
        };
    }
}
