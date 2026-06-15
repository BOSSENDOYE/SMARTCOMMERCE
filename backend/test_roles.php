<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(\Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Quick role test
try {
    $roles = \Spatie\Permission\Models\Role::withCount('users')->get();
    echo "Roles: " . $roles->map(fn($r) => $r->name)->implode(', ') . "\n";
} catch (\Exception $e) {
    echo "Role list error: " . $e->getMessage() . "\n";
}

// Quick dashboard test with timing
try {
    $user = \App\Models\User::where('email', 'admin@smartcommerce.sn')->first();
    echo "User store_id: " . $user->store_id . "\n";
    echo "User roles: " . $user->getRoleNames()->implode(',') . "\n";
    
    $ch = curl_init('http://localhost:8000/api/v1/dashboard');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $user->createToken('dbtest')->plainTextToken],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $start = microtime(true);
    $r = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $t = round(microtime(true) - $start, 2);
    curl_close($ch);
    echo "Dashboard: $code in ${t}s\n";
    if ($code >= 500) echo substr($r, 0, 200);
} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
