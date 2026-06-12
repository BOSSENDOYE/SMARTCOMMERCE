<?php

namespace Database\Seeders;

use App\Models\Brand;
use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\StockLevel;
use App\Models\Store;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::where('code', 'MAIN')->firstOrFail();
        $unitU  = Unit::where('abbreviation', 'U')->first();
        $unitKg = Unit::where('abbreviation', 'kg')->first();
        $unitL  = Unit::where('abbreviation', 'L')->first();
        $unitPtn = Unit::where('abbreviation', 'Ptn')->first();

        // ── Brands ───────────────────────────────────────────────────────────
        $brands = [
            'Kirène'        => Brand::firstOrCreate(['name' => 'Kirène']),
            'Patisen'       => Brand::firstOrCreate(['name' => 'Patisen']),
            'NMA Sanders'   => Brand::firstOrCreate(['name' => 'NMA Sanders']),
            'Nestlé'        => Brand::firstOrCreate(['name' => 'Nestlé']),
            'Unilever'      => Brand::firstOrCreate(['name' => 'Unilever']),
            'Ngaparou Foods' => Brand::firstOrCreate(['name' => 'Ngaparou Foods']),
            'Sonati'        => Brand::firstOrCreate(['name' => 'Sonati']),
        ];

        // ── Categories ───────────────────────────────────────────────────────
        // Using DB::table to bypass fillable restrictions
        $cats = [];
        $catDefs = [
            ['slug' => 'alimentaire',      'name' => 'Alimentaire',        'type' => 'grande_surface', 'color' => '#FF6B35', 'sort_order' => 1,  'parent_id' => null],
            ['slug' => 'boissons',         'name' => 'Boissons',           'type' => 'grande_surface', 'color' => '#4ECDC4', 'sort_order' => 2,  'parent_id' => null],
            ['slug' => 'produits-laitiers','name' => 'Produits laitiers',  'type' => 'grande_surface', 'color' => '#A8E6CF', 'sort_order' => 3,  'parent_id' => null],
            ['slug' => 'fruits-legumes',   'name' => 'Fruits & Légumes',   'type' => 'grande_surface', 'color' => '#88D8B0', 'sort_order' => 4,  'parent_id' => null],
            ['slug' => 'hygiene-beaute',   'name' => 'Hygiène & Beauté',   'type' => 'grande_surface', 'color' => '#FFD3B6', 'sort_order' => 5,  'parent_id' => null],
            ['slug' => 'plats-resto',      'name' => 'Plats',              'type' => 'restaurant',     'color' => '#F07167', 'sort_order' => 10, 'parent_id' => null],
            ['slug' => 'boissons-resto',   'name' => 'Boissons Restaurant', 'type' => 'restaurant',    'color' => '#B5EAD7', 'sort_order' => 11, 'parent_id' => null],
        ];

        foreach ($catDefs as $cat) {
            $existing = DB::table('categories')->where('slug', $cat['slug'])->first();
            if (! $existing) {
                $id = DB::table('categories')->insertGetId(array_merge($cat, [
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
                $cats[$cat['slug']] = $id;
            } else {
                $cats[$cat['slug']] = $existing->id;
            }
        }

        // ── Products ─────────────────────────────────────────────────────────
        $products = [
            // ── Alimentaire ──
            ['code' => 'P00000001', 'name' => 'Riz parfumé 5kg',            'cat' => 'alimentaire',      'buy' => 2500, 'sell' => 3500, 'vat' => 0,  'min' => 10, 'alert' => 5,  'unit' => $unitU,  'brand' => null,          'bc' => '6111111111111', 'stock' => 120],
            ['code' => 'P00000002', 'name' => 'Huile végétale 1L',          'cat' => 'alimentaire',      'buy' => 900,  'sell' => 1200, 'vat' => 18, 'min' => 20, 'alert' => 10, 'unit' => $unitL,  'brand' => null,          'bc' => '6111111111112', 'stock' => 85],
            ['code' => 'P00000003', 'name' => 'Sucre cristallisé 1kg',      'cat' => 'alimentaire',      'buy' => 400,  'sell' => 550,  'vat' => 0,  'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => null,          'bc' => '6111111111113', 'stock' => 200],
            ['code' => 'P00000004', 'name' => 'Tomates concentrées 140g',   'cat' => 'alimentaire',      'buy' => 200,  'sell' => 300,  'vat' => 18, 'min' => 50, 'alert' => 20, 'unit' => $unitU,  'brand' => null,          'bc' => '6111111111114', 'stock' => 150],
            ['code' => 'P00000005', 'name' => 'Eau minérale 1.5L',          'cat' => 'boissons',         'buy' => 150,  'sell' => 250,  'vat' => 18, 'min' => 100,'alert' => 50, 'unit' => $unitL,  'brand' => 'Kirène',      'bc' => '6111111111115', 'stock' => 300],
            ['code' => 'P00000006', 'name' => 'Farine de blé 1kg',          'cat' => 'alimentaire',      'buy' => 350,  'sell' => 500,  'vat' => 0,  'min' => 20, 'alert' => 10, 'unit' => $unitU,  'brand' => 'Patisen',     'bc' => '6111111111116', 'stock' => 95],
            ['code' => 'P00000007', 'name' => 'Lait en poudre 400g',        'cat' => 'produits-laitiers','buy' => 2200, 'sell' => 2800, 'vat' => 0,  'min' => 10, 'alert' => 5,  'unit' => $unitU,  'brand' => 'NMA Sanders', 'bc' => '6111111111117', 'stock' => 60],
            ['code' => 'P00000008', 'name' => 'Café soluble 100g',          'cat' => 'alimentaire',      'buy' => 1200, 'sell' => 1800, 'vat' => 18, 'min' => 10, 'alert' => 5,  'unit' => $unitU,  'brand' => 'Nestlé',      'bc' => '6111111111118', 'stock' => 45],
            ['code' => 'P00000009', 'name' => 'Spaghetti 500g',             'cat' => 'alimentaire',      'buy' => 300,  'sell' => 450,  'vat' => 0,  'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => null,          'bc' => '6111111111119', 'stock' => 110],
            ['code' => 'P00000010', 'name' => 'Thon en conserve 185g',      'cat' => 'alimentaire',      'buy' => 500,  'sell' => 750,  'vat' => 18, 'min' => 20, 'alert' => 10, 'unit' => $unitU,  'brand' => null,          'bc' => '6111111111120', 'stock' => 80],
            ['code' => 'P00000011', 'name' => 'Sardines sauce tomate 125g', 'cat' => 'alimentaire',      'buy' => 250,  'sell' => 400,  'vat' => 18, 'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => null,          'bc' => '6111111111121', 'stock' => 130],
            ['code' => 'P00000012', 'name' => 'Biscuits salés 150g',        'cat' => 'alimentaire',      'buy' => 150,  'sell' => 250,  'vat' => 18, 'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => 'Patisen',     'bc' => '6111111111122', 'stock' => 90],
            // ── Boissons ──
            ['code' => 'P00000013', 'name' => 'Jus de mangue 1L',           'cat' => 'boissons',         'buy' => 400,  'sell' => 650,  'vat' => 18, 'min' => 20, 'alert' => 10, 'unit' => $unitL,  'brand' => 'Kirène',      'bc' => '6111111111123', 'stock' => 75],
            ['code' => 'P00000014', 'name' => 'Eau minérale 500ml',         'cat' => 'boissons',         'buy' => 75,   'sell' => 150,  'vat' => 18, 'min' => 100,'alert' => 50, 'unit' => $unitL,  'brand' => 'Kirène',      'bc' => '6111111111124', 'stock' => 500],
            ['code' => 'P00000015', 'name' => 'Bissap concentré 500ml',     'cat' => 'boissons',         'buy' => 500,  'sell' => 800,  'vat' => 0,  'min' => 15, 'alert' => 8,  'unit' => $unitL,  'brand' => 'Sonati',      'bc' => '6111111111125', 'stock' => 55],
            // ── Produits laitiers ──
            ['code' => 'P00000016', 'name' => 'Lait pasteurisé 1L',         'cat' => 'produits-laitiers','buy' => 600,  'sell' => 850,  'vat' => 0,  'min' => 20, 'alert' => 10, 'unit' => $unitL,  'brand' => 'NMA Sanders', 'bc' => '6111111111126', 'stock' => 40],
            ['code' => 'P00000017', 'name' => 'Yaourt nature 125g',         'cat' => 'produits-laitiers','buy' => 150,  'sell' => 250,  'vat' => 0,  'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => 'NMA Sanders', 'bc' => '6111111111127', 'stock' => 60],
            ['code' => 'P00000018', 'name' => 'Fromage fondu 8 portions',   'cat' => 'produits-laitiers','buy' => 900,  'sell' => 1400, 'vat' => 0,  'min' => 10, 'alert' => 5,  'unit' => $unitU,  'brand' => 'Nestlé',      'bc' => '6111111111128', 'stock' => 30],
            // ── Fruits & Légumes ──
            ['code' => 'P00000019', 'name' => 'Bananes fraîches',           'cat' => 'fruits-legumes',   'buy' => 500,  'sell' => 800,  'vat' => 0,  'min' => 10, 'alert' => 5,  'unit' => $unitKg, 'brand' => null,          'bc' => '6111111111129', 'stock' => 25,  'weight' => true],
            ['code' => 'P00000020', 'name' => 'Tomates fraîches',           'cat' => 'fruits-legumes',   'buy' => 400,  'sell' => 700,  'vat' => 0,  'min' => 10, 'alert' => 5,  'unit' => $unitKg, 'brand' => null,          'bc' => '6111111111130', 'stock' => 20,  'weight' => true],
            ['code' => 'P00000021', 'name' => 'Oignons',                    'cat' => 'fruits-legumes',   'buy' => 200,  'sell' => 400,  'vat' => 0,  'min' => 15, 'alert' => 8,  'unit' => $unitKg, 'brand' => null,          'bc' => '6111111111131', 'stock' => 30,  'weight' => true],
            // ── Hygiène & Beauté ──
            ['code' => 'P00000022', 'name' => 'Dentifrice 100ml',           'cat' => 'hygiene-beaute',   'buy' => 500,  'sell' => 850,  'vat' => 18, 'min' => 15, 'alert' => 8,  'unit' => $unitU,  'brand' => 'Unilever',    'bc' => '6111111111132', 'stock' => 45],
            ['code' => 'P00000023', 'name' => 'Shampoing 400ml',            'cat' => 'hygiene-beaute',   'buy' => 1500, 'sell' => 2500, 'vat' => 18, 'min' => 10, 'alert' => 5,  'unit' => $unitL,  'brand' => 'Unilever',    'bc' => '6111111111133', 'stock' => 35],
            ['code' => 'P00000024', 'name' => 'Savon de toilette 100g',     'cat' => 'hygiene-beaute',   'buy' => 200,  'sell' => 350,  'vat' => 18, 'min' => 30, 'alert' => 15, 'unit' => $unitU,  'brand' => 'Unilever',    'bc' => '6111111111134', 'stock' => 80],
            ['code' => 'P00000025', 'name' => 'Détergent en poudre 500g',   'cat' => 'hygiene-beaute',   'buy' => 350,  'sell' => 600,  'vat' => 18, 'min' => 20, 'alert' => 10, 'unit' => $unitU,  'brand' => 'Unilever',    'bc' => '6111111111135', 'stock' => 60],
            // ── Restaurant — Plats ──
            ['code' => 'P00000026', 'name' => 'Thiéboudienne',              'cat' => 'plats-resto',      'buy' => 1500, 'sell' => 3500, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111136', 'stock' => 0],
            ['code' => 'P00000027', 'name' => 'Yassa Poulet',               'cat' => 'plats-resto',      'buy' => 1200, 'sell' => 3000, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111137', 'stock' => 0],
            ['code' => 'P00000028', 'name' => 'Mafé Bœuf',                  'cat' => 'plats-resto',      'buy' => 1300, 'sell' => 3200, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111138', 'stock' => 0],
            ['code' => 'P00000029', 'name' => 'Poulet DG',                  'cat' => 'plats-resto',      'buy' => 1400, 'sell' => 3500, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111139', 'stock' => 0],
            ['code' => 'P00000030', 'name' => 'Thiep Yap',                  'cat' => 'plats-resto',      'buy' => 1200, 'sell' => 2800, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111140', 'stock' => 0],
            ['code' => 'P00000031', 'name' => 'Grillades mixtes',           'cat' => 'plats-resto',      'buy' => 2000, 'sell' => 5000, 'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Ngaparou Foods','bc' => '6111111111141', 'stock' => 0],
            // ── Restaurant — Boissons ──
            ['code' => 'P00000032', 'name' => 'Jus de Bissap (verre)',      'cat' => 'boissons-resto',   'buy' => 100,  'sell' => 500,  'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => null,          'bc' => '6111111111142', 'stock' => 0],
            ['code' => 'P00000033', 'name' => 'Café Touba',                 'cat' => 'boissons-resto',   'buy' => 50,   'sell' => 300,  'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => null,          'bc' => '6111111111143', 'stock' => 0],
            ['code' => 'P00000034', 'name' => 'Jus de Ditax',               'cat' => 'boissons-resto',   'buy' => 80,   'sell' => 500,  'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => null,          'bc' => '6111111111144', 'stock' => 0],
            ['code' => 'P00000035', 'name' => 'Eau minérale (bouteille)',   'cat' => 'boissons-resto',   'buy' => 75,   'sell' => 300,  'vat' => 0,  'min' => 0,  'alert' => 0,  'unit' => $unitPtn,'brand' => 'Kirène',      'bc' => '6111111111145', 'stock' => 0],
        ];

        foreach ($products as $p) {
            $brandId   = ($p['brand'] ?? null) ? ($brands[$p['brand']]->id ?? null) : null;
            $catId     = $cats[$p['cat']] ?? null;
            $isWeight  = $p['weight'] ?? false;
            $unit      = $p['unit'];
            $stockQty  = $p['stock'] ?? 0;

            $product = Product::firstOrCreate(['internal_code' => $p['code']], [
                'store_id'          => $store->id,
                'internal_code'     => $p['code'],
                'name'              => $p['name'],
                'category_id'       => $catId,
                'brand_id'          => $brandId,
                'unit_id'           => $unit?->id,
                'purchase_price_ht' => $p['buy'],
                'sale_price_ttc'    => $p['sell'],
                'vat_rate'          => $p['vat'],
                'is_weight_based'   => $isWeight,
                'min_stock'         => $p['min'],
                'alert_stock'       => $p['alert'],
                'is_active'         => true,
            ]);

            ProductBarcode::firstOrCreate(['barcode' => $p['bc'], 'type' => 'ean13'], [
                'product_id' => $product->id,
                'barcode'    => $p['bc'],
                'type'       => 'ean13',
                'is_primary' => true,
            ]);

            StockLevel::firstOrCreate(['store_id' => $store->id, 'product_id' => $product->id], [
                'qty_on_hand' => $stockQty,
                'avg_cost'    => $p['buy'],
                'last_updated' => now(),
            ]);
        }

        $this->command->info('✅ Catalogue : ' . count($products) . ' produits, ' . count($brands) . ' marques, ' . count($catDefs) . ' catégories');
    }
}
