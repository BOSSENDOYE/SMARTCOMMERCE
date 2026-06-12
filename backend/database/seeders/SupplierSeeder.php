<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::where('code', 'MAIN')->firstOrFail();

        // ── Suppliers ────────────────────────────────────────────────────────
        $supplierDefs = [
            [
                'store_id'       => $store->id,
                'company_name'   => 'PATISEN SA',
                'ninea'          => '007001234',
                'rc'             => 'SN-DKR-2005-B-00045',
                'address'        => 'Zone Industrielle de Mbao, Dakar',
                'phone'          => '+221 33 879 00 00',
                'email'          => 'commercial@patisen.sn',
                'contact_name'   => 'Cheikh Diallo',
                'payment_terms'  => '30_days',
                'delivery_days_avg' => 3,
                'is_active'      => true,
            ],
            [
                'store_id'       => $store->id,
                'company_name'   => 'NMA Sanders',
                'ninea'          => '007002345',
                'rc'             => 'SN-DKR-1992-B-00012',
                'address'        => 'Route de Rufisque, Dakar',
                'phone'          => '+221 33 836 00 00',
                'email'          => 'ventes@nma-sanders.sn',
                'contact_name'   => 'Mariama Traoré',
                'payment_terms'  => '45_days',
                'delivery_days_avg' => 5,
                'is_active'      => true,
            ],
            [
                'store_id'       => $store->id,
                'company_name'   => 'Kirène SA',
                'ninea'          => '007003456',
                'rc'             => 'SN-DKR-2000-B-00078',
                'address'        => 'KM 12, Route de Rufisque, Dakar',
                'phone'          => '+221 33 855 00 00',
                'email'          => 'commercial@kirene.sn',
                'contact_name'   => 'Abdou Sow',
                'payment_terms'  => '30_days',
                'delivery_days_avg' => 2,
                'is_active'      => true,
            ],
            [
                'store_id'       => $store->id,
                'company_name'   => 'Nestlé Sénégal',
                'ninea'          => '007004567',
                'rc'             => 'SN-DKR-1995-B-00034',
                'address'        => 'Rue de Thiong, Plateau, Dakar',
                'phone'          => '+221 33 849 00 00',
                'email'          => 'service.client@nestle.sn',
                'contact_name'   => 'Ndèye Fall',
                'payment_terms'  => '60_days',
                'delivery_days_avg' => 7,
                'is_active'      => true,
            ],
            [
                'store_id'       => $store->id,
                'company_name'   => 'Unilever Sénégal',
                'ninea'          => '007005678',
                'rc'             => 'SN-DKR-1990-B-00009',
                'address'        => 'ZI Hann, Dakar',
                'phone'          => '+221 33 860 00 00',
                'email'          => 'distribution@unilever.sn',
                'contact_name'   => 'Omar Niang',
                'payment_terms'  => '45_days',
                'delivery_days_avg' => 5,
                'is_active'      => true,
            ],
            [
                'store_id'       => $store->id,
                'company_name'   => 'Grossiste Sandaga Frères',
                'ninea'          => '007006789',
                'rc'             => 'SN-DKR-2010-B-00201',
                'address'        => 'Marché Sandaga, Plateau, Dakar',
                'phone'          => '+221 77 530 12 34',
                'email'          => 'sandagafreres@gmail.com',
                'contact_name'   => 'Moustapha Kane',
                'payment_terms'  => 'immediate',
                'delivery_days_avg' => 1,
                'is_active'      => true,
            ],
        ];

        $supplierIds = [];
        foreach ($supplierDefs as $def) {
            $existing = DB::table('suppliers')
                ->where('store_id', $store->id)
                ->where('company_name', $def['company_name'])
                ->first();

            if (! $existing) {
                $supplierIds[$def['company_name']] = DB::table('suppliers')->insertGetId(array_merge($def, [
                    'balance_due' => 0,
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]));
            } else {
                $supplierIds[$def['company_name']] = $existing->id;
            }
        }

        // ── Product–Supplier links ────────────────────────────────────────────
        $links = [
            ['P00000001', 'Grossiste Sandaga Frères', 'RICE-5KG',     2300, true],
            ['P00000002', 'Patisen SA',               'HV-1L-PTSNC',  850,  true],
            ['P00000002', 'Grossiste Sandaga Frères', null,            900,  false],
            ['P00000003', 'Grossiste Sandaga Frères', 'SUCRE-1KG',    380,  true],
            ['P00000004', 'Grossiste Sandaga Frères', null,            190,  true],
            ['P00000005', 'Kirène SA',                'EAU-1L5-KRN',  140,  true],
            ['P00000006', 'Patisen SA',               'FAR-1KG-PTSN', 330,  true],
            ['P00000007', 'NMA Sanders',              'LP-400G-NMA',  2100, true],
            ['P00000008', 'Nestlé Sénégal',           'NSC-100G',     1150, true],
            ['P00000013', 'Kirène SA',                'JUS-MG-1L',    380,  true],
            ['P00000014', 'Kirène SA',                'EAU-500ML-KRN',72,   true],
            ['P00000015', 'Grossiste Sandaga Frères', null,            480,  true],
            ['P00000016', 'NMA Sanders',              'LAIT-1L-NMA',  580,  true],
            ['P00000017', 'NMA Sanders',              'YAO-125G',     140,  true],
            ['P00000018', 'Nestlé Sénégal',           'FF-8P',        880,  true],
            ['P00000019', 'Grossiste Sandaga Frères', 'BAN-KG',       480,  true],
            ['P00000020', 'Grossiste Sandaga Frères', 'TOM-KG',       380,  true],
            ['P00000021', 'Grossiste Sandaga Frères', 'OIG-KG',       190,  true],
            ['P00000022', 'Unilever Sénégal',         'DENT-100ML',   480,  true],
            ['P00000023', 'Unilever Sénégal',         'SHP-400ML',    1450, true],
            ['P00000024', 'Unilever Sénégal',         'SAV-100G',     190,  true],
            ['P00000025', 'Unilever Sénégal',         'DET-500G',     330,  true],
        ];

        foreach ($links as [$code, $supplierName, $ref, $price, $preferred]) {
            $productId  = Product::where('internal_code', $code)->value('id');
            $supplierId = $supplierIds[$supplierName] ?? null;

            if ($productId && $supplierId) {
                $exists = DB::table('product_suppliers')
                    ->where('product_id', $productId)
                    ->where('supplier_id', $supplierId)
                    ->exists();

                if (! $exists) {
                    DB::table('product_suppliers')->insert([
                        'product_id'          => $productId,
                        'supplier_id'         => $supplierId,
                        'supplier_ref'        => $ref,
                        'negotiated_price_ht' => $price,
                        'is_preferred'        => $preferred,
                        'created_at'          => now(),
                        'updated_at'          => now(),
                    ]);
                }
            }
        }

        // ── Purchase Orders (2 samples) ───────────────────────────────────────
        $gerantId = DB::table('users')->where('email', 'gerant@smartcommerce.sn')->value('id');

        $orders = [
            [
                'ref'         => 'BC2026060001',
                'supplier'    => 'PATISEN SA',
                'status'      => 'received',
                'total_ht'    => 47500,
                'total_ttc'   => 56050,
                'expected'    => now()->subDays(5)->toDateString(),
                'items'       => [
                    ['P00000006', 50, 330, 18],
                    ['P00000002', 50, 850, 18],
                ],
            ],
            [
                'ref'         => 'BC2026060002',
                'supplier'    => 'Kirène SA',
                'status'      => 'sent',
                'total_ht'    => 51600,
                'total_ttc'   => 60888,
                'expected'    => now()->addDays(2)->toDateString(),
                'items'       => [
                    ['P00000005', 200, 140, 18],
                    ['P00000014', 200, 72,  18],
                ],
            ],
        ];

        foreach ($orders as $o) {
            $exists = DB::table('purchase_orders')->where('reference', $o['ref'])->exists();
            if ($exists) continue;

            $supplierId = $supplierIds[$o['supplier']] ?? null;
            if (! $supplierId) continue;

            $poId = DB::table('purchase_orders')->insertGetId([
                'store_id'        => $store->id,
                'supplier_id'     => $supplierId,
                'user_id'         => $gerantId,
                'reference'       => $o['ref'],
                'status'          => $o['status'],
                'generation_type' => 'manual',
                'total_ht'        => $o['total_ht'],
                'total_ttc'       => $o['total_ttc'],
                'expected_date'   => $o['expected'],
                'created_at'      => now()->subDays(7),
                'updated_at'      => now(),
            ]);

            foreach ($o['items'] as [$code, $qty, $price, $vat]) {
                $productId = Product::where('internal_code', $code)->value('id');
                if ($productId) {
                    DB::table('purchase_order_items')->insert([
                        'purchase_order_id' => $poId,
                        'product_id'        => $productId,
                        'qty_ordered'       => $qty,
                        'unit_price_ht'     => $price,
                        'vat_rate'          => $vat,
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);
                }
            }
        }

        $count = count($supplierIds);
        $this->command->info("✅ Fournisseurs : {$count} fournisseurs, " . count($links) . " liens produit-fournisseur, 2 bons de commande");
    }
}
