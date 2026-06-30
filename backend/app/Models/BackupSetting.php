<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupSetting extends Model
{
    protected $fillable = [
        'schedule', 'schedule_time', 'schedule_day', 'retention_count',
        'drive_enabled', 'drive_folder_id', 'drive_credentials',
        'pg_dump_path', 'last_run_at',
    ];

    protected $casts = [
        'drive_enabled'    => 'boolean',
        'drive_credentials' => 'encrypted',
        'last_run_at'      => 'datetime',
        'schedule_day'     => 'integer',
        'retention_count'  => 'integer',
    ];

    public static function instance(): self
    {
        return self::firstOrCreate([], [
            'schedule'         => 'daily',
            'schedule_time'    => '02:00',
            'schedule_day'     => 1,
            'retention_count'  => 7,
            'drive_enabled'    => false,
        ]);
    }

    public function shouldRunNow(): bool
    {
        if ($this->schedule === 'never') return false;

        $now  = now();
        [$configHour, $configMin] = explode(':', $this->schedule_time);

        if ((int) $configHour !== $now->hour) return false;

        // Already ran this cycle?
        $lastRun = $this->last_run_at;

        return match ($this->schedule) {
            'daily'   => !$lastRun || $lastRun->lt($now->copy()->startOfDay()),
            'weekly'  => $now->dayOfWeek === ($this->schedule_day % 7)
                            && (!$lastRun || $lastRun->lt($now->copy()->startOfWeek())),
            'monthly' => $now->day === $this->schedule_day
                            && (!$lastRun || $lastRun->lt($now->copy()->startOfMonth())),
            default   => false,
        };
    }

    public function nextRunAt(): ?string
    {
        if ($this->schedule === 'never') return null;

        [$h, $m] = explode(':', $this->schedule_time);
        $now = now();

        $candidate = match ($this->schedule) {
            'daily'   => $now->copy()->setHour((int)$h)->setMinute((int)$m)->setSecond(0),
            'weekly'  => $now->copy()->next($this->schedule_day % 7)->setHour((int)$h)->setMinute((int)$m)->setSecond(0),
            'monthly' => $now->copy()->day($this->schedule_day)->setHour((int)$h)->setMinute((int)$m)->setSecond(0),
            default   => null,
        };

        if ($candidate && $candidate->isPast()) {
            $candidate->addDay();
        }

        return $candidate?->toIso8601String();
    }
}
