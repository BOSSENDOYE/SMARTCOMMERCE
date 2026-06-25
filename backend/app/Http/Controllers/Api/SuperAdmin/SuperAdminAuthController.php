<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\SuperAdmin;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class SuperAdminAuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        $admin = SuperAdmin::where('email', $data['email'])->first();

        if (! $admin || ! Hash::check($data['password'], $admin->password)) {
            return response()->json(['message' => 'Identifiants invalides'], 401);
        }

        if (! $admin->is_active) {
            return response()->json(['message' => 'Compte désactivé'], 403);
        }

        $admin->update(['last_login_at' => now()]);
        $token = $admin->createToken('superadmin-token')->plainTextToken;

        PlatformAuditLog::record('superadmin.login', $admin->id, 'SuperAdmin', $admin->id);

        return response()->json([
            'admin' => $admin->only(['id', 'name', 'email', 'role', 'last_login_at']),
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Déconnecté']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->only(['id', 'name', 'email', 'role', 'last_login_at']));
    }
}
