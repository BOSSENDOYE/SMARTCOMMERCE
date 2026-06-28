<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Replace invalid UTF-8 bytes with the Unicode replacement character instead
 * of letting json_encode() throw a JsonEncodingException.
 *
 * Root cause: some text fields (store name, address, …) were persisted with
 * Windows-1252 / Latin-1 encoding while the DB connection expected UTF-8.
 * Until the data is cleaned up, this middleware keeps the API usable.
 */
class SanitizeJsonResponse
{
    public function handle(Request $request, Closure $next): mixed
    {
        $response = $next($request);

        if ($response instanceof JsonResponse) {
            $response->setEncodingOptions(
                ($response->getEncodingOptions() & ~JSON_THROW_ON_ERROR)
                | JSON_INVALID_UTF8_SUBSTITUTE
            );
        }

        return $response;
    }
}
