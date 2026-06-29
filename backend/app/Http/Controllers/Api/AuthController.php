<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Identifiants invalides.'], 401);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Compte désactivé.'], 403);
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('api-token')->plainTextToken;

        AuditService::log('login', 'users', $user->id);

        $user->load(['store', 'stores']);

        return response()->json([
            'user' => $user->only([
                'id', 'name', 'email', 'store_id', 'store',
                'is_active', 'last_login_at',
            ]) + [
                'roles'       => $user->getRoleNames(),
                'permissions' => $user->getAllPermissions()->pluck('name'),
                'stores'      => $user->stores->map(fn($s) => ['id' => $s->id, 'name' => $s->name, 'code' => $s->code]),
            ],
            'token' => $token,
        ]);
    }

    public function loginByPin(Request $request)
    {
        $request->validate([
            'store_id' => 'required|integer',
            'pin' => 'required|string|min:4|max:6',
        ]);

        $user = User::where('store_id', $request->store_id)
            ->where('is_active', true)
            ->get()
            ->first(fn(User $u) => Hash::check($request->pin, $u->pin ?? ''));

        if (!$user) {
            return response()->json(['message' => 'PIN invalide.'], 401);
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('pin-token', ['pos'], now()->addHours(12))->plainTextToken;

        AuditService::log('pin_login', 'users', $user->id);

        return response()->json([
            'user' => $user->only(['id', 'name', 'store_id']) + ['roles' => $user->getRoleNames()],
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        AuditService::log('logout', 'users', $request->user()->id);
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Déconnexion réussie.']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load(['store', 'stores']);
        return response()->json($user->only([
            'id', 'name', 'email', 'store_id', 'store', 'last_login_at',
        ]) + [
            'roles'       => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'stores'      => $user->stores->map(fn($s) => ['id' => $s->id, 'name' => $s->name, 'code' => $s->code]),
        ]);
    }

    public function switchStore(Request $request)
    {
        $data = $request->validate(['store_id' => 'required|integer|exists:stores,id']);
        $user    = $request->user();
        $storeId = (int) $data['store_id'];

        // Verify the user is actually assigned to this store
        $hasAccess = $user->stores()->where('stores.id', $storeId)->exists()
            || (int) $user->store_id === $storeId;

        if (!$hasAccess) {
            return response()->json(['message' => "Vous n'avez pas accès à ce magasin."], 403);
        }

        // Prevent switching to a store belonging to a different organization
        $targetOrgId = \App\Models\Store::where('id', $storeId)->value('organization_id');
        $userOrgId   = $user->organization_id
            ?? \App\Models\Store::where('id', $user->store_id)->value('organization_id');

        if ($targetOrgId && $userOrgId && (int) $targetOrgId !== (int) $userOrgId) {
            return response()->json(['message' => "Ce magasin n'appartient pas à votre organisation."], 403);
        }

        $user->update(['store_id' => $storeId]);
        $user->load(['store', 'stores']);

        AuditService::log('switch_store', 'stores', $storeId);

        return response()->json($user->only([
            'id', 'name', 'email', 'store_id', 'store', 'last_login_at',
        ]) + [
            'roles'       => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'stores'      => $user->stores->map(fn($s) => ['id' => $s->id, 'name' => $s->name, 'code' => $s->code]),
        ]);
    }
}
