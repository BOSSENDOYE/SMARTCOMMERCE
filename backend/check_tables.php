<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$tables = ['tables', 'dining_areas', 'table_sessions', 'orders', 'order_items', 'restaurant_items', 'reservations'];
foreach ($tables as $t) {
    try {
        $cols = \Illuminate\Support\Facades\DB::select("PRAGMA table_info($t)");
        $exists = true;
    } catch (\Exception $e) {
        $exists = false;
    }
    if ($exists) {
        echo "=== $t ===\n";
        foreach ($cols as $c) echo "  {$c->name}\n";
    } else {
        echo "=== $t === NOT FOUND\n";
    }
    echo "\n";
}
