<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id', 'workstation_id', 'cash_session_id', 'client_id', 'user_id',
        'reference', 'status', 'channel',
        'subtotal_ht', 'vat_amount', 'discount_amount', 'total_ttc',
        'paid_amount', 'change_amount',
        'loyalty_points_earned', 'loyalty_points_used',
        'offline_id', 'is_synced', 'synced_at', 'notes',
    ];

    protected $casts = [
        'subtotal_ht' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_ttc' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'is_synced' => 'boolean',
        'synced_at' => 'datetime',
    ];

    // Prevent modifying completed sales without audit trail
    protected static function boot()
    {
        parent::boot();
        static::updating(function (Sale $sale) {
            if ($sale->getOriginal('status') === 'completed' && !request()->has('_force_update')) {
                if (in_array($sale->getDirty()['status'] ?? '', ['cancelled', 'refunded'])) {
                    return true;
                }
                return false;
            }
        });
    }

    public function store() { return $this->belongsTo(Store::class); }
    public function workstation() { return $this->belongsTo(Workstation::class); }
    public function cashSession() { return $this->belongsTo(CashSession::class); }
    public function client() { return $this->belongsTo(Client::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function items() { return $this->hasMany(SaleItem::class); }
    public function payments() { return $this->hasMany(SalePayment::class); }
    public function ticket() { return $this->hasOne(SaleTicket::class); }
    public function returns() { return $this->hasMany(SaleReturn::class, 'original_sale_id'); }

    public function scopeCompleted($query) { return $query->where('status', 'completed'); }
    public function scopeForStore($query, $storeId) { return $query->where('store_id', $storeId); }
    public function scopeToday($query) { return $query->whereDate('created_at', today()); }

    public function generateReference(): string
    {
        $prefix = 'VTE';
        $date = now()->format('Ymd');
        $last = static::whereDate('created_at', today())
            ->where('store_id', $this->store_id)
            ->orderByDesc('id')->value('reference');
        $seq = $last ? (int)substr($last, -6) + 1 : 1;
        return $prefix . $date . str_pad($seq, 6, '0', STR_PAD_LEFT);
    }
}
