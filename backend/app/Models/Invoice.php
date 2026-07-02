<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Invoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id', 'client_id', 'created_by', 'reference', 'object',
        'status', 'issue_date', 'due_date',
        'subtotal_ht', 'vat_amount', 'discount_amount', 'total_ttc', 'paid_amount',
        'notes', 'terms', 'sent_at', 'paid_at',
    ];

    protected $casts = [
        'issue_date'  => 'date',
        'due_date'    => 'date',
        'sent_at'     => 'datetime',
        'paid_at'     => 'datetime',
        'subtotal_ht' => 'decimal:2',
        'vat_amount'  => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_ttc'   => 'decimal:2',
        'paid_amount' => 'decimal:2',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function store(): BelongsTo     { return $this->belongsTo(Store::class); }
    public function client(): BelongsTo    { return $this->belongsTo(Client::class); }
    public function createdBy(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function items(): HasMany       { return $this->hasMany(InvoiceItem::class)->orderBy('sort_order'); }
    public function payments(): HasMany    { return $this->hasMany(InvoicePayment::class)->orderBy('paid_at'); }
    public function reminders(): HasMany   { return $this->hasMany(InvoiceReminder::class)->orderBy('sent_at'); }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function getBalanceAttribute(): float
    {
        return (float) $this->total_ttc - (float) $this->paid_amount;
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->due_date
            && now()->gt($this->due_date)
            && !in_array($this->status, ['paid', 'cancelled']);
    }

    /** Génère la prochaine référence FAC-YYYY-NNNNNN pour ce magasin */
    public static function generateReference(int $storeId): string
    {
        $year   = now()->year;
        $prefix = "FAC-{$year}-";
        $len    = strlen($prefix);

        $maxNum = DB::selectOne(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(reference, ?) AS INTEGER)), 0) AS n
             FROM invoices
             WHERE store_id = ? AND reference LIKE ?",
            [$len + 1, $storeId, $prefix . '%']
        )->n ?? 0;

        return $prefix . str_pad((int) $maxNum + 1, 6, '0', STR_PAD_LEFT);
    }

    /** Recalcule et met à jour paid_amount + status depuis les paiements réels */
    public function refreshPaidAmount(): void
    {
        $paid = $this->payments()->sum('amount');
        $status = match (true) {
            $paid <= 0                       => ($this->status === 'sent' ? 'sent' : 'draft'),
            $paid >= (float) $this->total_ttc => 'paid',
            default                           => 'partial',
        };

        $this->update([
            'paid_amount' => $paid,
            'status'      => $status,
            'paid_at'     => $paid >= (float) $this->total_ttc ? now() : null,
        ]);
    }
}
