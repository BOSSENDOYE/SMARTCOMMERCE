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

        return response()->json([
            'user' => $user->load('store')->only([
                'id', 'name', 'email', 'store_id', 'store',
                'is_active', 'last_login_at',
            ]) + ['roles' => $user->getRoleNames(), 'permissions' => $user->getAllPermissions()->pluck('name')],
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
        $user = $request->user()->load('store');
        return response()->json($user->only([
            'id', 'name', 'email', 'store_id', 'store', 'last_login_at',
        ]) + [
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
        ]);
    }
}
