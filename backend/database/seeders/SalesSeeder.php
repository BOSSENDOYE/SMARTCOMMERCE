<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SalesSeeder extends Seeder
{
    public function run(): void
    {
        $store    = Store::where('code', 'MAIN')->firstOrFail();
        $caissier = DB::table('users')->where('email', 'caissier@smartcommerce.sn')->first();
        $gerant   = DB::table('users')->where('email', 'gerant@smartcommerce.sn')->first();

        if (! $caissier) {
            $this->command->warn('⚠️  Caissier introuvable — vérifier que SetupSeeder a été exécuté');
            return;
        }

        // ── Workstation ─────────────────────────────────────────────────────
        $wsId = DB::table('workstations')
            ->where('store_id', $store->id)
            ->where('name', 'Caisse Principale')
            ->value('id');

        if (! $wsId) {
            $wsId = DB::table('workstations')->insertGetId([
                'store_id'   => $store->id,
                'name'       => 'Caisse Principale',
                'type'       => 'pos',
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // ── Cash Session (fermée — pour données historiques) ─────────────────
        $sessionId = DB::table('cash_sessions')
            ->where('store_id', $store->id)
            ->where('status', 'closed')
            ->value('id');

        if (! $sessionId) {
            $sessionId = DB::table('cash_sessions')->insertGetId([
                'store_id'                   => $store->id,
                'workstation_id'             => $wsId,
                'user_id'                    => $caissier->id,
                'status'                     => 'closed',
                'opening_balance'            => 50000,
                'closing_balance_expected'   => 487350,
                'closing_balance_actual'     => 485000,
                'closing_balance_variance'   => -2350,
                'opened_at'                  => now()->subDays(1)->setHour(8)->setMinute(0),
                'closed_at'                  => now()->subDays(1)->setHour(20)->setMinute(30),
                'closed_by'                  => $gerant->id,
                'created_at'                 => now()->subDays(1),
                'updated_at'                 => now()->subDays(1),
            ]);
        }

        // Clients
        $clients = DB::table('clients')->where('store_id', $store->id)->get()->keyBy('name');

        // Products
        $getProduct = fn(string $code) => Product::where('internal_code', $code)->first();
        $riz    = $getProduct('P00000001');
        $huile  = $getProduct('P00000002');
        $sucre  = $getProduct('P00000003');
        $tomate = $getProduct('P00000004');
        $eau15  = $getProduct('P00000005');
        $farine = $getProduct('P00000006');
        $lait   = $getProduct('P00000007');
        $cafe   = $getProduct('P00000008');
        $spagh  = $getProduct('P00000009');
        $thon   = $getProduct('P00000010');
        $bisco  = $getProduct('P00000012');
        $jus    = $getProduct('P00000013');
        $eau5   = $getProduct('P00000014');
        $yaourt = $getProduct('P00000017');
        $dent   = $getProduct('P00000022');
        $savon  = $getProduct('P00000024');

        // Sale helper
        $createSale = function (array $s) use ($store, $wsId, $sessionId) {
            $ref = $s['ref'];
            if (DB::table('sales')->where('reference', $ref)->exists()) return;

            $saleId = DB::table('sales')->insertGetId([
                'store_id'             => $store->id,
                'workstation_id'       => $wsId,
                'cash_session_id'      => $sessionId,
                'client_id'            => $s['client_id'] ?? null,
                'user_id'              => $s['user_id'],
                'reference'            => $ref,
                'status'               => 'completed',
                'channel'              => 'pos',
                'subtotal_ht'          => $s['subtotal_ht'],
                'vat_amount'           => $s['vat_amount'],
                'discount_amount'      => $s['discount'] ?? 0,
                'total_ttc'            => $s['total_ttc'],
                'paid_amount'          => $s['paid'],
                'change_amount'        => max(0, $s['paid'] - $s['total_ttc']),
                'loyalty_points_earned' => round($s['total_ttc'] / 1000),
                'loyalty_points_used'  => 0,
                'is_synced'            => true,
                'created_at'           => $s['date'],
                'updated_at'           => $s['date'],
            ]);

            // Items
            foreach ($s['items'] as $item) {
                [$product, $qty, $vatRate] = $item;
                if (! $product) continue;
                $unitPriceTtc = $product->sale_price_ttc;
                $unitPriceHt  = $vatRate > 0 ? round($unitPriceTtc / (1 + $vatRate / 100), 2) : $unitPriceTtc;
                $totalHt      = round($unitPriceHt * $qty, 2);
                $totalTtc     = round($unitPriceTtc * $qty, 2);

                DB::table('sale_items')->insert([
                    'sale_id'         => $saleId,
                    'product_id'      => $product->id,
                    'qty'             => $qty,
                    'unit_price_ttc'  => $unitPriceTtc,
                    'unit_price_ht'   => $unitPriceHt,
                    'vat_rate'        => $vatRate,
                    'discount_pct'    => 0,
                    'discount_amount' => 0,
                    'total_ht'        => $totalHt,
                    'total_ttc'       => $totalTtc,
                    'cost_price'      => $product->purchase_price_ht,
                    'created_at'      => $s['date'],
                    'updated_at'      => $s['date'],
                ]);
            }

            // Payment
            DB::table('sale_payments')->insert([
                'sale_id'        => $saleId,
                'payment_method' => $s['payment'] ?? 'cash',
                'amount'         => $s['paid'],
                'is_confirmed'   => true,
                'created_at'     => $s['date'],
                'updated_at'     => $s['date'],
            ]);

            // Stock movements (debit)
            foreach ($s['items'] as $item) {
                [$product, $qty] = $item;
                if (! $product) continue;
                $level = DB::table('stock_levels')
                    ->where('store_id', $store->id)
                    ->where('product_id', $product->id)
                    ->first();
                if (! $level) continue;

                $stockAfter = $level->qty_on_hand - $qty;
                DB::table('stock_levels')
                    ->where('store_id', $store->id)
                    ->where('product_id', $product->id)
                    ->update(['qty_on_hand' => $stockAfter, 'last_updated' => now()]);

                DB::table('stock_movements')->insert([
                    'store_id'       => $store->id,
                    'product_id'     => $product->id,
                    'user_id'        => $s['user_id'],
                    'type'           => 'sale_out',
                    'qty'            => $qty,
                    'unit_cost'      => $product->purchase_price_ht,
                    'stock_after'    => max(0, $stockAfter),
                    'reference_type' => 'App\Models\Sale',
                    'reference_id'   => $saleId,
                    'created_at'     => $s['date'],
                ]);
            }
        };

        $clientAbdoulaye = $clients->get('Abdoulaye Diop');
        $clientMamadou   = $clients->get('Mamadou Ndiaye');
        $clientIbrahima  = $clients->get('Ibrahima Konaté');
        $clientPape      = $clients->get('Pape Sarr');
        $clientSonatel   = $clients->get('SONATEL SA');

        $sales = [
            [
                'ref' => 'V' . now()->subDays(6)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'client_id' => $clientAbdoulaye?->id,
                'date' => now()->subDays(6)->setHour(9)->setMinute(15),
                'items' => [[$riz, 2, 0], [$huile, 3, 18], [$sucre, 2, 0]],
                'subtotal_ht' => 10050, 'vat_amount' => 648, 'total_ttc' => 11950,
                'paid' => 12000, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->subDays(6)->format('Ymd') . '0002',
                'user_id' => $caissier->id,
                'date' => now()->subDays(6)->setHour(11)->setMinute(30),
                'items' => [[$eau15, 10, 18], [$jus, 5, 18], [$bisco, 8, 18]],
                'subtotal_ht' => 5508, 'vat_amount' => 991, 'total_ttc' => 7750,
                'paid' => 8000, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->subDays(5)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'client_id' => $clientMamadou?->id,
                'date' => now()->subDays(5)->setHour(8)->setMinute(45),
                'items' => [[$farine, 5, 0], [$sucre, 5, 0], [$lait, 2, 0]],
                'subtotal_ht' => 11100, 'vat_amount' => 0, 'total_ttc' => 11100,
                'paid' => 12000, 'payment' => 'wave',
            ],
            [
                'ref' => 'V' . now()->subDays(5)->format('Ymd') . '0002',
                'user_id' => $caissier->id,
                'date' => now()->subDays(5)->setHour(14)->setMinute(20),
                'items' => [[$tomate, 10, 18], [$thon, 4, 18], [$spagh, 6, 0]],
                'subtotal_ht' => 7288, 'vat_amount' => 1312, 'total_ttc' => 7900,
                'paid' => 8000, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->subDays(4)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'client_id' => $clientIbrahima?->id,
                'date' => now()->subDays(4)->setHour(10)->setMinute(0),
                'items' => [[$riz, 5, 0], [$huile, 5, 18], [$sucre, 10, 0], [$tomate, 20, 18], [$farine, 5, 0]],
                'subtotal_ht' => 42161, 'vat_amount' => 5064, 'total_ttc' => 49250,
                'paid' => 50000, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->subDays(4)->format('Ymd') . '0002',
                'user_id' => $caissier->id,
                'date' => now()->subDays(4)->setHour(15)->setMinute(30),
                'items' => [[$dent, 2, 18], [$savon, 6, 18], [$cafe, 1, 18]],
                'subtotal_ht' => 5847, 'vat_amount' => 1053, 'total_ttc' => 6850,
                'paid' => 7000, 'payment' => 'orange_money',
            ],
            [
                'ref' => 'V' . now()->subDays(3)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'client_id' => $clientSonatel?->id,
                'date' => now()->subDays(3)->setHour(9)->setMinute(0),
                'items' => [[$eau5, 50, 18], [$eau15, 24, 18], [$jus, 20, 18]],
                'subtotal_ht' => 24407, 'vat_amount' => 4393, 'total_ttc' => 33700,
                'paid' => 33700, 'payment' => 'credit',
            ],
            [
                'ref' => 'V' . now()->subDays(2)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'date' => now()->subDays(2)->setHour(11)->setMinute(15),
                'items' => [[$yaourt, 10, 0], [$lait, 4, 0], [$bisco, 5, 18]],
                'subtotal_ht' => 6441, 'vat_amount' => 213, 'total_ttc' => 5150,
                'paid' => 5500, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->subDays(1)->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'client_id' => $clientPape?->id,
                'date' => now()->subDays(1)->setHour(9)->setMinute(30),
                'items' => [[$riz, 10, 0], [$huile, 8, 18], [$sucre, 10, 0], [$spagh, 10, 0]],
                'subtotal_ht' => 57627, 'vat_amount' => 1732, 'total_ttc' => 60650,
                'paid' => 65000, 'payment' => 'cash',
            ],
            [
                'ref' => 'V' . now()->format('Ymd') . '0001',
                'user_id' => $caissier->id,
                'date' => now()->setHour(8)->setMinute(45),
                'items' => [[$eau5, 5, 18], [$cafe, 1, 18], [$bisco, 3, 18]],
                'subtotal_ht' => 2517, 'vat_amount' => 453, 'total_ttc' => 2700,
                'paid' => 3000, 'payment' => 'cash',
            ],
        ];

        $created = 0;
        foreach ($sales as $s) {
            $createSale($s);
            $created++;
        }

        $this->command->info("✅ Ventes : {$created} ventes créées (J-6 à aujourd'hui)");
    }
}
