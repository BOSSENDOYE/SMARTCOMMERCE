<?php

namespace Database\Seeders;

use App\Models\Store;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class SetupSeeder extends Seeder
{
    public function run(): void
    {
        // ── Permissions ─────────────────────────────────────────────────────
        $permissions = [
            'view_dashboard', 'view_reports', 'view_margins',
            'create_sales', 'cancel_sales', 'apply_discounts', 'apply_discount_over_limit',
            'manage_products', 'manage_categories', 'import_export',
            'manage_suppliers', 'create_purchase_orders', 'validate_purchases',
            'view_stock', 'adjust_stock', 'manage_inventory',
            'manage_clients', 'manage_loyalty',
            'manage_promotions',
            'open_cash_drawer', 'manage_cash_sessions', 'view_cash_reports',
            'manage_users', 'manage_roles', 'view_audit_logs',
            'manage_stores', 'manage_settings',
            'restaurant_orders', 'restaurant_kds', 'restaurant_reservations',
            'manage_losses', 'validate_losses',
            'manage_transfers',
            'view_accounting', 'manage_accounting',
            'manage_crm', 'manage_invoices', 'manage_expenses',
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        // ── Roles ────────────────────────────────────────────────────────────
        $roleMap = [
            'super_admin' => $permissions,
            'gerant' => [
                'view_dashboard', 'view_reports', 'view_margins',
                'create_sales', 'cancel_sales', 'apply_discounts', 'apply_discount_over_limit',
                'manage_products', 'manage_categories',
                'manage_suppliers', 'create_purchase_orders', 'validate_purchases',
                'view_stock', 'adjust_stock', 'manage_inventory',
                'manage_clients', 'manage_loyalty', 'manage_promotions',
                'open_cash_drawer', 'manage_cash_sessions', 'view_cash_reports',
                'manage_users', 'view_audit_logs',
                'restaurant_orders', 'restaurant_kds', 'restaurant_reservations',
                'manage_losses', 'validate_losses', 'manage_transfers',
                'view_accounting', 'manage_accounting',
                'manage_crm', 'manage_invoices', 'manage_expenses',
            ],
            'caissier'    => ['create_sales', 'apply_discounts', 'manage_clients', 'manage_invoices', 'open_cash_drawer', 'manage_cash_sessions'],
            'serveur'     => ['restaurant_orders'],
            'cuisinier'   => ['restaurant_kds'],
            'magasinier'  => ['view_stock', 'manage_inventory', 'manage_losses', 'create_purchase_orders'],
            'comptable'   => ['view_dashboard', 'view_reports', 'view_margins', 'view_cash_reports', 'view_audit_logs', 'view_accounting', 'manage_accounting', 'manage_expenses'],
            'proprietaire' => ['view_dashboard', 'view_reports', 'view_margins', 'view_cash_reports', 'view_accounting', 'manage_expenses'],
        ];

        foreach ($roleMap as $roleName => $rolePermissions) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($rolePermissions);
        }

        // ── Store ────────────────────────────────────────────────────────────
        $store = Store::firstOrCreate(['code' => 'MAIN'], [
            'name'                  => 'SmartCommerce Dakar',
            'address'               => 'Rue 10 × 19, Dakar Plateau, Sénégal',
            'phone'                 => '+221 33 821 00 00',
            'email'                 => 'contact@smartcommerce.sn',
            'ninea'                 => '007123456',
            'rc'                    => 'SN-DKR-2024-B-00123',
            'currency'              => 'XOF',
            'timezone'              => 'Africa/Dakar',
            'license_grande_surface' => true,
            'license_restaurant'    => true,
            'receipt_footer'        => 'Merci de votre confiance ! SmartCommerce Dakar — +221 33 821 00 00',
            'is_active'             => true,
            'is_central'            => true,
        ]);

        // ── Users ────────────────────────────────────────────────────────────
        $users = [
            ['name' => 'Super Administrateur', 'email' => 'admin@smartcommerce.sn',    'password' => 'Admin@2026!',    'pin' => '1234', 'role' => 'super_admin'],
            ['name' => 'Ibrahima Diallo',       'email' => 'gerant@smartcommerce.sn',   'password' => 'Gerant@2026!',   'pin' => '5678', 'role' => 'gerant'],
            ['name' => 'Fatou Ndiaye',          'email' => 'caissier@smartcommerce.sn', 'password' => 'Caissier@2026!', 'pin' => '9012', 'role' => 'caissier'],
            ['name' => 'Moussa Sarr',           'email' => 'serveur@smartcommerce.sn',  'password' => 'Serveur@2026!',  'pin' => '3456', 'role' => 'serveur'],
            ['name' => 'Aminata Sow',           'email' => 'cuisine@smartcommerce.sn',  'password' => 'Cuisine@2026!',  'pin' => '7890', 'role' => 'cuisinier'],
            ['name' => 'Oumar Ba',              'email' => 'stock@smartcommerce.sn',    'password' => 'Stock@2026!',    'pin' => '2468', 'role' => 'magasinier'],
        ];

        foreach ($users as $u) {
            $role = $u['role'];
            unset($u['role']);
            $user = User::firstOrCreate(['email' => $u['email']], array_merge($u, [
                'password' => Hash::make($u['password']),
                'pin'      => Hash::make($u['pin']),
                'store_id' => $store->id,
                'is_active' => true,
            ]));
            if (! $user->hasRole($role)) {
                $user->assignRole($role);
            }
        }

        // ── Units ────────────────────────────────────────────────────────────
        $units = [
            ['name' => 'Unité',       'abbreviation' => 'U',    'is_weight_unit' => false],
            ['name' => 'Kilogramme',  'abbreviation' => 'kg',   'is_weight_unit' => true],
            ['name' => 'Gramme',      'abbreviation' => 'g',    'is_weight_unit' => true],
            ['name' => 'Litre',       'abbreviation' => 'L',    'is_weight_unit' => false],
            ['name' => 'Centilitre',  'abbreviation' => 'cl',   'is_weight_unit' => false],
            ['name' => 'Pack',        'abbreviation' => 'Pack', 'is_weight_unit' => false],
            ['name' => 'Carton',      'abbreviation' => 'Ctn',  'is_weight_unit' => false],
            ['name' => 'Portion',     'abbreviation' => 'Ptn',  'is_weight_unit' => false],
        ];

        foreach ($units as $u) {
            Unit::firstOrCreate(['abbreviation' => $u['abbreviation']], $u);
        }

        $this->command->info('✅ Setup : permissions, rôles, magasin, utilisateurs, unités OK');
        $this->command->table(
            ['Rôle', 'Email', 'Mot de passe', 'PIN'],
            [
                ['Super Admin', 'admin@smartcommerce.sn',    'Admin@2026!',    '1234'],
                ['Gérant',      'gerant@smartcommerce.sn',   'Gerant@2026!',   '5678'],
                ['Caissier',    'caissier@smartcommerce.sn', 'Caissier@2026!', '9012'],
                ['Serveur',     'serveur@smartcommerce.sn',  'Serveur@2026!',  '3456'],
                ['Cuisinier',   'cuisine@smartcommerce.sn',  'Cuisine@2026!',  '7890'],
                ['Magasinier',  'stock@smartcommerce.sn',    'Stock@2026!',    '2468'],
            ]
        );
    }
}
