<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckLicenseExpiry
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }

        $subscription = $user->store?->organization?->subscription;

        // Pas encore d'abonnement (compte en cours de config) → on laisse passer
        if (! $subscription) {
            return $next($request);
        }

        if ($subscription->status === 'cancelled') {
            return response()->json(['message' => 'Votre abonnement a été résilié. Contactez le support.'], 403);
        }

        if ($subscription->status === 'suspended') {
            return response()->json(['message' => 'Votre compte est suspendu. Contactez le support.'], 403);
        }

        // Licence expirée ET période de grâce dépassée
        if ($subscription->ends_at->isPast()) {
            $gracePast = ! $subscription->grace_ends_at || $subscription->grace_ends_at->isPast();
            if ($gracePast) {
                return response()->json([
                    'message'         => 'Votre licence a expiré. Veuillez renouveler votre abonnement.',
                    'expired_at'      => $subscription->ends_at?->toIso8601String(),
                    'grace_ended_at'  => $subscription->grace_ends_at?->toIso8601String(),
                ], 403);
            }
            // En période de grâce — accès lecture seule autorisé, header de warning
            $request->attributes->set('license_grace', true);
        }

        return $next($request);
    }
}
