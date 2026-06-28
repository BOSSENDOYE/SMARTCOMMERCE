<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $user  = $request->user();
        $orgId = $user->store?->organization_id ?? $user->organization_id;

        $query = User::with(['roles', 'store:id,name,code', 'stores:id,name,code'])
            ->select(['id', 'name', 'email', 'is_active', 'store_id', 'last_login_at', 'created_at']);

        if ($orgId) {
            $storeIds = Store::where('organization_id', $orgId)->pluck('id');
            $query->whereIn('store_id', $storeIds);
        } else {
            $query->where('store_id', $user->store_id ?? -1);
        }

        return response()->json($query->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin');

        $rules = [
            'name'        => 'required|string|max:100',
            'email'       => 'required|email|unique:users',
            'password'    => 'required|string|min:8',
            'pin'         => 'required|string|size:4',
            'role'        => 'required|string|exists:roles,name',
            'store_id'    => 'required|exists:stores,id',
            'store_ids'   => 'required|array|min:1',
            'store_ids.*' => 'exists:stores,id',
        ];

        // Non-super-admin: force store_id to their own store
        if (!$isSuperAdmin) {
            unset($rules['store_id'], $rules['store_ids'], $rules['store_ids.*']);
        }

        $data = $request->validate($rules);

        if ($isSuperAdmin) {
            $defaultStoreId = (int) $data['store_id'];
            $storeIds       = array_map('intval', $data['store_ids']);
            // Default store must be among assigned stores
            if (!in_array($defaultStoreId, $storeIds, true)) {
                return response()->json([
                    'message' => 'Le magasin par défaut doit faire partie des magasins assignés.',
                    'errors'  => ['store_id' => ['Le magasin par défaut doit être dans la liste des magasins assignés.']],
                ], 422);
            }
        } else {
            $defaultStoreId = $request->user()->store_id;
            $storeIds       = [$defaultStoreId];
        }

        $user = User::create([
            'name'            => $data['name'],
            'email'           => $data['email'],
            'password'        => Hash::make($data['password']),
            'pin'             => Hash::make($data['pin']),
            'store_id'        => $defaultStoreId,
            'organization_id' => Store::find($defaultStoreId)?->organization_id,
            'is_active'       => true,
        ]);
        $user->assignRole($data['role']);
        $user->stores()->sync($storeIds);

        return response()->json($user->load(['roles', 'store:id,name,code', 'stores:id,name,code']), 201);
    }

    public function update(Request $request, User $user)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin');

        $data = $request->validate([
            'name'        => 'sometimes|string',
            'is_active'   => 'sometimes|boolean',
            'role'        => 'sometimes|string|exists:roles,name',
            'password'    => 'nullable|string|min:8',
            'pin'         => 'nullable|string|size:4',
            'store_id'    => $isSuperAdmin ? 'sometimes|exists:stores,id' : 'prohibited',
            'store_ids'   => $isSuperAdmin ? 'sometimes|array|min:1' : 'prohibited',
            'store_ids.*' => 'exists:stores,id',
        ]);

        if (!empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        if (!empty($data['pin'])) {
            $data['pin'] = Hash::make($data['pin']);
        } else {
            unset($data['pin']);
        }
        if (!empty($data['role'])) {
            $user->syncRoles([$data['role']]);
            unset($data['role']);
        }

        // Sync stores if provided
        if ($isSuperAdmin && isset($data['store_ids'])) {
            $storeIds = array_map('intval', $data['store_ids']);
            $defaultStoreId = isset($data['store_id']) ? (int) $data['store_id'] : (int) $user->store_id;

            if (!in_array($defaultStoreId, $storeIds, true)) {
                return response()->json([
                    'message' => 'Le magasin par défaut doit faire partie des magasins assignés.',
                    'errors'  => ['store_id' => ['Le magasin par défaut doit être dans la liste des magasins assignés.']],
                ], 422);
            }

            $user->stores()->sync($storeIds);
            unset($data['store_ids']);
        }

        $user->update($data);
        return response()->json($user->load(['roles', 'store:id,name,code', 'stores:id,name,code']));
    }

    public function destroy(User $user)
    {
        if ($user->id === request()->user()->id) {
            return response()->json(['message' => 'Impossible de supprimer votre propre compte'], 422);
        }
        $user->delete();
        return response()->json(null, 204);
    }

    /** List available roles (excluding super_admin unless caller is super_admin) */
    public function roles(Request $request)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin');

        $roles = \Spatie\Permission\Models\Role::withCount('permissions')
            ->orderBy('name')
            ->get(['id', 'name', 'guard_name']);

        if (!$isSuperAdmin) {
            $roles = $roles->where('name', '!=', 'super_admin')->values();
        }

        return response()->json($roles);
    }

    /** Update own profile (name, password, pin) */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name'     => 'sometimes|string|max:100',
            'password' => 'nullable|string|min:8|confirmed',
            'pin'      => 'nullable|string|size:4',
        ]);

        if (!empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        if (!empty($data['pin'])) {
            $data['pin'] = Hash::make($data['pin']);
        } else {
            unset($data['pin']);
        }

        $user->update($data);
        return response()->json($user->load('roles'));
    }
}
