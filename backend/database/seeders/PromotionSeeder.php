<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PromotionSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::where('code', 'MAIN')->firstOrFail();

        $promos = [
            [
                'name'         => 'Promo Tabaski — 10% sur Alimentaire',
                'type'         => 'percentage',
                'value'        => 10,
                'min_amount'   => 5000,
                'stackable'    => false,
                'applies_to_all' => false,
                'loyalty_only' => false,
                'is_active'    => true,
                'starts_at'    => now()->subDays(3),
                'ends_at'      => now()->addDays(7),
                'categories'   => ['alimentaire'],
            ],
            [
                'name'         => 'Happy Hour — 20% sur Boissons Restaurant',
                'type'         => 'happy_hour',
                'value'        => 20,
                'min_amount'   => 0,
                'happy_hour_start' => '17:00:00',
                'happy_hour_end'   => '19:00:00',
                'stackable'    => false,
                'applies_to_all' => false,
                'loyalty_only' => false,
                'is_active'    => true,
                'starts_at'    => null,
                'ends_at'      => null,
                'categories'   => ['boissons-resto'],
            ],
            [
                'name'         => 'Pack Eau : 3 achetées = 1 offerte',
                'type'         => 'buy_x_get_y',
                'value'        => 0,
                'buy_qty'      => 3,
                'get_qty'      => 1,
                'min_amount'   => 0,
                'stackable'    => false,
                'applies_to_all' => false,
                'loyalty_only' => false,
                'is_active'    => true,
                'starts_at'    => null,
                'ends_at'      => null,
                'products'     => ['P00000014', 'P00000005'],
            ],
            [
                'name'         => 'Fidélité Premium — 5% réduction',
                'type'         => 'percentage',
                'value'        => 5,
                'min_amount'   => 10000,
                'stackable'    => false,
                'applies_to_all' => true,
                'loyalty_only' => true,
                'is_active'    => true,
                'starts_at'    => null,
                'ends_at'      => null,
            ],
            [
                'name'         => 'Remise Quantité — 15 000 FCFA et +',
                'type'         => 'tiered',
                'value'        => 0,
                'tiers'        => [
                    ['min_amount' => 15000, 'discount_pct' => 5],
                    ['min_amount' => 30000, 'discount_pct' => 8],
                    ['min_amount' => 50000, 'discount_pct' => 12],
                ],
                'min_amount'   => 15000,
                'stackable'    => false,
                'applies_to_all' => true,
                'loyalty_only' => false,
                'is_active'    => true,
                'starts_at'    => null,
                'ends_at'      => null,
            ],
        ];

        $count = 0;
        foreach ($promos as $p) {
            $exists = DB::table('promotions')
                ->where('store_id', $store->id)
                ->where('name', $p['name'])
                ->exists();

            if ($exists) continue;

            $promoId = DB::table('promotions')->insertGetId([
                'store_id'         => $store->id,
                'name'             => $p['name'],
                'type'             => $p['type'],
                'value'            => $p['value'],
                'min_amount'       => $p['min_amount'],
                'buy_qty'          => $p['buy_qty'] ?? null,
                'get_qty'          => $p['get_qty'] ?? null,
                'tiers'            => isset($p['tiers']) ? json_encode($p['tiers']) : null,
                'happy_hour_start' => $p['happy_hour_start'] ?? null,
                'happy_hour_end'   => $p['happy_hour_end'] ?? null,
                'stackable'        => $p['stackable'],
                'applies_to_all'   => $p['applies_to_all'],
                'loyalty_only'     => $p['loyalty_only'],
                'starts_at'        => $p['starts_at'] ?? null,
                'ends_at'          => $p['ends_at'] ?? null,
                'is_active'        => $p['is_active'],
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);

            // Link categories
            foreach ($p['categories'] ?? [] as $slug) {
                $catId = DB::table('categories')->where('slug', $slug)->value('id');
                if ($catId) {
                    DB::table('promotion_categories')->insertOrIgnore([
                        'promotion_id' => $promoId,
                        'category_id'  => $catId,
                    ]);
                }
            }

            // Link products
            foreach ($p['products'] ?? [] as $code) {
                $productId = Product::where('internal_code', $code)->value('id');
                if ($productId) {
                    DB::table('promotion_products')->insertOrIgnore([
                        'promotion_id' => $promoId,
                        'product_id'   => $productId,
                    ]);
                }
            }

            $count++;
        }

        $this->command->info("✅ Promotions : {$count} promotions créées");
    }
}
