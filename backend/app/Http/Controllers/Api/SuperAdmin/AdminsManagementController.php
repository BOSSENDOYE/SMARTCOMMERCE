<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\SuperAdmin;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class AdminsManagementController extends Controller
{
    public function index()
    {
        return response()->json(SuperAdmin::orderByDesc('created_at')->get([
            'id', 'name', 'email', 'role', 'is_active', 'last_login_at', 'created_at',
        ]));
    }

    public function store(Request $request)
    {
        $this->requireSuperAdmin($request);

        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:super_admins,email',
            'password' => 'required|string|min:8',
            'role'     => 'required|in:super_admin,support,billing',
            'is_active' => 'boolean',
        ]);

        $admin = SuperAdmin::create($data);

        PlatformAuditLog::record('admin.created', $request->user()->id, 'SuperAdmin', $admin->id, ['email' => $admin->email]);

        return response()->json($admin->only(['id', 'name', 'email', 'role', 'is_active', 'created_at']), 201);
    }

    public function update(Request $request, SuperAdmin $admin)
    {
        $this->requireSuperAdmin($request);

        $data = $request->validate([
            'name'     => 'sometimes|string|max:255',
            'email'    => 'sometimes|email|unique:super_admins,email,' . $admin->id,
            'password' => 'sometimes|nullable|string|min:8',
            'role'     => 'sometimes|in:super_admin,support,billing',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($data['password']) && ! $data['password']) {
            unset($data['password']);
        }

        $admin->update($data);

        PlatformAuditLog::record('admin.updated', $request->user()->id, 'SuperAdmin', $admin->id);

        return response()->json($admin->only(['id', 'name', 'email', 'role', 'is_active', 'last_login_at', 'created_at']));
    }

    public function toggleActive(Request $request, SuperAdmin $admin)
    {
        $this->requireSuperAdmin($request);

        if ($admin->id === $request->user()->id) {
            return response()->json(['message' => 'Impossible de désactiver votre propre compte'], 422);
        }

        $admin->update(['is_active' => ! $admin->is_active]);

        PlatformAuditLog::record(
            $admin->is_active ? 'admin.activated' : 'admin.deactivated',
            $request->user()->id,
            'SuperAdmin',
            $admin->id
        );

        return response()->json(['message' => $admin->is_active ? 'Compte activé' : 'Compte désactivé', 'is_active' => $admin->is_active]);
    }

    private function requireSuperAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'super_admin') {
            abort(403, 'Réservé aux super administrateurs');
        }
    }
}
