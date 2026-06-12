<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Store extends Model
{
    use HasFactory;

    protected $fillable = [
        'name', 'code', 'address', 'phone', 'email',
        'ninea', 'rc', 'logo', 'currency', 'timezone',
        'license_grande_surface', 'license_restaurant',
        'receipt_footer', 'is_active', 'is_central',
    ];

    protected $casts = [
        'license_grande_surface' => 'boolean',
        'license_restaurant' => 'boolean',
        'is_active' => 'boolean',
        'is_central' => 'boolean',
    ];

    public function users() { return $this->hasMany(User::class); }
    public function products() { return $this->hasMany(Product::class); }
    public function categories() { return $this->hasMany(Category::class); }
    public function suppliers() { return $this->hasMany(Supplier::class); }
    public function clients() { return $this->hasMany(Client::class); }
    public function sales() { return $this->hasMany(Sale::class); }
    public function cashSessions() { return $this->hasMany(CashSession::class); }
    public function stockLevels() { return $this->hasMany(StockLevel::class); }
    public function stockMovements() { return $this->hasMany(StockMovement::class); }
    public function workstations() { return $this->hasMany(Workstation::class); }
    public function inventorySessions() { return $this->hasMany(InventorySession::class); }
    public function diningAreas() { return $this->hasMany(DiningArea::class); }
    public function promotions() { return $this->hasMany(Promotion::class); }
    public function dailySummaries() { return $this->hasMany(DailySummary::class); }
    public function auditLogs() { return $this->hasMany(AuditLog::class); }
}
