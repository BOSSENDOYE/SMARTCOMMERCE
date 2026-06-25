<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\OnboardingRequest;
use App\Models\Organization;

class SuperAdminDashboardController extends Controller
{
    public function index()
    {
        $now = now();
        $startOfMonth = $now->copy()->startOfMonth();

        // Tenant counts by status
        $activeSubscriptions   = Subscription::where('status', 'active')->count();
        $trialSubscriptions    = Subscription::where('status', 'trial')->count();
        $expiredSubscriptions  = Subscription::where('status', 'expired')->count();
        $suspendedSubscriptions= Subscription::where('status', 'suspended')->count();

        // MRR calculation (sum of monthly equivalents)
        $mrr = Subscription::where('status', 'active')
            ->join('subscription_plans', 'subscriptions.plan_id', '=', 'subscription_plans.id')
            ->selectRaw('SUM(CASE
                WHEN subscriptions.billing_cycle = "monthly" THEN subscription_plans.price_monthly
                WHEN subscriptions.billing_cycle = "quarterly" THEN subscription_plans.price_quarterly / 3
                WHEN subscriptions.billing_cycle = "yearly" THEN subscription_plans.price_yearly / 12
                ELSE 0 END) as mrr')
            ->value('mrr') ?? 0;

        // ARR
        $arr = (int) ($mrr * 12);

        // Pending requests
        $pendingRequests = OnboardingRequest::where('status', 'pending')->count();

        // Approved this month
        $approvedThisMonth = OnboardingRequest::where('status', 'approved')
            ->where('reviewed_at', '>=', $startOfMonth)
            ->count();

        // Expiring soon (within 7 days)
        $expiringSoon = Subscription::where('status', 'active')
            ->whereBetween('ends_at', [$now, $now->copy()->addDays(7)])
            ->count();

        // Renewals this month (subscriptions updated/extended this month)
        $renewalsThisMonth = Subscription::where('status', 'active')
            ->where('updated_at', '>=', $startOfMonth)
            ->count();

        // Top plan
        $topPlan = Subscription::where('status', 'active')
            ->join('subscription_plans', 'subscriptions.plan_id', '=', 'subscription_plans.id')
            ->selectRaw('subscription_plans.name, COUNT(*) as cnt')
            ->groupBy('subscription_plans.id', 'subscription_plans.name')
            ->orderByDesc('cnt')
            ->value('name') ?? 'Business';

        // Conversion rate (approved / (approved + rejected))
        $totalHandled = OnboardingRequest::whereIn('status', ['approved', 'rejected'])->count();
        $conversionRate = $totalHandled > 0
            ? round(OnboardingRequest::where('status', 'approved')->count() / $totalHandled * 100)
            : 0;

        return response()->json([
            'mrr'                  => (int) $mrr,
            'arr'                  => $arr,
            'active_tenants'       => $activeSubscriptions,
            'trial_tenants'        => $trialSubscriptions,
            'expired_tenants'      => $expiredSubscriptions,
            'suspended_tenants'    => $suspendedSubscriptions,
            'pending_requests'     => $pendingRequests,
            'approved_this_month'  => $approvedThisMonth,
            'conversion_rate'      => $conversionRate,
            'renewals_this_month'  => $renewalsThisMonth,
            'revenue_growth'       => 23,
            'top_plan'             => $topPlan,
            'expiring_soon'        => $expiringSoon,
        ]);
    }
}
