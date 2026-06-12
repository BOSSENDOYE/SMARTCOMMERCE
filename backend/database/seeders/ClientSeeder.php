<?php

namespace Database\Seeders;

use App\Models\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ClientSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::where('code', 'MAIN')->firstOrFail();

        $clients = [
            ['name' => 'Abdoulaye Diop',     'phone' => '+221 77 100 11 01', 'type' => 'individual', 'loyalty' => 1250, 'credit' => 0],
            ['name' => 'Aissatou Mbaye',     'phone' => '+221 78 200 22 02', 'type' => 'individual', 'loyalty' => 875,  'credit' => 5000],
            ['name' => 'Mamadou Ndiaye',     'phone' => '+221 70 300 33 03', 'type' => 'individual', 'loyalty' => 2100, 'credit' => 0],
            ['name' => 'Rokhaya Faye',       'phone' => '+221 76 400 44 04', 'type' => 'individual', 'loyalty' => 450,  'credit' => 0],
            ['name' => 'Ibrahima Konaté',    'phone' => '+221 77 500 55 05', 'type' => 'individual', 'loyalty' => 3400, 'credit' => 10000],
            ['name' => 'Marième Tall',       'phone' => '+221 78 600 66 06', 'type' => 'individual', 'loyalty' => 125,  'credit' => 0],
            ['name' => 'Seydou Diallo',      'phone' => '+221 70 700 77 07', 'type' => 'individual', 'loyalty' => 980,  'credit' => 0],
            ['name' => 'Fatoumata Dembélé',  'phone' => '+221 76 800 88 08', 'type' => 'individual', 'loyalty' => 560,  'credit' => 2500],
            ['name' => 'Ousmane Ba',         'phone' => '+221 77 900 99 09', 'type' => 'individual', 'loyalty' => 1750, 'credit' => 0],
            ['name' => 'Khady Cissé',        'phone' => '+221 78 010 10 10', 'type' => 'individual', 'loyalty' => 0,    'credit' => 0],
            ['name' => 'Pape Sarr',          'phone' => '+221 70 111 11 11', 'type' => 'individual', 'loyalty' => 2900, 'credit' => 15000],
            ['name' => 'Ndéye Boye',         'phone' => '+221 76 122 22 22', 'type' => 'individual', 'loyalty' => 400,  'credit' => 0],
            ['name' => 'Aliou Seck',         'phone' => '+221 77 233 33 33', 'type' => 'individual', 'loyalty' => 1100, 'credit' => 0],
            ['name' => 'Bineta Diallo',      'phone' => '+221 78 344 44 44', 'type' => 'individual', 'loyalty' => 650,  'credit' => 0],
            ['name' => 'El Hadj Mboup',      'phone' => '+221 70 455 55 55', 'type' => 'individual', 'loyalty' => 500,  'credit' => 8000],
            // Entreprises
            ['name' => 'SONATEL SA',         'phone' => '+221 33 839 00 00', 'type' => 'company',    'loyalty' => 0,    'credit' => 50000, 'ninea' => '001234567'],
            ['name' => 'Sahel Catering',     'phone' => '+221 33 824 11 11', 'type' => 'company',    'loyalty' => 0,    'credit' => 30000, 'ninea' => '002345678'],
            ['name' => 'École Privée Mariama', 'phone' => '+221 33 825 22 22', 'type' => 'company',  'loyalty' => 0,    'credit' => 20000, 'ninea' => '003456789'],
            ['name' => 'Hôtel Teranga',      'phone' => '+221 33 826 33 33', 'type' => 'company',    'loyalty' => 0,    'credit' => 100000,'ninea' => '004567890'],
            ['name' => 'Résidence Les Fleurs','phone' => '+221 33 827 44 44', 'type' => 'company',   'loyalty' => 0,    'credit' => 25000, 'ninea' => '005678901'],
        ];

        $count = 0;
        foreach ($clients as $c) {
            $exists = DB::table('clients')
                ->where('phone', $c['phone'])
                ->exists();

            if (! $exists) {
                $clientId = DB::table('clients')->insertGetId([
                    'store_id'       => $store->id,
                    'name'           => $c['name'],
                    'phone'          => $c['phone'],
                    'type'           => $c['type'],
                    'ninea'          => $c['ninea'] ?? null,
                    'loyalty_points' => $c['loyalty'],
                    'credit_limit'   => $c['credit'],
                    'credit_balance' => 0,
                    'is_active'      => true,
                    'created_at'     => now()->subDays(rand(10, 180)),
                    'updated_at'     => now(),
                ]);

                // Initial loyalty transaction if points > 0
                if ($c['loyalty'] > 0) {
                    DB::table('loyalty_transactions')->insert([
                        'client_id'     => $clientId,
                        'type'          => 'adjust',
                        'points'        => $c['loyalty'],
                        'balance_after' => $c['loyalty'],
                        'notes'         => 'Solde initial (migration données)',
                        'created_at'    => now()->subDays(rand(1, 30)),
                    ]);
                }

                $count++;
            }
        }

        $this->command->info("✅ Clients : {$count} clients créés");
    }
}
