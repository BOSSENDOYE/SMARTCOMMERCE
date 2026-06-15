<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        $newPerms = ['manage_crm', 'manage_invoices', 'manage_expenses'];

        foreach ($newPerms as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        // Accorder les nouvelles permissions aux rôles appropriés
        $grantMap = [
            'super_admin'  => $newPerms,
            'gerant'       => $newPerms,
            'caissier'     => ['manage_invoices'],
            'comptable'    => ['manage_expenses'],
            'proprietaire' => ['manage_expenses'],
        ];

        foreach ($grantMap as $roleName => $perms) {
            $role = Role::where('name', $roleName)->first();
            if ($role) {
                $role->givePermissionTo($perms);
            }
        }

        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
    }

    public function down(): void
    {
        $perms = ['manage_crm', 'manage_invoices', 'manage_expenses'];
        Permission::whereIn('name', $perms)->delete();
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();
    }
};
