<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPlan;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class PlansController extends Controller
{
    public function index()
    {
        return response()->json(SubscriptionPlan::orderBy('sort_order')->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $plan = SubscriptionPlan::create($data);

        PlatformAuditLog::record('plan.created', $request->user()->id, 'SubscriptionPlan', $plan->id);

        return response()->json($plan, 201);
    }

    public function show(SubscriptionPlan $plan)
    {
        return response()->json($plan->loadCount('subscriptions'));
    }

    public function update(Request $request, SubscriptionPlan $plan)
    {
        $data = $this->validated($request);
        $plan->update($data);

        PlatformAuditLog::record('plan.updated', $request->user()->id, 'SubscriptionPlan', $plan->id);

        return response()->json($plan);
    }

    public function destroy(Request $request, SubscriptionPlan $plan)
    {
        if ($plan->subscriptions()->whereIn('status', ['trial', 'active'])->exists()) {
            return response()->json(['message' => 'Impossible de supprimer un plan avec des abonnements actifs'], 422);
        }

        PlatformAuditLog::record('plan.deleted', $request->user()->id, 'SubscriptionPlan', $plan->id, ['name' => $plan->name]);

        $plan->delete();

        return response()->json(['message' => 'Plan supprimé']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name'               => 'required|string|max:100',
            'slug'               => 'required|string|max:50|alpha_dash',
            'description'        => 'nullable|string|max:500',
            'max_stores'         => 'required|integer|min:-1',
            'max_users'          => 'required|integer|min:-1',
            'features'           => 'required|array',
            'features.*'         => 'string',
            'price_monthly'      => 'required|integer|min:0',
            'price_quarterly'    => 'required|integer|min:0',
            'price_yearly'       => 'required|integer|min:0',
            'trial_days'         => 'required|integer|min:0',
            'grace_period_days'  => 'required|integer|min:0',
            'is_active'          => 'boolean',
            'sort_order'         => 'integer|min:0',
        ]);
    }
}
