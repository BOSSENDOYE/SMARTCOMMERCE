<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Test role withCount
try {
    $roles = \Spatie\Permission\Models\Role::withCount('users')->get();
    echo "Roles:\n";
    foreach ($roles as $r) {
        echo "  {$r->name} ({$r->users_count} users)\n";
    }
} catch (\Exception $e) {
    echo "Role error: " . $e->getMessage() . "\n";
}

// Test dashboard
try {
    $user = \App\Models\User::where('email', 'admin@smartcommerce.sn')->first();
    $token = $user->createToken('quick-test')->plainTextToken;
    $http = \Illuminate\Support\Facades\Http::withToken($token);
    $r = $http->get('http://localhost:8000/api/v1/dashboard');
    echo "\nDashboard status: " . $r->status() . "\n";
    if ($r->successful()) {
        echo "OK\n";
    } else {
        echo substr($r->body(), 0, 300) . "\n";
    }
} catch (\Exception $e) {
    echo "Dashboard error: " . $e->getMessage() . "\n";
}

// Test store_transfers schema
echo "\n=== store_transfers FK ===\n";
$fks = \Illuminate\Support\Facades\DB::select("PRAGMA foreign_key_list(store_transfers)");
foreach ($fks as $fk) {
    echo "  {$fk->from} -> {$fk->table}.{$fk->to}\n";
}
