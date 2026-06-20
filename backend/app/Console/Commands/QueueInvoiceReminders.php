<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\InvoiceReminderQueue;
use App\Models\InvoiceReminderRule;
use App\Models\Store;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class QueueInvoiceReminders extends Command
{
    protected $signature   = 'invoices:queue-reminders';
    protected $description = 'Queue invoice reminders based on active reminder rules';

    public function handle(): int
    {
        $today   = Carbon::today();
        $created = 0;
        $skipped = 0;

        $stores = Store::where('is_active', true)->get();

        foreach ($stores as $store) {
            $rules = InvoiceReminderRule::where('store_id', $store->id)
                ->where('is_active', true)
                ->get();

            if ($rules->isEmpty()) continue;

            $invoices = Invoice::where('store_id', $store->id)
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->whereNotNull('due_date')
                ->with('client:id,name,phone,email')
                ->get();

            foreach ($rules as $rule) {
                $matchingInvoices = collect();

                if ($rule->type === 'fixed_monthly') {
                    $dayOfMonth  = $today->day;
                    $daysInMonth = $today->daysInMonth;
                    $target = $rule->day_of_month > 0
                        ? $rule->day_of_month
                        : $daysInMonth + $rule->day_of_month;

                    if ($dayOfMonth === $target) {
                        $matchingInvoices = $invoices;
                    }
                } else {
                    foreach ($invoices as $invoice) {
                        $targetDate = match ($rule->type) {
                            'before_due' => Carbon::parse($invoice->due_date)->subDays($rule->offset_days ?? 0),
                            'on_due'     => Carbon::parse($invoice->due_date),
                            'after_due'  => Carbon::parse($invoice->due_date)->addDays($rule->offset_days ?? 0),
                            default      => null,
                        };

                        if ($targetDate && $targetDate->isSameDay($today)) {
                            $matchingInvoices->push($invoice);
                        }
                    }
                }

                foreach ($matchingInvoices as $invoice) {
                    $channels = [];
                    if ($rule->send_whatsapp) $channels[] = 'whatsapp';
                    if ($rule->send_sms)      $channels[] = 'sms';
                    if ($rule->send_email)    $channels[] = 'email';

                    foreach ($channels as $channel) {
                        $exists = InvoiceReminderQueue::where('invoice_id', $invoice->id)
                            ->where('rule_id', $rule->id)
                            ->where('channel', $channel)
                            ->where('scheduled_date', $today->toDateString())
                            ->exists();

                        if ($exists) { $skipped++; continue; }

                        $template = $rule->message_template ?? InvoiceReminderRule::getDefaultTemplate();
                        $balance  = max(0, (float) $invoice->total_ttc - (float) $invoice->paid_amount);
                        $message  = str_replace(
                            ['{client}', '{reference}', '{amount}', '{balance}', '{due_date}', '{store}'],
                            [
                                $invoice->client?->name ?? 'Client',
                                $invoice->reference,
                                number_format((float) $invoice->total_ttc, 0, ',', ' '),
                                number_format($balance, 0, ',', ' '),
                                $invoice->due_date ? Carbon::parse($invoice->due_date)->format('d/m/Y') : '—',
                                $store->name,
                            ],
                            $template
                        );

                        InvoiceReminderQueue::create([
                            'store_id'       => $store->id,
                            'invoice_id'     => $invoice->id,
                            'rule_id'        => $rule->id,
                            'channel'        => $channel,
                            'phone'          => $invoice->client?->phone,
                            'email'          => $channel === 'email' ? $invoice->client?->email : null,
                            'client_name'    => $invoice->client?->name,
                            'message'        => $message,
                            'scheduled_date' => $today->toDateString(),
                            'status'         => 'pending',
                        ]);

                        $created++;
                    }
                }
            }
        }

        $this->info("Queued {$created} reminder(s) for {$today->toDateString()} ({$skipped} already existing).");
        Log::info("invoices:queue-reminders: queued={$created} skipped={$skipped} date={$today}");

        return self::SUCCESS;
    }
}
