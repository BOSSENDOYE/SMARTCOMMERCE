<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class FixedAsset extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id', 'created_by', 'asset_account_id', 'depreciation_account_id', 'accumulated_account_id',
        'reference', 'name', 'description', 'acquisition_date', 'acquisition_cost', 'residual_value',
        'depreciation_method', 'useful_life_years', 'useful_life_months', 'status',
        'sold_at', 'scrapped_at', 'sale_price', 'gain_loss', 'notes',
    ];

    protected $casts = [
        'acquisition_date'  => 'date',
        'sold_at'           => 'date',
        'scrapped_at'       => 'date',
        'acquisition_cost'  => 'decimal:2',
        'residual_value'    => 'decimal:2',
        'sale_price'        => 'decimal:2',
        'gain_loss'         => 'decimal:2',
    ];

    public function store(): BelongsTo              { return $this->belongsTo(Store::class); }
    public function createdBy(): BelongsTo          { return $this->belongsTo(User::class, 'created_by'); }
    public function assetAccount(): BelongsTo       { return $this->belongsTo(AccountingAccount::class, 'asset_account_id'); }
    public function depreciationAccount(): BelongsTo{ return $this->belongsTo(AccountingAccount::class, 'depreciation_account_id'); }
    public function accumulatedAccount(): BelongsTo { return $this->belongsTo(AccountingAccount::class, 'accumulated_account_id'); }
    public function depreciations(): HasMany        { return $this->hasMany(FixedAssetDepreciation::class)->orderBy('period_year')->orderBy('period_month'); }

    public function getNetBookValueAttribute(): float
    {
        $accumulated = $this->depreciations()->where('posted', true)->sum('amount');
        return (float) $this->acquisition_cost - (float) $accumulated;
    }

    public function getAccumulatedDepreciationAttribute(): float
    {
        return (float) $this->depreciations()->where('posted', true)->sum('amount');
    }

    /** Génère le plan d'amortissement complet (non persisté). */
    public function generateSchedule(): array
    {
        $cost          = (float) $this->acquisition_cost;
        $residual      = (float) $this->residual_value;
        $depreciable   = $cost - $residual;
        $months        = (int) $this->useful_life_months;
        $years         = (int) $this->useful_life_years;
        $method        = $this->depreciation_method;
        $startDate     = Carbon::parse($this->acquisition_date)->startOfMonth();

        $schedule  = [];
        $cumulated = 0.0;
        $vnc       = $cost;

        if ($method === 'linear') {
            $monthlyAmount = $months > 0 ? round($depreciable / $months, 2) : 0;

            for ($i = 0; $i < $months; $i++) {
                $date   = $startDate->copy()->addMonths($i);
                $amount = ($i === $months - 1) ? round($depreciable - $cumulated, 2) : $monthlyAmount;
                $cumulated += $amount;
                $vnc = round($cost - $cumulated, 2);

                $schedule[] = [
                    'period_year'       => $date->year,
                    'period_month'      => $date->month,
                    'depreciation_date' => $date->endOfMonth()->toDateString(),
                    'amount'            => $amount,
                    'accumulated'       => $cumulated,
                    'net_book_value'    => max(0, $vnc),
                ];
            }
        } else {
            // Méthode dégressive (SYSCOHADA)
            $linearRate = $years > 0 ? 1 / $years : 0;
            $coefficient = $years <= 3 ? 1.5 : ($years <= 6 ? 2.0 : 2.5);
            $decliningRate = $linearRate * $coefficient;

            $currentVnc = $cost;
            for ($y = 0; $y < $years; $y++) {
                $remainingYears   = $years - $y;
                $effectiveRate    = $remainingYears > 0
                    ? max($decliningRate, 1 / $remainingYears)
                    : 1;
                $annualAmount = round(min($currentVnc - $residual, $currentVnc * $effectiveRate), 2);
                $monthlyAmount = round($annualAmount / 12, 2);

                for ($m = 0; $m < 12; $m++) {
                    $date      = $startDate->copy()->addMonths($y * 12 + $m);
                    $amount    = ($m === 11) ? round($annualAmount - ($monthlyAmount * 11), 2) : $monthlyAmount;
                    $cumulated += $amount;
                    $vnc       = round($cost - $cumulated, 2);

                    $schedule[] = [
                        'period_year'       => $date->year,
                        'period_month'      => $date->month,
                        'depreciation_date' => $date->endOfMonth()->toDateString(),
                        'amount'            => $amount,
                        'accumulated'       => $cumulated,
                        'net_book_value'    => max(0, $vnc),
                    ];
                }
                $currentVnc -= $annualAmount;
                if ($currentVnc <= $residual) break;
            }
        }

        return $schedule;
    }

    public static function generateReference(int $storeId): string
    {
        $year   = now()->year;
        $prefix = "IMM-{$year}-";
        $len    = strlen($prefix);
        $pos    = $len + 1;

        $maxNum = DB::selectOne(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(reference, {$pos}) AS INTEGER)), 0) AS n
             FROM fixed_assets
             WHERE reference LIKE ?",
            [$prefix . '%']
        )->n ?? 0;

        return $prefix . str_pad((int) $maxNum + 1, 6, '0', STR_PAD_LEFT);
    }
}
