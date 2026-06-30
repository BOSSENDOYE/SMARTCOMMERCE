<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupLog extends Model
{
    protected $fillable = [
        'filename', 'size_bytes', 'status', 'destinations', 'error_message', 'duration_seconds',
    ];

    protected $casts = [
        'destinations' => 'array',
        'size_bytes'   => 'integer',
    ];

    public function getSizeHumanAttribute(): string
    {
        $bytes = (int) $this->size_bytes;
        if ($bytes >= 1_073_741_824) return round($bytes / 1_073_741_824, 2) . ' GB';
        if ($bytes >= 1_048_576)     return round($bytes / 1_048_576, 2)     . ' MB';
        if ($bytes >= 1024)          return round($bytes / 1024, 2)           . ' KB';
        return $bytes . ' B';
    }

    public function getLocalPathAttribute(): string
    {
        return storage_path('app/backups/' . $this->filename);
    }

    public function fileExists(): bool
    {
        return file_exists($this->local_path);
    }

    protected $appends = ['size_human'];
}
