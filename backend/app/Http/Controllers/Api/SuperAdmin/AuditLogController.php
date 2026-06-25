<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $logs = PlatformAuditLog::with('superAdmin:id,name,email')
            ->when($request->action, fn ($q) => $q->where('action', $request->action))
            ->when($request->admin_id, fn ($q) => $q->where('super_admin_id', $request->admin_id))
            ->when($request->date_from, fn ($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to, fn ($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->orderByDesc('created_at')
            ->paginate((int) ($request->per_page ?? 50));

        return response()->json([
            'data' => $logs->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'target_type' => $log->target_type,
                'target_id'   => $log->target_id,
                'metadata'    => $log->metadata,
                'ip_address'  => $log->ip_address,
                'created_at'  => $log->created_at,
                'super_admin' => $log->superAdmin ? [
                    'id'    => $log->superAdmin->id,
                    'name'  => $log->superAdmin->name,
                    'email' => $log->superAdmin->email,
                ] : null,
            ]),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'total'        => $logs->total(),
                'per_page'     => $logs->perPage(),
            ],
        ]);
    }
}
