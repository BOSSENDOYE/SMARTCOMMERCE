<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SetTenantSchema
{
    public function handle(Request $request, Closure $next)
    {
        $storeId = $request->header('X-Store-Id')
            ?? $request->user()?->store_id;

        if ($storeId && config('database.default') === 'pgsql') {
            $schema = 'tenant_' . (int) $storeId;
            DB::statement("SET search_path TO {$schema}, public");
        }

        return $next($request);
    }
}
