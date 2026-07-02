<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Quote extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id', 'client_id', 'created_by', 'invoice_id', 'reference', 'object',
        'status', 'issue_date', 'valid_until',
        'subtotal_ht', 'vat_amount', 'discount_amount', 'total_ttc',
        'notes', 'terms', 'sent_at',
    ];

    protected $casts = [
        'issue_date'   => 'date',
        'valid_until'  => 'date',
        'sent_at'      => 'datetime',
        'subtotal_ht'  => 'decimal:2',
        'vat_amount'   => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_ttc'    => 'decimal:2',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function store(): BelongsTo     { return $this->belongsTo(Store::class); }
    public function client(): BelongsTo    { return $this->belongsTo(Client::class); }
    public function createdBy(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function invoice(): BelongsTo   { return $this->belongsTo(Invoice::class); }
    public function items(): HasMany       { return $this->hasMany(QuoteItem::class)->orderBy('sort_order'); }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function getIsExpiredAttribute(): bool
    {
        return $this->valid_until
            && now()->gt($this->valid_until)
            && !in_array($this->status, ['accepted', 'invoiced', 'cancelled']);
    }

    public static function generateReference(int $storeId): string
    {
        $year   = now()->year;
        $prefix = "DEV-{$year}-";
        $len    = strlen($prefix);

        $pos    = $len + 1;
        $maxNum = DB::selectOne(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(reference, {$pos}) AS INTEGER)), 0) AS n
             FROM quotes
             WHERE reference LIKE ?",
            [$prefix . '%']
        )->n ?? 0;

        return $prefix . str_pad((int) $maxNum + 1, 6, '0', STR_PAD_LEFT);
    }
}
