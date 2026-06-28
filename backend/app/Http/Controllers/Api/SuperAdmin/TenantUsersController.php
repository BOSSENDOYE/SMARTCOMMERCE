<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class TenantUsersController extends Controller
{
    /** GET /superadmin/tenants/{organization}/users */
    public function index(Organization $organization)
    {
        $storeIds = $organization->stores()->pluck('id');

        $users = User::with(['roles:name', 'store:id,name,code'])
            ->select(['id', 'name', 'email', 'is_active', 'store_id', 'organization_id', 'last_login_at', 'created_at'])
            ->whereIn('store_id', $storeIds)
            ->orderBy('name')
            ->get()
            ->map(fn($u) => array_merge($u->toArray(), [
                'role' => $u->roles->first()?->name,
            ]));

        $stores = $organization->stores()
            ->select(['id', 'name', 'code', 'is_active', 'is_central'])
            ->orderByDesc('is_central')
            ->orderBy('name')
            ->get();

        $roles = Role::orderBy('name')->pluck('name');

        return response()->json([
            'users'  => $users,
            'stores' => $stores,
            'roles'  => $roles,
        ]);
    }

    /** POST /superadmin/tenants/{organization}/users */
    public function store(Request $request, Organization $organization)
    {
        $storeIds = $organization->stores()->pluck('id')->toArray();

        $data = $request->validate([
            'name'      => 'required|string|max:100',
            'email'     => 'required|email|unique:users,email',
            'password'  => 'nullable|string|min:6',
            'role'      => 'required|string|exists:roles,name',
            'store_id'  => 'required|integer|in:' . implode(',', $storeIds ?: [-1]),
            'is_active' => 'boolean',
        ]);

        $password = $data['password'] ?? Str::random(10) . '!';

        $user = User::create([
            'name'            => $data['name'],
            'email'           => $data['email'],
            'password'        => Hash::make($password),
            'pin'             => Hash::make('0000'),
            'store_id'        => $data['store_id'],
            'organization_id' => $organization->id,
            'is_active'       => $data['is_active'] ?? true,
        ]);

        $user->assignRole($data['role']);
        $user->stores()->sync([$data['store_id']]);

        return response()->json(array_merge(
            $user->load(['roles:name', 'store:id,name,code'])->toArray(),
            [
                'role'              => $user->roles->first()?->name,
                'generated_password' => isset($data['password']) ? null : $password,
            ]
        ), 201);
    }

    /** PUT /superadmin/tenants/{organization}/users/{user} */
    public function update(Request $request, Organization $organization, User $user)
    {
        $storeIds = $organization->stores()->pluck('id')->toArray();

        $data = $request->validate([
            'name'      => 'sometimes|string|max:100',
            'email'     => 'sometimes|email|unique:users,email,' . $user->id,
            'password'  => 'nullable|string|min:6',
            'role'      => 'sometimes|string|exists:roles,name',
            'store_id'  => 'sometimes|integer|in:' . implode(',', $storeIds ?: [-1]),
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($data['password']) && $data['password']) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $role = $data['role'] ?? null;
        unset($data['role']);

        $user->update($data);

        if ($role) {
            $user->syncRoles([$role]);
        }

        if (isset($data['store_id'])) {
            $user->stores()->sync([$data['store_id']]);
        }

        return response()->json(array_merge(
            $user->load(['roles:name', 'store:id,name,code'])->toArray(),
            ['role' => $user->roles->first()?->name]
        ));
    }

    /** PATCH /superadmin/tenants/{organization}/users/{user}/toggle */
    public function toggle(Organization $organization, User $user)
    {
        $user->update(['is_active' => !$user->is_active]);
        return response()->json(['is_active' => $user->is_active]);
    }

    /** DELETE /superadmin/tenants/{organization}/users/{user} */
    public function destroy(Organization $organization, User $user)
    {
        $user->delete();
        return response()->json(null, 204);
    }
}
