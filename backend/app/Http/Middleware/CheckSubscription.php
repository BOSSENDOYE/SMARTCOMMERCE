<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckSubscription
{
    /**
     * Usage: middleware('subscription:pos_sales,stock_inventory')
     * Bloque l'accès si le plan ne contient pas la feature requise.
     */
    public function handle(Request $request, Closure $next, string ...$features): mixed
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }

        $subscription = $user->store?->organization?->subscription;

        if (! $subscription) {
            return response()->json(['message' => 'Aucun abonnement actif.'], 403);
        }

        if (! $subscription->isActive()) {
            return response()->json(['message' => 'Abonnement inactif ou expiré.'], 403);
        }

        foreach ($features as $feature) {
            if (! $subscription->hasFeature($feature)) {
                return response()->json([
                    'message'          => "La fonctionnalité « {$feature} » n'est pas incluse dans votre plan {$subscription->plan?->name}.",
                    'feature'          => $feature,
                    'current_plan'     => $subscription->plan?->slug,
                    'upgrade_required' => true,
                ], 403);
            }
        }

        return $next($request);
    }
}
