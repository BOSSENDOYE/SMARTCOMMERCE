<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InvoiceReminderRule extends Model
{
    protected $fillable = [
        'store_id', 'type', 'offset_days', 'day_of_month',
        'send_whatsapp', 'send_sms', 'send_email', 'message_template', 'is_active', 'sort_order',
    ];

    protected $casts = [
        'send_whatsapp' => 'boolean',
        'send_sms'      => 'boolean',
        'send_email'    => 'boolean',
        'is_active'     => 'boolean',
        'offset_days'   => 'integer',
        'day_of_month'  => 'integer',
        'sort_order'    => 'integer',
    ];

    public function store(): BelongsTo  { return $this->belongsTo(Store::class); }
    public function queueItems(): HasMany { return $this->hasMany(InvoiceReminderQueue::class, 'rule_id'); }

    public function getLabelAttribute(): string
    {
        return match ($this->type) {
            'before_due'    => "{$this->offset_days} jour(s) avant l'échéance",
            'on_due'        => "Le jour de l'échéance",
            'after_due'     => "{$this->offset_days} jour(s) après l'échéance",
            'fixed_monthly' => $this->day_of_month > 0
                ? "Le {$this->day_of_month} de chaque mois"
                : abs($this->day_of_month) . ' jour(s) avant la fin du mois',
            default         => 'Règle inconnue',
        };
    }

    public static function getDefaultTemplate(): string
    {
        return "Bonjour {client},\n\nNous vous rappelons que la facture *{reference}* d'un montant de *{amount} FCFA* est en attente de règlement.\nSolde restant : *{balance} FCFA*\nDate d'échéance : {due_date}\n\nMerci de bien vouloir régulariser votre situation.\n\n_Cordialement,_\n_{store}_";
    }
}
