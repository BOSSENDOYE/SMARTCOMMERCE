<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class LicencesController extends Controller
{
    public function index()
    {
        $licences = Subscription::with(['organization:id,name', 'plan:id,name,slug,grace_period_days'])
            ->orderBy('ends_at')
            ->paginate(100);

        return response()->json($licences->through(fn ($sub) => [
            'id'                   => $sub->id,
            'organization_id'      => $sub->organization_id,
            'organization_name'    => $sub->organization?->name,
            'plan_name'            => $sub->plan?->name,
            'plan_slug'            => $sub->plan?->slug,
            'status'               => $sub->status,
            'billing_cycle'        => $sub->billing_cycle,
            'starts_at'            => $sub->starts_at,
            'ends_at'              => $sub->ends_at,
            'grace_ends_at'        => $sub->grace_ends_at,
            'trial_ends_at'        => $sub->trial_ends_at,
            'max_stores_override'  => $sub->max_stores_override,
            'max_users_override'   => $sub->max_users_override,
        ]));
    }

    public function extend(Request $request, Subscription $subscription)
    {
        $data = $request->validate(['days' => 'required|integer|min:1|max:365']);

        $subscription->extendDays($data['days']);

        PlatformAuditLog::record(
            'licence.extended',
            $request->user()->id,
            'Subscription',
            $subscription->id,
            ['days' => $data['days'], 'new_ends_at' => $subscription->ends_at->toDateString()]
        );

        return response()->json([
            'message'  => "Licence prolongée de {$data['days']} jours",
            'ends_at'  => $subscription->ends_at,
        ]);
    }
}
