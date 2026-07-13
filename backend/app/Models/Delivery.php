<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Delivery extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id', 'client_id', 'invoice_id', 'sale_id', 'created_by',
        'reference', 'status', 'delivery_date', 'shipped_at', 'delivered_at',
        'shipping_address', 'notes', 'total_qty',
    ];

    protected $casts = [
        'delivery_date' => 'date',
        'shipped_at'    => 'datetime',
        'delivered_at'  => 'datetime',
        'total_qty'     => 'decimal:3',
    ];

    public function store(): BelongsTo     { return $this->belongsTo(Store::class); }
    public function client(): BelongsTo    { return $this->belongsTo(Client::class); }
    public function invoice(): BelongsTo   { return $this->belongsTo(Invoice::class); }
    public function sale(): BelongsTo      { return $this->belongsTo(Sale::class); }
    public function createdBy(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function items(): HasMany       { return $this->hasMany(DeliveryItem::class)->orderBy('sort_order'); }

    public function getCanShipAttribute(): bool
    {
        return $this->status === 'confirmed';
    }

    public function getCanDeliverAttribute(): bool
    {
        return $this->status === 'shipped';
    }

    public static function generateReference(int $storeId): string
    {
        $year   = now()->year;
        $prefix = "BL-{$year}-";
        $len    = strlen($prefix);
        $pos    = $len + 1;

        $maxNum = DB::selectOne(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(reference, {$pos}) AS INTEGER)), 0) AS n
             FROM deliveries
             WHERE reference LIKE ?",
            [$prefix . '%']
        )->n ?? 0;

        return $prefix . str_pad((int) $maxNum + 1, 6, '0', STR_PAD_LEFT);
    }
}
