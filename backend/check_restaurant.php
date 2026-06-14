<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Check restaurant_tables schema
echo "=== restaurant_tables ===\n";
$cols = \Illuminate\Support\Facades\DB::select("PRAGMA table_info(restaurant_tables)");
foreach ($cols as $c) echo "  {$c->name}\n";

echo "\n=== dining_areas ===\n";
$cols = \Illuminate\Support\Facades\DB::select("PRAGMA table_info(dining_areas)");
foreach ($cols as $c) echo "  {$c->name}\n";

// Check which controller handles floor-plan
echo "\n=== floor-plan route ===\n";
$route = \Illuminate\Support\Facades\Route::getRoutes()->match(
    \Illuminate\Http\Request::create('GET', '/api/v1/restaurant/floor-plan')
);
echo "Action: " . $route->getActionName() . "\n";
