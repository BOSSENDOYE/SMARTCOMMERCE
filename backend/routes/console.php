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

// Backup automatique — vérifie chaque heure si le planning est dû
Schedule::command('backup:run')->hourly();

// Optimisation des index PostgreSQL — chaque lundi à 03h00
Schedule::command('db:optimize-indexes')->weeklyOn(1, '03:00');
