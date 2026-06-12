<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Store;
use App\Models\Category;
use App\Models\Unit;
use App\Models\Brand;
use App\Models\Product;
use App\Models\StockLevel;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
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
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        $roleMap = [
            'super_admin' => $permissions,
            'gerant' => [
                'view_dashboard','view_reports','view_margins',
                'create_sales','cancel_sales','apply_discounts','apply_discount_over_limit',
                'manage_products','manage_categories',
                'manage_suppliers','create_purchase_orders','validate_purchases',
                'view_stock','adjust_stock','manage_inventory',
                'manage_clients','manage_loyalty','manage_promotions',
                'open_cash_drawer','manage_cash_sessions','view_cash_reports',
                'manage_users','view_audit_logs',
                'restaurant_orders','restaurant_kds','restaurant_reservations',
                'manage_losses','validate_losses','manage_transfers',
            ],
            'caissier' => ['create_sales','apply_discounts','manage_clients','open_cash_drawer','manage_cash_sessions'],
            'serveur' => ['restaurant_orders'],
            'cuisinier' => ['restaurant_kds'],
            'magasinier' => ['view_stock','manage_inventory','manage_losses','create_purchase_orders'],
            'comptable' => ['view_dashboard','view_reports','view_margins','view_cash_reports','view_audit_logs'],
            'proprietaire' => ['view_dashboard','view_reports','view_margins','view_cash_reports'],
        ];

        foreach ($roleMap as $roleName => $rolePermissions) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($rolePermissions);
        }

        $store = Store::firstOrCreate(['code' => 'MAIN'], [
            'name' => 'SmartCommerce Dakar',
            'address' => 'Dakar, Sénégal',
            'phone' => '+221 33 000 0000',
            'ninea' => '000000000',
            'rc' => 'SN-DKR-0000',
            'currency' => 'XOF',
            'timezone' => 'Africa/Dakar',
            'license_grande_surface' => true,
            'license_restaurant' => true,
            'is_active' => true,
            'is_central' => true,
        ]);

        $users = [
            ['name' => 'Super Administrateur', 'email' => 'admin@smartcommerce.sn', 'password' => 'Admin@2026!', 'pin' => '1234', 'role' => 'super_admin'],
            ['name' => 'Ibrahima Diallo', 'email' => 'gerant@smartcommerce.sn', 'password' => 'Gerant@2026!', 'pin' => '5678', 'role' => 'gerant'],
            ['name' => 'Fatou Ndiaye', 'email' => 'caissier@smartcommerce.sn', 'password' => 'Caissier@2026!', 'pin' => '9012', 'role' => 'caissier'],
        ];

        foreach ($users as $u) {
            $role = $u['role'];
            unset($u['role']);
            $user = User::firstOrCreate(['email' => $u['email']], array_merge($u, [
                'password' => Hash::make($u['password']),
                'pin' => Hash::make($u['pin']),
                'store_id' => $store->id,
                'is_active' => true,
            ]));
            $user->assignRole($role);
        }

        $unitData = [
            ['name' => 'Unité', 'abbreviation' => 'U', 'is_weight_unit' => false],
            ['name' => 'Kilogramme', 'abbreviation' => 'kg', 'is_weight_unit' => true],
            ['name' => 'Litre', 'abbreviation' => 'L', 'is_weight_unit' => false],
            ['name' => 'Pack', 'abbreviation' => 'Pack', 'is_weight_unit' => false],
            ['name' => 'Carton', 'abbreviation' => 'Ctn', 'is_weight_unit' => false],
        ];
        foreach ($unitData as $u) {
            Unit::firstOrCreate(['abbreviation' => $u['abbreviation']], $u);
        }

        $catData = [
            ['name' => 'Alimentaire', 'slug' => 'alimentaire', 'type' => 'grande_surface', 'color' => '#FF6B35', 'sort_order' => 1],
            ['name' => 'Boissons', 'slug' => 'boissons', 'type' => 'grande_surface', 'color' => '#4ECDC4', 'sort_order' => 2],
            ['name' => 'Produits laitiers', 'slug' => 'produits-laitiers', 'type' => 'grande_surface', 'color' => '#A8E6CF', 'sort_order' => 3],
            ['name' => 'Fruits & Légumes', 'slug' => 'fruits-legumes', 'type' => 'grande_surface', 'color' => '#88D8B0', 'sort_order' => 4],
            ['name' => 'Hygiène & Beauté', 'slug' => 'hygiene-beaute', 'type' => 'grande_surface', 'color' => '#FFD3B6', 'sort_order' => 5],
            ['name' => 'Plats', 'slug' => 'plats-resto', 'type' => 'restaurant', 'color' => '#F07167', 'sort_order' => 10],
            ['name' => 'Boissons Restaurant', 'slug' => 'boissons-resto', 'type' => 'restaurant', 'color' => '#B5EAD7', 'sort_order' => 11],
        ];
        foreach ($catData as $cat) {
            Category::firstOrCreate(['slug' => $cat['slug']], array_merge($cat, ['is_active' => true]));
        }

        $unit = Unit::where('abbreviation', 'U')->first();
        $catId = Category::where('slug', 'alimentaire')->value('id');

        $products = [
            ['name' => 'Riz parfumé 5kg', 'purchase_price_ht' => 2500, 'sale_price_ttc' => 3500, 'vat_rate' => 0, 'min_stock' => 10, 'alert_stock' => 5, 'bc' => '6111111111111'],
            ['name' => 'Huile végétale 1L', 'purchase_price_ht' => 900, 'sale_price_ttc' => 1200, 'vat_rate' => 18, 'min_stock' => 20, 'alert_stock' => 10, 'bc' => '6111111111112'],
            ['name' => 'Sucre cristallisé 1kg', 'purchase_price_ht' => 400, 'sale_price_ttc' => 550, 'vat_rate' => 0, 'min_stock' => 30, 'alert_stock' => 15, 'bc' => '6111111111113'],
            ['name' => 'Tomates concentrées 140g', 'purchase_price_ht' => 200, 'sale_price_ttc' => 300, 'vat_rate' => 18, 'min_stock' => 50, 'alert_stock' => 20, 'bc' => '6111111111114'],
            ['name' => 'Eau minérale 1.5L', 'purchase_price_ht' => 150, 'sale_price_ttc' => 250, 'vat_rate' => 18, 'min_stock' => 100, 'alert_stock' => 50, 'bc' => '6111111111115'],
        ];

        foreach ($products as $i => $p) {
            $code = 'P' . str_pad($i + 1, 8, '0', STR_PAD_LEFT);
            $bc = $p['bc'];
            unset($p['bc']);

            $product = Product::firstOrCreate(['internal_code' => $code], array_merge($p, [
                'store_id' => $store->id,
                'internal_code' => $code,
                'category_id' => $catId,
                'unit_id' => $unit?->id,
                'is_active' => true,
            ]));

            \App\Models\ProductBarcode::firstOrCreate(['barcode' => $bc], [
                'product_id' => $product->id,
                'barcode' => $bc,
                'type' => 'ean13',
                'is_primary' => true,
            ]);

            StockLevel::firstOrCreate(['store_id' => $store->id, 'product_id' => $product->id], [
                'qty_on_hand' => 100,
                'avg_cost' => $p['purchase_price_ht'],
            ]);
        }

        $this->command->info('✅ SmartCommerce Suite initialisé avec succès!');
        $this->command->table(['Rôle', 'Email', 'Mot de passe', 'PIN'], [
            ['Super Admin', 'admin@smartcommerce.sn', 'Admin@2026!', '1234'],
            ['Gérant', 'gerant@smartcommerce.sn', 'Gerant@2026!', '5678'],
            ['Caissier', 'caissier@smartcommerce.sn', 'Caissier@2026!', '9012'],
        ]);
    }
}
