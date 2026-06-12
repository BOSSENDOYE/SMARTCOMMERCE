<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Store;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LossSeeder extends Seeder
{
    public function run(): void
    {
        $store     = Store::where('code', 'MAIN')->firstOrFail();
        $magasin   = DB::table('users')->where('email', 'stock@smartcommerce.sn')->first();
        $gerant    = DB::table('users')->where('email', 'gerant@smartcommerce.sn')->first();

        if (! $magasin) {
            $this->command->warn('⚠️  Magasinier introuvable — vérifier que SetupSeeder a été exécuté');
            return;
        }

        /** @var StockService $stockService */
        $stockService = app(StockService::class);

        $losses = [
            [
                'ref'     => 'PRT' . now()->subDays(5)->format('Ymd') . '0001',
                'product' => 'P00000017', // Yaourt nature
                'type'    => 'breakage',
                'qty'     => 12,
                'status'  => 'validated',
                'notes'   => 'Chute de palette — 12 pots brisés',
                'date'    => now()->subDays(5),
                'validator' => $gerant,
            ],
            [
                'ref'     => 'PRT' . now()->subDays(4)->format('Ymd') . '0001',
                'product' => 'P00000004', // Tomates concentrées
                'type'    => 'expiry',
                'qty'     => 24,
                'status'  => 'validated',
                'notes'   => 'Lot périmé — date dépassée',
                'date'    => now()->subDays(4),
                'validator' => $gerant,
            ],
            [
                'ref'     => 'PRT' . now()->subDays(3)->format('Ymd') . '0001',
                'product' => 'P00000014', // Eau minérale 500ml
                'type'    => 'breakage',
                'qty'     => 48,
                'status'  => 'validated',
                'notes'   => 'Bouteilles écrasées — livraison',
                'date'    => now()->subDays(3),
                'validator' => $gerant,
            ],
            [
                'ref'     => 'PRT' . now()->subDays(2)->format('Ymd') . '0001',
                'product' => 'P00000012', // Biscuits
                'type'    => 'theft',
                'qty'     => 5,
                'status'  => 'pending',
                'notes'   => 'Soupçon de vol — enquête en cours',
                'date'    => now()->subDays(2),
                'validator' => null,
            ],
            [
                'ref'     => 'PRT' . now()->subDays(1)->format('Ymd') . '0001',
                'product' => 'P00000008', // Café soluble
                'type'    => 'internal_use',
                'qty'     => 2,
                'status'  => 'validated',
                'notes'   => 'Usage cuisine du personnel',
                'date'    => now()->subDays(1),
                'validator' => $gerant,
            ],
            [
                'ref'     => 'PRT' . now()->subDays(6)->format('Ymd') . '0001',
                'product' => 'P00000007', // Lait en poudre
                'type'    => 'expiry',
                'qty'     => 3,
                'status'  => 'rejected',
                'notes'   => 'Erreur de lecture date — réintégré en stock',
                'date'    => now()->subDays(6),
                'validator' => $gerant,
            ],
        ];

        $count = 0;
        foreach ($losses as $l) {
            if (DB::table('losses')->where('reference', $l['ref'])->exists()) continue;

            $product = Product::where('internal_code', $l['product'])->first();
            if (! $product) continue;

            $level = DB::table('stock_levels')
                ->where('store_id', $store->id)
                ->where('product_id', $product->id)
                ->first();

            $unitCost = $level ? $level->avg_cost : $product->purchase_price_ht;

            $lossId = DB::table('losses')->insertGetId([
                'store_id'     => $store->id,
                'product_id'   => $product->id,
                'user_id'      => $magasin->id,
                'validator_id' => $l['validator']?->id,
                'reference'    => $l['ref'],
                'type'         => $l['type'],
                'qty'          => $l['qty'],
                'unit_cost'    => $unitCost,
                'notes'        => $l['notes'],
                'status'       => $l['status'],
                'validated_at' => $l['validator'] ? $l['date']->addHours(2) : null,
                'created_at'   => $l['date'],
                'updated_at'   => $l['date'],
            ]);

            // Debit stock for validated/pending losses (rejected = stock restored)
            if ($l['status'] !== 'rejected') {
                try {
                    $stockService->move(
                        $store->id,
                        $product->id,
                        'loss',
                        $l['qty'],
                        $unitCost,
                        null,
                        $magasin->id,
                        'App\Models\Loss',
                        $lossId,
                        $l['notes']
                    );
                } catch (\Exception $e) {
                    // Stock level might not exist for restaurant products
                }
            }

            $count++;
        }

        $this->command->info("✅ Pertes : {$count} pertes enregistrées");
    }
}
