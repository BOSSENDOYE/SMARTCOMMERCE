<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlatformAuditLog extends Model
{
    protected $fillable = [
        'super_admin_id', 'action', 'target_type', 'target_id', 'metadata', 'ip_address',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function superAdmin(): BelongsTo
    {
        return $this->belongsTo(SuperAdmin::class, 'super_admin_id');
    }

    public static function record(string $action, ?int $adminId, string $targetType = null, int $targetId = null, array $metadata = []): void
    {
        static::create([
            'super_admin_id' => $adminId,
            'action'         => $action,
            'target_type'    => $targetType,
            'target_id'      => $targetId,
            'metadata'       => $metadata ?: null,
            'ip_address'     => request()->ip(),
        ]);
    }
}
