<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Middleware that injects the correct store_id for super-admin users.
 *
 * Regular users already have store_id on their user record.
 * Super-admin users (store_id = null) can send X-Store-Id header
 * to scope their requests to a specific store.
 *
 * This middleware temporarily sets store_id on the in-memory user object
 * so all existing controllers work without modification.
 */
class ResolveStoreContext
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();

        if ($user && $user->store_id === null) {
            $xStoreId = $request->header('X-Store-Id');
            if ($xStoreId && is_numeric($xStoreId)) {
                // Temporarily set store_id on the in-memory model (not persisted)
                $user->store_id = (int) $xStoreId;
            }
        }

        return $next($request);
    }
}
