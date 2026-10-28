<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SheetShift extends Model
{
    public const SHIFTS = ['matin' => 1, 'soir' => 2, 'nuit' => 3];
    public const LABELS = ['matin' => 'Matin', 'soir' => 'Soir', 'nuit' => 'Nuit'];

    protected $fillable = [
        'daily_sheet_id', 'store_id', 'shift', 'position', 'status', 'responsible_id',
        'opened_by', 'opened_at', 'start_movement_id', 'closed_by', 'closed_at', 'unsold_report_id', 'notes',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function sheet(): BelongsTo { return $this->belongsTo(DailySheet::class, 'daily_sheet_id'); }
    public function responsible(): BelongsTo { return $this->belongsTo(User::class, 'responsible_id'); }
    public function opener(): BelongsTo { return $this->belongsTo(User::class, 'opened_by'); }
    public function closer(): BelongsTo { return $this->belongsTo(User::class, 'closed_by'); }
    public function lines(): HasMany { return $this->hasMany(SheetLine::class); }
    public function audits(): HasMany { return $this->hasMany(SheetAudit::class); }
}
