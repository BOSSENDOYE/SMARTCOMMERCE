<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Subscription;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class TenantsController extends Controller
{
    public function index()
    {
        $tenants = Organization::with(['subscription.plan'])
            ->withCount(['stores', 'users'])
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($tenants->through(fn ($org) => [
            'id'             => $org->id,
            'name'           => $org->name,
            'slug'           => $org->slug,
            'email'          => $org->email,
            'phone'          => $org->phone,
            'city'           => $org->city,
            'country'        => $org->country,
            'is_active'      => $org->is_active,
            'stores_count'   => $org->stores_count,
            'users_count'    => $org->users_count,
            'subscription'   => $org->subscription ? [
                'plan_name'  => $org->subscription->plan?->name,
                'plan_slug'  => $org->subscription->plan?->slug,
                'status'     => $org->subscription->status,
                'starts_at'  => $org->subscription->starts_at,
                'ends_at'    => $org->subscription->ends_at,
                'grace_ends_at' => $org->subscription->grace_ends_at,
            ] : null,
            'created_at'     => $org->created_at,
        ]));
    }

    public function show(Organization $organization)
    {
        $organization->load(['subscription.plan', 'stores', 'users']);
        return response()->json($organization);
    }

    public function activate(Request $request, Organization $organization)
    {
        $organization->update(['is_active' => true]);
        if ($organization->subscription && $organization->subscription->status === 'suspended') {
            $organization->subscription->update(['status' => 'active']);
        }

        PlatformAuditLog::record('tenant.activated', $request->user()->id, 'Organization', $organization->id);

        return response()->json(['message' => 'Organisation activée']);
    }

    public function suspend(Request $request, Organization $organization)
    {
        $organization->update(['is_active' => false]);
        if ($organization->subscription) {
            $organization->subscription->update(['status' => 'suspended']);
        }

        PlatformAuditLog::record('tenant.suspended', $request->user()->id, 'Organization', $organization->id);

        return response()->json(['message' => 'Organisation suspendue']);
    }

    public function extend(Request $request, Organization $organization)
    {
        $data = $request->validate(['days' => 'required|integer|min:1|max:365']);

        $subscription = $organization->subscription;
        if (! $subscription) {
            return response()->json(['message' => 'Aucun abonnement trouvé'], 404);
        }

        $subscription->extendDays($data['days']);

        PlatformAuditLog::record('tenant.extended', $request->user()->id, 'Organization', $organization->id, ['days' => $data['days']]);

        return response()->json(['message' => "Licence prolongée de {$data['days']} jours"]);
    }

    public function impersonate(Request $request, Organization $organization)
    {
        // Find the admin user of this organization
        $adminUser = $organization->users()
            ->whereHas('roles', fn ($q) => $q->where('name', 'admin'))
            ->first();

        if (! $adminUser) {
            return response()->json(['message' => 'Aucun admin trouvé pour cette organisation'], 404);
        }

        PlatformAuditLog::record('tenant.impersonated', $request->user()->id, 'Organization', $organization->id);

        $token = $adminUser->createToken('impersonation-' . now()->timestamp)->plainTextToken;

        return response()->json([
            'user'  => $adminUser->only(['id', 'name', 'email']),
            'token' => $token,
        ]);
    }
}
