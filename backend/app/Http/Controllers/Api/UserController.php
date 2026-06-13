<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin') && $request->user()->getOriginal('store_id') === null;

        $query = User::with(['roles', 'store:id,name,code'])
            ->select(['id', 'name', 'email', 'is_active', 'store_id', 'last_login_at', 'created_at']);

        if ($isSuperAdmin) {
            // Super-admin: optionally filter by store
            $query->when($request->store_id, fn($q) => $q->where('store_id', $request->store_id));
        } else {
            // Regular user: only see users of their own store
            $query->where('store_id', $request->user()->store_id);
        }

        return response()->json($query->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin') && $request->user()->getOriginal('store_id') === null;

        $rules = [
            'name'     => 'required|string|max:100',
            'email'    => 'required|email|unique:users',
            'password' => 'required|string|min:8',
            'pin'      => 'required|string|size:4',
            'role'     => 'required|string|exists:roles,name',
        ];

        if ($isSuperAdmin) {
            $rules['store_id'] = 'required|exists:stores,id';
        }

        $data = $request->validate($rules);

        $storeId = $isSuperAdmin
            ? $data['store_id']
            : $request->user()->store_id;

        $user = User::create([
            'name'       => $data['name'],
            'email'      => $data['email'],
            'password'   => Hash::make($data['password']),
            'pin'        => Hash::make($data['pin']),
            'store_id'   => $storeId,
            'is_active'  => true,
        ]);
        $user->assignRole($data['role']);

        return response()->json($user->load(['roles', 'store:id,name,code']), 201);
    }

    public function update(Request $request, User $user)
    {
        $isSuperAdmin = $request->user()->hasRole('super_admin') && $request->user()->getOriginal('store_id') === null;

        $data = $request->validate([
            'name'       => 'sometimes|string',
            'is_active'  => 'sometimes|boolean',
            'role'       => 'sometimes|string|exists:roles,name',
            'password'   => 'nullable|string|min:8',
            'pin'        => 'nullable|string|size:4',
            'store_id'   => $isSuperAdmin ? 'sometimes|exists:stores,id' : 'prohibited',
        ]);

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        if (! empty($data['pin'])) {
            $data['pin'] = Hash::make($data['pin']);
        } else {
            unset($data['pin']);
        }
        if (! empty($data['role'])) {
            $user->syncRoles([$data['role']]);
            unset($data['role']);
        }

        $user->update($data);
        return response()->json($user->load(['roles', 'store:id,name,code']));
    }

    public function destroy(User $user)
    {
        if ($user->id === request()->user()->id) {
            return response()->json(['message' => 'Impossible de supprimer votre propre compte'], 422);
        }
        $user->delete();
        return response()->json(null, 204);
    }
}
