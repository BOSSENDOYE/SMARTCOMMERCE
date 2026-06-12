<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditService
{
    public static function log(
        string $action,
        string $modelType = null,
        int $modelId = null,
        array $newValues = null,
        array $oldValues = null,
        string $notes = null
    ): void {
        AuditLog::create([
            'user_id' => Auth::id(),
            'store_id' => Auth::user()?->store_id,
            'action' => $action,
            'model_type' => $modelType,
            'model_id' => $modelId,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
            'workstation' => Request::header('X-Workstation'),
            'notes' => $notes,
        ]);
    }
}
