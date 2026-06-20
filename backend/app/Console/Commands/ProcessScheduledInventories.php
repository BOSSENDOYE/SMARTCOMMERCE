<?php

namespace App\Console\Commands;

use App\Models\InventorySession;
use App\Models\StockLevel;
use App\Models\InventorySessionItem;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class ProcessScheduledInventories extends Command
{
    protected $signature   = 'inventory:process-scheduled';
    protected $description = 'Auto-start due inventories and send reminders';

    public function handle(): void
    {
        $now = now();

        // ── 1. Send reminders ─────────────────────────────────────────────────
        $toRemind = InventorySession::where('status', 'scheduled')
            ->whereNull('reminder_sent_at')
            ->whereNotNull('remind_before_minutes')
            ->whereNotNull('scheduled_at')
            ->get()
            ->filter(fn($s) => $s->scheduled_at->subMinutes($s->remind_before_minutes)->lte($now));

        foreach ($toRemind as $session) {
            $this->sendReminder($session);
            $session->update(['reminder_sent_at' => $now]);
            $this->line("Reminder sent for inventory #{$session->id} ({$session->name})");
        }

        // ── 2. Auto-start inventories past their scheduled_at ─────────────────
        $toStart = InventorySession::where('status', 'scheduled')
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', $now)
            ->get();

        foreach ($toStart as $session) {
            $session->update([
                'status'     => 'draft',
                'started_at' => $now,
            ]);

            if ($session->type === 'full') {
                $this->preloadFullInventory($session);
            }

            $this->line("Auto-started inventory #{$session->id} ({$session->name})");
        }
    }

    private function sendReminder(InventorySession $session): void
    {
        // Notify admins of the store via email
        $admins = User::where('store_id', $session->store_id)
            ->whereHas('roles', fn($q) => $q->whereIn('name', ['admin', 'super_admin']))
            ->get();

        $minutesUntil = (int) round(now()->diffInMinutes($session->scheduled_at));
        $subject = "Rappel inventaire : \"{$session->name}\" dans {$minutesUntil} min";
        $body    = "L'inventaire \"{$session->name}\" est planifié le {$session->scheduled_at->format('d/m/Y à H:i')}.\n"
                 . "Il démarrera automatiquement dans environ {$minutesUntil} minutes.";

        foreach ($admins as $admin) {
            if ($admin->email) {
                try {
                    Mail::raw($body, fn($m) => $m->to($admin->email)->subject($subject));
                } catch (\Throwable) {
                    // Email failure must not stop the command
                }
            }
        }
    }

    private function preloadFullInventory(InventorySession $session): void
    {
        if ($session->items()->exists()) return;

        $levels = StockLevel::where('store_id', $session->store_id)->get();
        $items  = $levels->map(fn($l) => [
            'session_id'      => $session->id,
            'product_id'      => $l->product_id,
            'theoretical_qty' => $l->qty_on_hand,
            'unit_cost'       => $l->avg_cost,
            'created_at'      => now(),
            'updated_at'      => now(),
        ])->toArray();

        if (!empty($items)) {
            InventorySessionItem::insert($items);
        }
    }
}
