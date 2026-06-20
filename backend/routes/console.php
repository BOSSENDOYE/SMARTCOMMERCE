<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Run every minute: auto-start scheduled inventories and send reminders
Schedule::command('inventory:process-scheduled')->everyMinute();

// Queue invoice reminders daily at 08:00
Schedule::command('invoices:queue-reminders')->dailyAt('08:00');
