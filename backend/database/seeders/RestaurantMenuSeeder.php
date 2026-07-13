<?php

namespace Database\Seeders;

use App\Models\RestaurantItem;
use App\Models\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Crée un menu restaurant complet avec images Unsplash.
 *
 * Courses : starter | main | dessert | drink
 * Stations : Cuisine chaude | Bar
 */
class RestaurantMenuSeeder extends Seeder
{
    // ── Images Unsplash (CDN stable, usage libre) ─────────────────────────────
    private const IMG = 'https://images.unsplash.com/photo-';
    private const Q   = '?w=600&h=450&fit=crop&auto=format&q=80';

    private function img(string $photoId): string
    {
        return self::IMG . $photoId . self::Q;
    }

    public function run(): void
    {
        $store = Store::where('code', 'MAIN')->firstOrFail();

        // ── Stations ────────────────────────────────────────────────────────
        $kitchenId = DB::table('production_stations')
            ->where('store_id', $store->id)->where('name', 'Cuisine chaude')->value('id');
        $barId = DB::table('production_stations')
            ->where('store_id', $store->id)->where('name', 'Bar')->value('id');

        // ── Mise à jour images des Produits restaurant existants ─────────────
        $productImages = [
            'P00000026' => $this->img('1563379091339-03246963d77e'), // Thiéboudienne
            'P00000027' => $this->img('1598103442097-8b74394b95c7'), // Yassa Poulet
            'P00000028' => $this->img('1547592180-85f173990554'),    // Mafé Bœuf
            'P00000029' => $this->img('1532550907401-a500c9a57435'), // Poulet DG
            'P00000030' => $this->img('1541544741938-0af808871cc0'), // Thiep Yap
            'P00000031' => $this->img('1544025162-d76694265947'),    // Grillades mixtes
            'P00000032' => $this->img('1560180474-e8563fd75bab'),    // Bissap
            'P00000033' => $this->img('1495474472287-4d71bcdd2085'), // Café Touba
            'P00000034' => $this->img('1546173159-315724a31696'),    // Ditax
            'P00000035' => $this->img('1548839140-29a749e1cf4d'),    // Eau minérale
        ];

        foreach ($productImages as $code => $url) {
            DB::table('products')->where('internal_code', $code)->update(['image' => $url]);
        }

        $this->command->info('✅ Images mises à jour pour les 10 produits restaurant existants');

        // ── Menu RestaurantItem complet ──────────────────────────────────────
        $menu = [

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ENTRÉES
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Salade César',
                'description' => 'Salade romaine, parmesan, croûtons, sauce César maison',
                'course'      => 'starter',
                'price_ttc'   => 1500,
                'cost_price'  => 400,
                'prep_time'   => 8,
                'station'     => $kitchenId,
                'image'       => $this->img('1512621776951-a57141f2eefd'),
            ],
            [
                'name'        => 'Salade de crudités',
                'description' => 'Tomates, concombres, carottes râpées, vinaigrette citron',
                'course'      => 'starter',
                'price_ttc'   => 1200,
                'cost_price'  => 300,
                'prep_time'   => 5,
                'station'     => $kitchenId,
                'image'       => $this->img('1565557623262-b51c2513a641'),
            ],
            [
                'name'        => 'Soupe de poisson',
                'description' => 'Soupe de poisson frais aux légumes et épices locales',
                'course'      => 'starter',
                'price_ttc'   => 2000,
                'cost_price'  => 600,
                'prep_time'   => 15,
                'station'     => $kitchenId,
                'image'       => $this->img('1547592166-23ac45744acd'),
            ],
            [
                'name'        => 'Accras de crevettes',
                'description' => 'Beignets de crevettes croustillants, sauce tartare',
                'course'      => 'starter',
                'price_ttc'   => 2500,
                'cost_price'  => 700,
                'prep_time'   => 12,
                'station'     => $kitchenId,
                'image'       => $this->img('1565299624946-b28f40a0ae38'),
            ],
            [
                'name'        => 'Soupe de légumes',
                'description' => 'Velouté de légumes frais du marché, crème légère',
                'course'      => 'starter',
                'price_ttc'   => 1500,
                'cost_price'  => 350,
                'prep_time'   => 10,
                'station'     => $kitchenId,
                'image'       => $this->img('1603105037880-880cd4edfb0d'),
            ],
            [
                'name'        => 'Nems de légumes (x3)',
                'description' => 'Rouleaux croustillants aux légumes, sauce soja',
                'course'      => 'starter',
                'price_ttc'   => 2000,
                'cost_price'  => 500,
                'prep_time'   => 10,
                'station'     => $kitchenId,
                'image'       => $this->img('1563805042-7f77b4e6b988'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // PLATS SÉNÉGALAIS
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Domoda',
                'description' => 'Plat gambien à la pâte de cacahuète avec poulet ou bœuf, servi avec riz blanc',
                'course'      => 'main',
                'price_ttc'   => 3000,
                'cost_price'  => 900,
                'prep_time'   => 35,
                'station'     => $kitchenId,
                'image'       => $this->img('1604152135912-04a022e23696'),
            ],
            [
                'name'        => 'Ceebu Yapp',
                'description' => 'Riz à la viande de bœuf aux légumes — version terrienne du thiéboudienne',
                'course'      => 'main',
                'price_ttc'   => 3200,
                'cost_price'  => 1000,
                'prep_time'   => 40,
                'station'     => $kitchenId,
                'image'       => $this->img('1516714435131-44d6b64dc6a2'),
            ],
            [
                'name'        => 'Benachin (Jollof)',
                'description' => 'Riz cuit dans une sauce tomate épicée avec viande, le célèbre Jollof Rice',
                'course'      => 'main',
                'price_ttc'   => 3000,
                'cost_price'  => 800,
                'prep_time'   => 40,
                'station'     => $kitchenId,
                'image'       => $this->img('1511690743698-d9d85f2fbf38'),
            ],
            [
                'name'        => 'Caldou',
                'description' => 'Soupe légère de poisson au riz blanc, cuisine traditionelle lébou',
                'course'      => 'main',
                'price_ttc'   => 3500,
                'cost_price'  => 1100,
                'prep_time'   => 35,
                'station'     => $kitchenId,
                'image'       => $this->img('1559742811-822873691df8'),
            ],
            [
                'name'        => 'Tilapia grillé',
                'description' => 'Tilapia entier grillé au charbon, sauce oignons, servi avec attiéké',
                'course'      => 'main',
                'price_ttc'   => 4000,
                'cost_price'  => 1400,
                'prep_time'   => 25,
                'station'     => $kitchenId,
                'image'       => $this->img('1570197788417-0e82375c9371'),
            ],
            [
                'name'        => 'Poulet rôti (demi)',
                'description' => 'Demi-poulet rôti aux herbes, frites maison et sauce barbecue',
                'course'      => 'main',
                'price_ttc'   => 4500,
                'cost_price'  => 1500,
                'prep_time'   => 30,
                'station'     => $kitchenId,
                'image'       => $this->img('1598103442097-8b74394b95c7'),
            ],
            [
                'name'        => 'Riz cantonais',
                'description' => 'Riz sauté aux légumes, œuf, crevettes et sauce soja',
                'course'      => 'main',
                'price_ttc'   => 2500,
                'cost_price'  => 700,
                'prep_time'   => 15,
                'station'     => $kitchenId,
                'image'       => $this->img('1504674900247-0877df9cc836'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // GRILLADES & BBQ
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Brochettes de bœuf (x4)',
                'description' => 'Brochettes marinées aux épices africaines, oignons grillés',
                'course'      => 'main',
                'price_ttc'   => 3000,
                'cost_price'  => 900,
                'prep_time'   => 20,
                'station'     => $kitchenId,
                'image'       => $this->img('1555949258-eb67b1ef0ceb'),
            ],
            [
                'name'        => 'Côtes d\'agneau grillées',
                'description' => '2 côtes d\'agneau grillées, sauce chermoula et légumes de saison',
                'course'      => 'main',
                'price_ttc'   => 5500,
                'cost_price'  => 1800,
                'prep_time'   => 25,
                'station'     => $kitchenId,
                'image'       => $this->img('1529193591184-b1d58069ecdd'),
            ],
            [
                'name'        => 'Poisson braisé entier',
                'description' => 'Carpe ou bar entier braisé au charbon, sauce tomate piment',
                'course'      => 'main',
                'price_ttc'   => 4500,
                'cost_price'  => 1500,
                'prep_time'   => 30,
                'station'     => $kitchenId,
                'image'       => $this->img('1570197788417-0e82375c9371'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // FAST FOOD / SNACKS
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Burger Classic',
                'description' => 'Pain brioche, steak haché, salade, tomate, oignon, sauce maison',
                'course'      => 'main',
                'price_ttc'   => 3000,
                'cost_price'  => 900,
                'prep_time'   => 12,
                'station'     => $kitchenId,
                'image'       => $this->img('1568901346375-23c9450c58cd'),
            ],
            [
                'name'        => 'Burger Poulet Grillé',
                'description' => 'Filet de poulet grillé, cheddar, guacamole, pain complet',
                'course'      => 'main',
                'price_ttc'   => 3200,
                'cost_price'  => 950,
                'prep_time'   => 12,
                'station'     => $kitchenId,
                'image'       => $this->img('1572441713132-51c75654db73'),
            ],
            [
                'name'        => 'Sandwich Thon',
                'description' => 'Baguette toastée, thon, mayonnaise, salade, tomate, œuf',
                'course'      => 'main',
                'price_ttc'   => 2000,
                'cost_price'  => 500,
                'prep_time'   => 8,
                'station'     => $kitchenId,
                'image'       => $this->img('1553979459-d1028d547a30'),
            ],
            [
                'name'        => 'Frites maison (grand)',
                'description' => 'Frites coupées maison, croustillantes, sel et épices',
                'course'      => 'starter',
                'price_ttc'   => 1200,
                'cost_price'  => 300,
                'prep_time'   => 10,
                'station'     => $kitchenId,
                'image'       => $this->img('1573080496082-b46901844a88'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // DESSERTS
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Thiakry',
                'description' => 'Couscous de mil au lait caillé sucré, parfumé à la vanille',
                'course'      => 'dessert',
                'price_ttc'   => 1000,
                'cost_price'  => 200,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1488477304112-4944851de03d'),
            ],
            [
                'name'        => 'Ngalakh',
                'description' => 'Dessert traditionnel sénégalais à la pâte d\'arachide et baobab',
                'course'      => 'dessert',
                'price_ttc'   => 1000,
                'cost_price'  => 250,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1551024506-0bccd828d730'),
            ],
            [
                'name'        => 'Salade de fruits frais',
                'description' => 'Mangue, papaye, banane, ananas, jus de citron et menthe',
                'course'      => 'dessert',
                'price_ttc'   => 1500,
                'cost_price'  => 400,
                'prep_time'   => 8,
                'station'     => $barId,
                'image'       => $this->img('1568702846914-96b305d2aaeb'),
            ],
            [
                'name'        => 'Crème brûlée',
                'description' => 'Crème brûlée à la vanille, caramel croustillant',
                'course'      => 'dessert',
                'price_ttc'   => 1800,
                'cost_price'  => 450,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1601972599720-36938d4ecd31'),
            ],
            [
                'name'        => 'Glace 2 boules',
                'description' => 'Choix de parfums : vanille, chocolat, fraise, mangue',
                'course'      => 'dessert',
                'price_ttc'   => 1200,
                'cost_price'  => 300,
                'prep_time'   => 3,
                'station'     => $barId,
                'image'       => $this->img('1497034825429-c343d7c6a68f'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // BOISSONS FRAÎCHES
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Jus de Gingembre',
                'description' => 'Gingembre frais pressé, citron, sucre de canne',
                'course'      => 'drink',
                'price_ttc'   => 500,
                'cost_price'  => 80,
                'prep_time'   => 3,
                'station'     => $barId,
                'image'       => $this->img('1567696911169-f89aef66c587'),
            ],
            [
                'name'        => 'Jus de Bouye (Baobab)',
                'description' => 'Jus de fruit de baobab, vitaminé et rafraîchissant',
                'course'      => 'drink',
                'price_ttc'   => 500,
                'cost_price'  => 80,
                'prep_time'   => 3,
                'station'     => $barId,
                'image'       => $this->img('1571934811356-5cc061b6821f'),
            ],
            [
                'name'        => 'Jus de Tamarin',
                'description' => 'Jus de tamarin acidulé et sucré, fraîcheur tropicale',
                'course'      => 'drink',
                'price_ttc'   => 500,
                'cost_price'  => 80,
                'prep_time'   => 3,
                'station'     => $barId,
                'image'       => $this->img('1546173159-315724a31696'),
            ],
            [
                'name'        => 'Limonade maison',
                'description' => 'Citron pressé, menthe fraîche, sirop de sucre, eau pétillante',
                'course'      => 'drink',
                'price_ttc'   => 700,
                'cost_price'  => 120,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1571934811356-5cc061b6821f'),
            ],
            [
                'name'        => 'Jus d\'orange pressé',
                'description' => 'Oranges fraîches pressées à la commande',
                'course'      => 'drink',
                'price_ttc'   => 800,
                'cost_price'  => 200,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1600271886742-f049cd451bba'),
            ],
            [
                'name'        => 'Smoothie Tropical',
                'description' => 'Mangue, banane, ananas mixés avec lait de coco',
                'course'      => 'drink',
                'price_ttc'   => 1200,
                'cost_price'  => 300,
                'prep_time'   => 5,
                'station'     => $barId,
                'image'       => $this->img('1502741338009-cac2772e18bc'),
            ],
            [
                'name'        => 'Thé à la menthe',
                'description' => 'Thé vert Gunpowder, feuilles de menthe fraîche, sucre',
                'course'      => 'drink',
                'price_ttc'   => 400,
                'cost_price'  => 50,
                'prep_time'   => 8,
                'station'     => $barId,
                'image'       => $this->img('1546171753-97d98a0df0a9'),
            ],
            [
                'name'        => 'Ataya (3 verres)',
                'description' => 'Thé sénégalais traditionnel servi en 3 rounds',
                'course'      => 'drink',
                'price_ttc'   => 600,
                'cost_price'  => 80,
                'prep_time'   => 20,
                'station'     => $barId,
                'image'       => $this->img('1571934811356-5cc061b6821f'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // BOISSONS SUCRÉES & SODAS
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Coca-Cola 33cl',
                'description' => 'Boisson gazeuse Coca-Cola, servie bien fraîche',
                'course'      => 'drink',
                'price_ttc'   => 800,
                'cost_price'  => 300,
                'prep_time'   => 1,
                'station'     => $barId,
                'image'       => $this->img('1554866585-cd94860890b7'),
            ],
            [
                'name'        => 'Fanta Orange 33cl',
                'description' => 'Soda orange Fanta, pétillant et rafraîchissant',
                'course'      => 'drink',
                'price_ttc'   => 800,
                'cost_price'  => 300,
                'prep_time'   => 1,
                'station'     => $barId,
                'image'       => $this->img('1583898350903-99ca02bc5b8b'),
            ],
            [
                'name'        => 'Sprite 33cl',
                'description' => 'Soda citron-citron vert, légèreté et fraîcheur',
                'course'      => 'drink',
                'price_ttc'   => 800,
                'cost_price'  => 300,
                'prep_time'   => 1,
                'station'     => $barId,
                'image'       => $this->img('1622483767028-3f5a6a94d3b1'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // BOISSONS CHAUDES
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Café espresso',
                'description' => 'Espresso serré, café 100% arabica',
                'course'      => 'drink',
                'price_ttc'   => 400,
                'cost_price'  => 60,
                'prep_time'   => 3,
                'station'     => $barId,
                'image'       => $this->img('1495474472287-4d71bcdd2085'),
            ],
            [
                'name'        => 'Café au lait',
                'description' => 'Espresso allongé au lait chaud mousseux',
                'course'      => 'drink',
                'price_ttc'   => 600,
                'cost_price'  => 100,
                'prep_time'   => 4,
                'station'     => $barId,
                'image'       => $this->img('1509042239860-f550ce710b93'),
            ],
            [
                'name'        => 'Chocolat chaud',
                'description' => 'Chocolat fondu au lait entier, chantilly légère',
                'course'      => 'drink',
                'price_ttc'   => 700,
                'cost_price'  => 150,
                'prep_time'   => 4,
                'station'     => $barId,
                'image'       => $this->img('1542990253-a781e04bfd70'),
            ],

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // BOISSONS ALCOOLISÉES
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            [
                'name'        => 'Bière Flag 65cl',
                'description' => 'Bière sénégalaise Flag, bien fraîche',
                'course'      => 'drink',
                'price_ttc'   => 1500,
                'cost_price'  => 600,
                'prep_time'   => 1,
                'station'     => $barId,
                'image'       => $this->img('1608270586620-248524c67de9'),
            ],
            [
                'name'        => 'Bière Gazelle 65cl',
                'description' => 'Bière blonde légère sénégalaise Gazelle',
                'course'      => 'drink',
                'price_ttc'   => 1500,
                'cost_price'  => 600,
                'prep_time'   => 1,
                'station'     => $barId,
                'image'       => $this->img('1608270586620-248524c67de9'),
            ],
        ];

        $created = 0;
        $now = now();

        foreach ($menu as $i => $item) {
            $exists = RestaurantItem::where('store_id', $store->id)
                ->where('name', $item['name'])
                ->exists();

            if ($exists) continue;

            $vatRate = 0;
            $priceTtc = (float) $item['price_ttc'];
            $priceHt  = round($priceTtc / (1 + $vatRate / 100), 2);

            RestaurantItem::create([
                'store_id'                 => $store->id,
                'name'                     => $item['name'],
                'description'              => $item['description'],
                'course'                   => $item['course'],
                'price_ttc'                => $priceTtc,
                'price_ht'                 => $priceHt,
                'vat_rate'                 => $vatRate,
                'cost_price'               => $item['cost_price'],
                'preparation_time_minutes' => $item['prep_time'],
                'station_id'               => $item['station'],
                'image'                    => $item['image'],
                'is_available'             => true,
                'is_active'                => true,
                'sort_order'               => $i + 1,
            ]);

            $created++;
        }

        $this->command->info("✅ Menu restaurant : {$created} plats/boissons créés avec images");
        $this->command->newLine();
        $this->command->table(
            ['Course', 'Produits'],
            [
                ['Entrées (starter)',    '6 items'],
                ['Plats (main)',         '14 items'],
                ['Desserts (dessert)',   '5 items'],
                ['Boissons (drink)',     '17 items'],
            ]
        );
    }
}
