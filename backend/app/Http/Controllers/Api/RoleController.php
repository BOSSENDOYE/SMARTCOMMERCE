<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class RoleController extends Controller
{
    // Roles that cannot be deleted
    private const PROTECTED_ROLES = ['super_admin'];

    /** List all roles with their permissions and user count */
    public function index(Request $request)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin')
            && $request->user()->getOriginal('store_id') === null;

        $roles = Role::with('permissions:id,name')
            ->withCount('users')
            ->orderBy('name')
            ->get();

        if (! $isSuperAdmin) {
            $roles = $roles->where('name', '!=', 'super_admin')->values();
        }

        return response()->json($roles);
    }

    /** List all available permissions (grouped) */
    public function permissions()
    {
        $permissions = Permission::orderBy('name')->get(['id', 'name']);
        return response()->json($permissions);
    }

    /** Create a new custom role */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:50|unique:roles,name|regex:/^[a-z_]+$/',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'web']);

        if (! empty($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        return response()->json($role->load('permissions:id,name')->loadCount('users'), 201);
    }

    /** Update permissions assigned to a role */
    public function update(Request $request, Role $role)
    {
        $data = $request->validate([
            'permissions'   => 'required|array',
            'permissions.*' => 'string|exists:permissions,name',
            'name'          => 'sometimes|string|max:50|regex:/^[a-z_]+$/|unique:roles,name,' . $role->id,
        ]);

        // Rename if provided (only for non-protected roles)
        if (isset($data['name']) && ! in_array($role->name, self::PROTECTED_ROLES)) {
            $role->update(['name' => $data['name']]);
        }

        $role->syncPermissions($data['permissions']);

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        return response()->json($role->fresh()->load('permissions:id,name')->loadCount('users'));
    }

    /** Delete a role (only non-protected, non-assigned roles) */
    public function destroy(Role $role)
    {
        if (in_array($role->name, self::PROTECTED_ROLES)) {
            return response()->json(['message' => 'Ce rôle système ne peut pas être supprimé.'], 422);
        }

        if ($role->users()->count() > 0) {
            return response()->json([
                'message' => 'Ce rôle est assigné à ' . $role->users()->count() . ' utilisateur(s). Réassignez-les d\'abord.',
            ], 422);
        }

        $role->delete();

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        return response()->json(null, 204);
    }
}
