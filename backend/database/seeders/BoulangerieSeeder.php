<?php

namespace Database\Seeders;

use App\Models\Courier;
use App\Models\CustomerOrder;
use App\Models\Organization;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\ProductionOrder;
use App\Models\RecipeIngredient;
use App\Models\StockLevel;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Unit;
use App\Models\User;
use App\Services\CustomerOrderService;
use App\Services\ProductionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Tenant de démonstration : Boulangerie / Pâtisserie.
 * Idempotent (firstOrCreate partout) — peut être relancé sans doublons.
 * Non inclus dans DatabaseSeeder (données fictives) : à lancer explicitement
 *   php artisan db:seed --class=BoulangerieSeeder
 */
class BoulangerieSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        // ── Organisation ─────────────────────────────────────────────────────
        $org = Organization::firstOrCreate(['code' => 'BOULANGERIE'], [
            'name'      => 'Boulangerie Le Fournil',
            'email'     => 'contact@lefournil.sn',
            'phone'     => '+221 33 822 45 45',
            'address'   => 'Avenue Cheikh Anta Diop, Dakar',
            'is_active' => true,
        ]);

        // ── Magasin ──────────────────────────────────────────────────────────
        $store = Store::firstOrCreate(['code' => 'BOUL-001'], [
            'organization_id' => $org->id,
            'name'            => 'Boulangerie Le Fournil',
            'business_type'   => 'boulangerie',
            'address'         => 'Avenue Cheikh Anta Diop, Dakar',
            'phone'           => '+221 33 822 45 45',
            'email'           => 'contact@lefournil.sn',
            'currency'        => 'XOF',
            'timezone'        => 'Africa/Dakar',
            'license_grande_surface' => true,
            'license_restaurant'     => false,
            'receipt_footer'  => 'Merci et à demain ! Le Fournil — +221 33 822 45 45',
            'is_active'       => true,
            'is_central'      => true,
        ]);

        // ── Abonnement actif ─────────────────────────────────────────────────
        $plan = SubscriptionPlan::where('slug', 'business')->first();
        if ($plan) {
            Subscription::firstOrCreate(['organization_id' => $org->id], [
                'plan_id'       => $plan->id,
                'status'        => 'active',
                'billing_cycle' => 'yearly',
                'starts_at'     => $now,
                'ends_at'       => $now->copy()->addYear(),
                'grace_ends_at' => $now->copy()->addYear()->addDays($plan->grace_period_days ?? 7),
            ]);
        }

        // ── Utilisateurs ─────────────────────────────────────────────────────
        $users = [
            ['name' => 'Aminata Diallo', 'email' => 'gerant@boulangerie.sn',   'password' => 'Boulangerie@2026!', 'pin' => '1111', 'role' => 'gerant'],
            ['name' => 'Khady Faye',     'email' => 'caissier@boulangerie.sn', 'password' => 'Caissier@2026!',    'pin' => '2222', 'role' => 'caissier'],
            ['name' => 'Mamadou Gueye',  'email' => 'stock@boulangerie.sn',    'password' => 'Stock@2026!',       'pin' => '3333', 'role' => 'magasinier'],
        ];

        foreach ($users as $u) {
            $role = $u['role'];
            unset($u['role']);
            $user = User::firstOrCreate(['email' => $u['email']], array_merge($u, [
                'password'        => Hash::make($u['password']),
                'pin'             => Hash::make($u['pin']),
                'organization_id' => $org->id,
                'store_id'        => $store->id,
                'is_active'       => true,
            ]));
            if (! $user->hasRole($role)) {
                $user->assignRole($role);
            }
        }

        // ── Catégories (propres à l'organisation) ────────────────────────────
        $cats = [];
        $catDefs = [
            ['slug' => 'boul-pains',          'name' => 'Pains',              'color' => '#D4A373', 'sort_order' => 1],
            ['slug' => 'boul-viennoiseries',  'name' => 'Viennoiseries',      'color' => '#E9C46A', 'sort_order' => 2],
            ['slug' => 'boul-patisseries',    'name' => 'Pâtisseries',        'color' => '#F4A261', 'sort_order' => 3],
            ['slug' => 'boul-boissons',       'name' => 'Boissons',           'color' => '#4ECDC4', 'sort_order' => 4],
            ['slug' => 'boul-matieres',       'name' => 'Matières premières', 'color' => '#8D99AE', 'sort_order' => 5],
            ['slug' => 'boul-autres',         'name' => 'Autres',             'color' => '#B8B8B8', 'sort_order' => 6],
        ];

        foreach ($catDefs as $cat) {
            $existing = DB::table('categories')->where('slug', $cat['slug'])->first();
            $cats[$cat['slug']] = $existing?->id ?? DB::table('categories')->insertGetId(array_merge($cat, [
                'organization_id' => $org->id,
                'type'            => 'common',
                'parent_id'       => null,
                'is_active'       => true,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]));
        }

        $unitU  = Unit::where('abbreviation', 'U')->first();
        $unitKg = Unit::where('abbreviation', 'kg')->first();
        $unitL  = Unit::where('abbreviation', 'L')->first();

        // ── Produits ─────────────────────────────────────────────────────────
        $products = [
            // ── Pains ──
            ['code' => 'BOUL00001', 'name' => 'Baguette',                 'cat' => 'boul-pains',         'buy' => 110,  'sell' => 175,  'unit' => $unitU,  'stock' => 300, 'min' => 100, 'alert' => 50],
            ['code' => 'BOUL00002', 'name' => 'Demi-baguette',            'cat' => 'boul-pains',         'buy' => 60,   'sell' => 100,  'unit' => $unitU,  'stock' => 150, 'min' => 50,  'alert' => 25],
            ['code' => 'BOUL00003', 'name' => 'Pain de mie',              'cat' => 'boul-pains',         'buy' => 450,  'sell' => 750,  'unit' => $unitU,  'stock' => 40,  'min' => 15,  'alert' => 8],
            ['code' => 'BOUL00004', 'name' => 'Pain complet',             'cat' => 'boul-pains',         'buy' => 300,  'sell' => 500,  'unit' => $unitU,  'stock' => 30,  'min' => 10,  'alert' => 5],
            ['code' => 'BOUL00005', 'name' => 'Pain au sésame',           'cat' => 'boul-pains',         'buy' => 200,  'sell' => 350,  'unit' => $unitU,  'stock' => 35,  'min' => 10,  'alert' => 5],
            // ── Viennoiseries ──
            ['code' => 'BOUL00006', 'name' => 'Croissant',                'cat' => 'boul-viennoiseries', 'buy' => 200,  'sell' => 400,  'unit' => $unitU,  'stock' => 80,  'min' => 30,  'alert' => 15],
            ['code' => 'BOUL00007', 'name' => 'Pain au chocolat',         'cat' => 'boul-viennoiseries', 'buy' => 250,  'sell' => 500,  'unit' => $unitU,  'stock' => 70,  'min' => 30,  'alert' => 15],
            ['code' => 'BOUL00008', 'name' => 'Pain aux raisins',         'cat' => 'boul-viennoiseries', 'buy' => 250,  'sell' => 500,  'unit' => $unitU,  'stock' => 40,  'min' => 15,  'alert' => 8],
            ['code' => 'BOUL00009', 'name' => 'Chausson aux pommes',      'cat' => 'boul-viennoiseries', 'buy' => 300,  'sell' => 600,  'unit' => $unitU,  'stock' => 30,  'min' => 10,  'alert' => 5],
            ['code' => 'BOUL00010', 'name' => 'Beignet sucré',            'cat' => 'boul-viennoiseries', 'buy' => 75,   'sell' => 150,  'unit' => $unitU,  'stock' => 100, 'min' => 30,  'alert' => 15],
            // ── Pâtisseries ──
            ['code' => 'BOUL00011', 'name' => 'Éclair au chocolat',       'cat' => 'boul-patisseries',   'buy' => 400,  'sell' => 800,  'unit' => $unitU,  'stock' => 25,  'min' => 10,  'alert' => 5],
            ['code' => 'BOUL00012', 'name' => 'Mille-feuille',            'cat' => 'boul-patisseries',   'buy' => 500,  'sell' => 1000, 'unit' => $unitU,  'stock' => 20,  'min' => 8,   'alert' => 4],
            ['code' => 'BOUL00013', 'name' => 'Tarte aux fruits (part)',  'cat' => 'boul-patisseries',   'buy' => 500,  'sell' => 1000, 'unit' => $unitU,  'stock' => 24,  'min' => 8,   'alert' => 4],
            ['code' => 'BOUL00014', 'name' => 'Gâteau d\'anniversaire 8 pers.', 'cat' => 'boul-patisseries', 'buy' => 6000, 'sell' => 12000, 'unit' => $unitU, 'stock' => 5, 'min' => 2, 'alert' => 1],
            ['code' => 'BOUL00015', 'name' => 'Cake marbré',              'cat' => 'boul-patisseries',   'buy' => 1200, 'sell' => 2500, 'unit' => $unitU,  'stock' => 12,  'min' => 4,   'alert' => 2],
            // ── Boissons ──
            ['code' => 'BOUL00016', 'name' => 'Café au lait',             'cat' => 'boul-boissons',      'buy' => 150,  'sell' => 400,  'unit' => $unitU,  'stock' => 0,   'min' => 0,   'alert' => 0],
            ['code' => 'BOUL00017', 'name' => 'Jus de bissap 33cl',       'cat' => 'boul-boissons',      'buy' => 200,  'sell' => 500,  'unit' => $unitU,  'stock' => 48,  'min' => 12,  'alert' => 6],
            ['code' => 'BOUL00018', 'name' => 'Eau minérale 50cl',        'cat' => 'boul-boissons',      'buy' => 100,  'sell' => 250,  'unit' => $unitU,  'stock' => 96,  'min' => 24,  'alert' => 12],
            // ── Matières premières ──
            ['code' => 'BOUL00019', 'name' => 'Farine de blé T55',        'cat' => 'boul-matieres',      'buy' => 450,  'sell' => 600,  'unit' => $unitKg, 'stock' => 500, 'min' => 200, 'alert' => 100, 'weight' => true],
            ['code' => 'BOUL00020', 'name' => 'Sucre en poudre',          'cat' => 'boul-matieres',      'buy' => 600,  'sell' => 750,  'unit' => $unitKg, 'stock' => 100, 'min' => 30,  'alert' => 15,  'weight' => true],
            ['code' => 'BOUL00021', 'name' => 'Beurre doux',              'cat' => 'boul-matieres',      'buy' => 5500, 'sell' => 6500, 'unit' => $unitKg, 'stock' => 40,  'min' => 15,  'alert' => 8,   'weight' => true],
            ['code' => 'BOUL00022', 'name' => 'Levure boulangère',        'cat' => 'boul-matieres',      'buy' => 2500, 'sell' => 3000, 'unit' => $unitKg, 'stock' => 10,  'min' => 3,   'alert' => 2,   'weight' => true],
            ['code' => 'BOUL00023', 'name' => 'Œufs (plateau de 30)',     'cat' => 'boul-matieres',      'buy' => 2700, 'sell' => 3200, 'unit' => $unitU,  'stock' => 20,  'min' => 8,   'alert' => 4],
            ['code' => 'BOUL00024', 'name' => 'Lait entier',              'cat' => 'boul-matieres',      'buy' => 700,  'sell' => 900,  'unit' => $unitL,  'stock' => 50,  'min' => 20,  'alert' => 10],
            ['code' => 'BOUL00025', 'name' => 'Sel fin',                  'cat' => 'boul-matieres',      'buy' => 300,  'sell' => 400,  'unit' => $unitKg, 'stock' => 25,  'min' => 5,   'alert' => 3,   'weight' => true],
            ['code' => 'BOUL00026', 'name' => 'Chocolat noir pâtissier',  'cat' => 'boul-matieres',      'buy' => 7000, 'sell' => 8500, 'unit' => $unitKg, 'stock' => 15,  'min' => 5,   'alert' => 2,   'weight' => true],
            // Produit issu du recyclage des invendus (pain rassis → chapelure)
            ['code' => 'BOUL00027', 'name' => 'Chapelure maison',         'cat' => 'boul-autres',         'buy' => 0,    'sell' => 1500, 'unit' => $unitKg, 'stock' => 0,   'min' => 0,   'alert' => 0,   'weight' => true],
        ];

        foreach ($products as $i => $p) {
            $product = Product::firstOrCreate(['internal_code' => $p['code']], [
                'store_id'          => $store->id,
                'name'              => $p['name'],
                'category_id'       => $cats[$p['cat']] ?? null,
                'unit_id'           => $p['unit']?->id,
                'purchase_price_ht' => $p['buy'],
                'sale_price_ttc'    => $p['sell'],
                'vat_rate'          => 0,
                'is_weight_based'   => $p['weight'] ?? false,
                'min_stock'         => $p['min'],
                'alert_stock'       => $p['alert'],
                'is_active'         => true,
            ]);

            $barcode = '62200000' . str_pad((string) ($i + 1), 5, '0', STR_PAD_LEFT);
            ProductBarcode::firstOrCreate(['barcode' => $barcode, 'type' => 'ean13'], [
                'product_id' => $product->id,
                'is_primary' => true,
            ]);

            StockLevel::firstOrCreate(['store_id' => $store->id, 'product_id' => $product->id], [
                'qty_on_hand'  => $p['stock'],
                'avg_cost'     => $p['buy'],
                'last_updated' => $now,
            ]);
        }

        // Pains : le reste de fin de journée (fiche journalière, équipe de nuit) part en invendus
        DB::table('categories')->where('id', $cats['boul-pains'])->update(['unsold_end_of_day' => true]);
        // La chapelure (issue du recyclage) se conserve : hors de la catégorie Pains
        Product::where('store_id', $store->id)->where('internal_code', 'BOUL00027')->update(['category_id' => $cats['boul-autres']]);

        // Matières premières : séparées des produits finis dans le catalogue
        Product::where('store_id', $store->id)
            ->where('category_id', $cats['boul-matieres'])
            ->update(['product_kind' => 'raw_material']);

        // ── Recettes (quantités par fournée, rendement = unités produites par fournée) ──
        $recipes = [
            'BOUL00001' => ['yield' => 100, 'lines' => ['BOUL00019' => 25,  'BOUL00022' => 0.5,  'BOUL00025' => 0.5]],                     // Baguette
            'BOUL00002' => ['yield' => 200, 'lines' => ['BOUL00019' => 25,  'BOUL00022' => 0.5,  'BOUL00025' => 0.5]],                     // Demi-baguette
            'BOUL00003' => ['yield' => 20,  'lines' => ['BOUL00019' => 10,  'BOUL00021' => 0.5,  'BOUL00020' => 0.4, 'BOUL00024' => 3, 'BOUL00022' => 0.2, 'BOUL00025' => 0.2]], // Pain de mie
            'BOUL00006' => ['yield' => 60,  'lines' => ['BOUL00019' => 3,   'BOUL00021' => 1.5,  'BOUL00020' => 0.3, 'BOUL00022' => 0.1, 'BOUL00024' => 1, 'BOUL00025' => 0.05, 'BOUL00023' => 0.1]], // Croissant
            'BOUL00007' => ['yield' => 60,  'lines' => ['BOUL00019' => 3,   'BOUL00021' => 1.5,  'BOUL00020' => 0.3, 'BOUL00022' => 0.1, 'BOUL00024' => 1, 'BOUL00025' => 0.05, 'BOUL00026' => 0.6]], // Pain au chocolat
            'BOUL00010' => ['yield' => 100, 'lines' => ['BOUL00019' => 5,   'BOUL00020' => 0.8,  'BOUL00022' => 0.1, 'BOUL00023' => 0.2, 'BOUL00024' => 1.5]], // Beignet
            'BOUL00015' => ['yield' => 10,  'lines' => ['BOUL00019' => 2,   'BOUL00021' => 1.5,  'BOUL00020' => 1.5, 'BOUL00023' => 1,   'BOUL00026' => 0.3]], // Cake marbré
        ];

        $byCode = Product::where('store_id', $store->id)->whereIn('internal_code', array_column($products, 'code'))->get()->keyBy('internal_code');

        foreach ($recipes as $code => $recipe) {
            $finished = $byCode[$code];
            foreach ($recipe['lines'] as $ingCode => $qty) {
                RecipeIngredient::firstOrCreate(
                    ['product_id' => $finished->id, 'ingredient_id' => $byCode[$ingCode]->id],
                    ['unit_id' => $byCode[$ingCode]->unit_id, 'quantity' => $qty]
                );
            }
            $finished->update(['is_recipe' => true, 'recipe_yield' => $recipe['yield']]);
        }

        // ── Productions de démonstration (une seule fois) ────────────────────
        if (! ProductionOrder::where('store_id', $store->id)->exists()) {
            $production = app(ProductionService::class);
            $baker      = User::where('email', 'stock@boulangerie.sn')->first();
            foreach (['BOUL00001' => 3, 'BOUL00006' => 1, 'BOUL00007' => 1] as $code => $batches) {
                $production->produce($byCode[$code]->fresh(), $store->id, $baker->id, $batches, 'Fournée du matin');
            }
        }

        // ── Historique de ventes (28 jours) — alimente les prévisions du planning ──
        // Insertion directe : ventes passées, sans impact sur le stock actuel.
        if (! DB::table('sales')->where('store_id', $store->id)->exists()) {
            $cashier = User::where('email', 'caissier@boulangerie.sn')->first();
            // Ventes moyennes / jour ; coefficient week-end (sam, dim)
            $daily = ['BOUL00001' => 260, 'BOUL00002' => 120, 'BOUL00003' => 14, 'BOUL00006' => 55, 'BOUL00007' => 50,
                      'BOUL00010' => 80, 'BOUL00015' => 6, 'BOUL00016' => 40, 'BOUL00018' => 30];
            mt_srand(2026);

            for ($d = 28; $d >= 1; $d--) {
                $day    = $now->copy()->subDays($d)->setTime(19, 30);
                $factor = match ($day->dayOfWeek) { 0 => 1.4, 6 => 1.25, default => 1.0 };
                $saleId = DB::table('sales')->insertGetId([
                    'store_id' => $store->id, 'user_id' => $cashier->id,
                    'reference' => 'VTE' . $day->format('Ymd') . '9' . str_pad((string) $d, 5, '0', STR_PAD_LEFT),
                    'status' => 'completed', 'channel' => 'pos',
                    'created_at' => $day, 'updated_at' => $day,
                ]);

                $total = 0;
                $items = [];
                foreach ($daily as $code => $avg) {
                    $p   = $byCode[$code];
                    $qty = max(0, round($avg * $factor * mt_rand(85, 115) / 100));
                    $ttc = $qty * (float) $p->sale_price_ttc;
                    $total += $ttc;
                    $items[] = [
                        'sale_id' => $saleId, 'product_id' => $p->id, 'qty' => $qty,
                        'unit_price_ttc' => $p->sale_price_ttc, 'unit_price_ht' => $p->sale_price_ttc,
                        'vat_rate' => 0, 'total_ht' => $ttc, 'total_ttc' => $ttc,
                        'cost_price' => $p->purchase_price_ht, 'created_at' => $day, 'updated_at' => $day,
                    ];
                }
                DB::table('sale_items')->insert($items);
                DB::table('sales')->where('id', $saleId)->update(['subtotal_ht' => $total, 'total_ttc' => $total, 'paid_amount' => $total]);
                DB::table('sale_payments')->insert([
                    'sale_id' => $saleId, 'payment_method' => 'cash', 'amount' => $total,
                    'created_at' => $day, 'updated_at' => $day,
                ]);
            }
        }

        // ── Commandes clients de démonstration ───────────────────────────────
        if (! CustomerOrder::where('store_id', $store->id)->exists()) {
            $orders  = app(CustomerOrderService::class);
            $manager = User::where('email', 'gerant@boulangerie.sn')->first();

            $orders->create($store->id, $manager->id, [
                'customer_name'  => 'Fatou Sarr',
                'customer_phone' => '+221 77 412 33 21',
                'pickup_at'      => $now->copy()->addDay()->setTime(16, 0),
                'notes'          => 'Anniversaire — bougies 7 ans',
                'items'          => [
                    ['product_id' => $byCode['BOUL00014']->id, 'qty' => 1, 'details' => 'Chocolat-vanille, inscription « Joyeux anniversaire Awa »'],
                    ['product_id' => $byCode['BOUL00006']->id, 'qty' => 20],
                ],
                'deposit' => ['payment_method' => 'wave', 'amount' => 10000],
            ]);

            $orders->create($store->id, $manager->id, [
                'customer_name'  => 'Moustapha Ndiaye',
                'customer_phone' => '+221 76 908 11 45',
                'pickup_at'      => $now->copy()->addDays(2)->setTime(8, 0),
                'notes'          => 'Baptême — livraison à 8h',
                'items'          => [
                    ['product_id' => $byCode['BOUL00001']->id, 'qty' => 150],
                    ['product_id' => $byCode['BOUL00010']->id, 'qty' => 100],
                ],
                'deposit' => ['payment_method' => 'cash', 'amount' => 20000],
            ]);
        }

        // ── Livreurs et prix livreur (≈ -15 % sur le pain, -10 % sur les viennoiseries) ──
        foreach ([['Sidi', '+221 77 100 20 30', 'Médina / Fass'], ['Moustapha', '+221 76 200 30 40', 'Grand-Dakar / HLM']] as [$name, $phone, $zone]) {
            Courier::firstOrCreate(['store_id' => $store->id, 'name' => $name], ['phone' => $phone, 'zone' => $zone, 'is_active' => true]);
        }
        $courierPrices = ['BOUL00001' => 150, 'BOUL00002' => 85, 'BOUL00003' => 650, 'BOUL00004' => 425, 'BOUL00005' => 300,
                          'BOUL00006' => 350, 'BOUL00007' => 450, 'BOUL00010' => 125];
        foreach ($courierPrices as $code => $price) {
            $byCode[$code]->update(['courier_price' => $price]);
        }

        $this->command->info('✅ Boulangerie : organisation, magasin, ' . count($users) . ' utilisateurs, ' . count($products) . ' produits, ' . count($recipes) . ' recettes');
        $this->command->table(
            ['Rôle', 'Email', 'Mot de passe', 'PIN'],
            [
                ['Gérant',     'gerant@boulangerie.sn',   'Boulangerie@2026!', '1111'],
                ['Caissier',   'caissier@boulangerie.sn', 'Caissier@2026!',    '2222'],
                ['Magasinier', 'stock@boulangerie.sn',    'Stock@2026!',       '3333'],
            ]
        );
    }
}
