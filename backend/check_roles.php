<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$roles = \Spatie\Permission\Models\Role::all();
echo "Total roles: " . $roles->count() . "\n";
foreach ($roles as $r) {
    echo "  {$r->name} (guard: {$r->guard_name})\n";
}

// Check if super_admin exists
$sa = \Spatie\Permission\Models\Role::where('name', 'super_admin')->first();
echo "\nsuper_admin exists: " . ($sa ? 'yes' : 'no') . "\n";
