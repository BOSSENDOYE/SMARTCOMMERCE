<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RestaurantSeeder extends Seeder
{
    public function run(): void
    {
        $store   = Store::where('code', 'MAIN')->firstOrFail();
        $serveur = DB::table('users')->where('email', 'serveur@smartcommerce.sn')->first();
        $gerant  = DB::table('users')->where('email', 'gerant@smartcommerce.sn')->first();

        if (! $serveur) {
            $this->command->warn('⚠️  Serveur introuvable — vérifier que SetupSeeder a été exécuté');
            return;
        }

        // ── Production Stations ───────────────────────────────────────────────
        $stations = [
            ['name' => 'Cuisine chaude', 'type' => 'hot',  'uses_kds' => true,  'prints_tickets' => true,  'alert_time_minutes' => 20],
            ['name' => 'Bar',            'type' => 'bar',  'uses_kds' => true,  'prints_tickets' => false, 'alert_time_minutes' => 5],
            ['name' => 'Plonge froide',  'type' => 'cold', 'uses_kds' => false, 'prints_tickets' => false, 'alert_time_minutes' => 10],
        ];

        $stationIds = [];
        foreach ($stations as $s) {
            $id = DB::table('production_stations')
                ->where('store_id', $store->id)
                ->where('name', $s['name'])
                ->value('id');

            if (! $id) {
                $id = DB::table('production_stations')->insertGetId(array_merge($s, [
                    'store_id'   => $store->id,
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
            }
            $stationIds[$s['name']] = $id;
        }

        // ── Dining Areas & Tables ─────────────────────────────────────────────
        $areas = [
            [
                'name' => 'Salle principale', 'type' => 'indoor', 'color' => '#4CAF50', 'sort_order' => 1,
                'tables' => [
                    ['T01', 4, 50, 50], ['T02', 4, 150, 50], ['T03', 4, 250, 50],
                    ['T04', 6, 50, 150], ['T05', 6, 150, 150], ['T06', 6, 250, 150],
                    ['T07', 2, 50, 250], ['T08', 2, 150, 250], ['T09', 4, 250, 250],
                    ['T10', 8, 150, 350],
                ],
            ],
            [
                'name' => 'Terrasse', 'type' => 'terrace', 'color' => '#FF9800', 'sort_order' => 2,
                'tables' => [
                    ['T11', 4, 50, 50], ['T12', 4, 150, 50], ['T13', 4, 250, 50],
                    ['T14', 4, 50, 150], ['T15', 4, 150, 150], ['T16', 6, 250, 150],
                    ['T17', 2, 50, 250], ['T18', 2, 150, 250],
                ],
            ],
            [
                'name' => 'Bar', 'type' => 'bar', 'color' => '#9C27B0', 'sort_order' => 3,
                'tables' => [
                    ['B01', 2, 50, 50], ['B02', 2, 150, 50], ['B03', 2, 250, 50], ['B04', 4, 150, 150],
                ],
            ],
            [
                'name' => 'Salon VIP', 'type' => 'vip', 'color' => '#F44336', 'sort_order' => 4,
                'tables' => [
                    ['V01', 8, 100, 100], ['V02', 10, 300, 100],
                ],
            ],
        ];

        $tableIds = [];
        foreach ($areas as $areaDef) {
            $areaId = DB::table('dining_areas')
                ->where('store_id', $store->id)
                ->where('name', $areaDef['name'])
                ->value('id');

            if (! $areaId) {
                $areaId = DB::table('dining_areas')->insertGetId([
                    'store_id'   => $store->id,
                    'name'       => $areaDef['name'],
                    'type'       => $areaDef['type'],
                    'color'      => $areaDef['color'],
                    'sort_order' => $areaDef['sort_order'],
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            foreach ($areaDef['tables'] as [$number, $seats, $posX, $posY]) {
                $tId = DB::table('tables')
                    ->where('area_id', $areaId)
                    ->where('number', $number)
                    ->value('id');

                if (! $tId) {
                    $tId = DB::table('tables')->insertGetId([
                        'area_id'    => $areaId,
                        'number'     => $number,
                        'seats'      => $seats,
                        'status'     => 'free',
                        'pos_x'      => $posX,
                        'pos_y'      => $posY,
                        'shape'      => 'rectangle',
                        'is_active'  => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                $tableIds[$number] = $tId;
            }
        }

        // ── Active Sessions & Orders (3 tables occupées) ─────────────────────
        $products = [
            'thieb'  => Product::where('internal_code', 'P00000026')->first(),
            'yassa'  => Product::where('internal_code', 'P00000027')->first(),
            'mafe'   => Product::where('internal_code', 'P00000028')->first(),
            'poulet' => Product::where('internal_code', 'P00000029')->first(),
            'bissap' => Product::where('internal_code', 'P00000032')->first(),
            'cafe'   => Product::where('internal_code', 'P00000033')->first(),
            'eau'    => Product::where('internal_code', 'P00000035')->first(),
        ];

        $activeSessions = [
            [
                'table' => 'T03',
                'covers' => 3,
                'opened_ago' => 45, // minutes
                'orders' => [
                    [
                        'ref'     => 'CMD' . now()->format('Ymd') . 'R001',
                        'status'  => 'preparing',
                        'channel' => 'dine_in',
                        'items'   => [
                            ['product' => 'thieb',  'qty' => 2, 'course' => 'main',  'status' => 'preparing'],
                            ['product' => 'yassa',  'qty' => 1, 'course' => 'main',  'status' => 'preparing'],
                            ['product' => 'bissap', 'qty' => 3, 'course' => 'drink', 'status' => 'ready'],
                        ],
                    ],
                ],
            ],
            [
                'table' => 'T07',
                'covers' => 2,
                'opened_ago' => 20,
                'orders' => [
                    [
                        'ref'     => 'CMD' . now()->format('Ymd') . 'R002',
                        'status'  => 'pending',
                        'channel' => 'dine_in',
                        'items'   => [
                            ['product' => 'mafe',  'qty' => 2, 'course' => 'main',  'status' => 'pending'],
                            ['product' => 'eau',   'qty' => 2, 'course' => 'drink', 'status' => 'pending'],
                        ],
                    ],
                ],
            ],
            [
                'table' => 'B02',
                'covers' => 2,
                'opened_ago' => 90,
                'orders' => [
                    [
                        'ref'     => 'CMD' . now()->format('Ymd') . 'R003',
                        'status'  => 'served',
                        'channel' => 'dine_in',
                        'items'   => [
                            ['product' => 'poulet', 'qty' => 2, 'course' => 'main',  'status' => 'served'],
                            ['product' => 'cafe',   'qty' => 2, 'course' => 'drink', 'status' => 'served'],
                        ],
                    ],
                ],
            ],
        ];

        foreach ($activeSessions as $sess) {
            $tableId = $tableIds[$sess['table']] ?? null;
            if (! $tableId) continue;

            // Skip if this table already has an active session
            $existingSession = DB::table('table_sessions')
                ->where('table_id', $tableId)
                ->whereNull('closed_at')
                ->first();
            if ($existingSession) continue;

            $sessionId = DB::table('table_sessions')->insertGetId([
                'table_id'   => $tableId,
                'opened_by'  => $serveur->id,
                'covers'     => $sess['covers'],
                'opened_at'  => now()->subMinutes($sess['opened_ago']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $tableStatus = 'occupied';

            foreach ($sess['orders'] as $orderDef) {
                if (DB::table('orders')->where('reference', $orderDef['ref'])->exists()) continue;

                $total = 0;
                foreach ($orderDef['items'] as $item) {
                    $prod = $products[$item['product']] ?? null;
                    if ($prod) $total += $prod->sale_price_ttc * $item['qty'];
                }

                $orderId = DB::table('orders')->insertGetId([
                    'store_id'         => $store->id,
                    'table_session_id' => $sessionId,
                    'user_id'          => $serveur->id,
                    'reference'        => $orderDef['ref'],
                    'status'           => $orderDef['status'],
                    'channel'          => $orderDef['channel'],
                    'covers'           => $sess['covers'],
                    'total_amount'     => $total,
                    'created_at'       => now()->subMinutes($sess['opened_ago'] - 2),
                    'updated_at'       => now(),
                ]);

                foreach ($orderDef['items'] as $item) {
                    $prod = $products[$item['product']] ?? null;
                    if (! $prod) continue;

                    $stationId = in_array($item['course'], ['drink', 'other'])
                        ? ($stationIds['Bar'] ?? null)
                        : ($stationIds['Cuisine chaude'] ?? null);

                    DB::table('order_items')->insert([
                        'order_id'   => $orderId,
                        'product_id' => $prod->id,
                        'station_id' => $stationId,
                        'qty'        => $item['qty'],
                        'unit_price' => $prod->sale_price_ttc,
                        'course'     => $item['course'],
                        'status'     => $item['status'],
                        'sent_at'    => in_array($item['status'], ['preparing', 'ready', 'served']) ? now()->subMinutes($sess['opened_ago'] - 5) : null,
                        'prepared_at' => in_array($item['status'], ['ready', 'served']) ? now()->subMinutes(10) : null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                // Determine table status from highest order status
                $statusMap = ['pending' => 'occupied', 'preparing' => 'ordered', 'ready' => 'ordered', 'served' => 'bill_requested'];
                $tableStatus = $statusMap[$orderDef['status']] ?? 'occupied';
            }

            DB::table('tables')->where('id', $tableId)->update(['status' => $tableStatus]);
        }

        // ── Reservations (upcoming) ───────────────────────────────────────────
        $clients = DB::table('clients')->where('store_id', $store->id)->take(6)->get();

        $reservations = [
            [
                'client' => 0, 'table' => 'T10',
                'date' => now()->toDateString(), 'time' => '19:30:00', 'covers' => 8,
                'status' => 'confirmed',
                'notes' => 'Anniversaire — prévoir gâteau',
            ],
            [
                'client' => 1, 'table' => 'V01',
                'date' => now()->toDateString(), 'time' => '20:00:00', 'covers' => 6,
                'status' => 'confirmed',
                'notes' => 'Dîner d\'affaires — menu VIP',
            ],
            [
                'client' => 2, 'table' => 'T05',
                'date' => now()->addDay()->toDateString(), 'time' => '12:30:00', 'covers' => 4,
                'status' => 'confirmed',
                'notes' => null,
            ],
            [
                'client' => 3, 'table' => null,
                'date' => now()->addDay()->toDateString(), 'time' => '13:00:00', 'covers' => 2,
                'status' => 'pending',
                'notes' => 'Végétarien — pas de viande',
            ],
            [
                'client' => 4, 'table' => 'V02',
                'date' => now()->addDays(2)->toDateString(), 'time' => '20:30:00', 'covers' => 10,
                'status' => 'confirmed',
                'notes' => 'Séminaire entreprise',
            ],
        ];

        $rCount = 0;
        foreach ($reservations as $r) {
            $client = $clients->get($r['client']);
            if (! $client) continue;

            $tableId = $r['table'] ? ($tableIds[$r['table']] ?? null) : null;

            $exists = DB::table('reservations')
                ->where('store_id', $store->id)
                ->where('client_name', $client->name)
                ->where('reservation_date', $r['date'])
                ->where('reservation_time', $r['time'])
                ->exists();

            if (! $exists) {
                DB::table('reservations')->insert([
                    'store_id'          => $store->id,
                    'table_id'          => $tableId,
                    'client_id'         => $client->id,
                    'client_name'       => $client->name,
                    'client_phone'      => $client->phone,
                    'reservation_date'  => $r['date'],
                    'reservation_time'  => $r['time'],
                    'covers'            => $r['covers'],
                    'status'            => $r['status'],
                    'special_requests'  => $r['notes'],
                    'reminder_sent'     => false,
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
                $rCount++;
            }
        }

        $totalTables = array_sum(array_map(fn($a) => count($a['tables']), $areas));
        $this->command->info("✅ Restaurant : 4 zones, {$totalTables} tables, 3 sessions actives, {$rCount} réservations");
    }
}
