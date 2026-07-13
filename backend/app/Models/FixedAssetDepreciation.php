<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FixedAssetDepreciation extends Model
{
    protected $fillable = [
        'fixed_asset_id', 'journal_entry_id', 'period_year', 'period_month',
        'depreciation_date', 'amount', 'accumulated', 'net_book_value', 'posted',
    ];

    protected $casts = [
        'depreciation_date' => 'date',
        'amount'            => 'decimal:2',
        'accumulated'       => 'decimal:2',
        'net_book_value'    => 'decimal:2',
        'posted'            => 'boolean',
    ];

    public function fixedAsset(): BelongsTo   { return $this->belongsTo(FixedAsset::class); }
    public function journalEntry(): BelongsTo { return $this->belongsTo(JournalEntry::class); }
}
