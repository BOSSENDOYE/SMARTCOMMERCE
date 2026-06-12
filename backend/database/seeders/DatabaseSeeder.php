<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Ordre d'exécution respectant les dépendances FK :
     *  1. SetupSeeder    — permissions, rôles, magasin, utilisateurs, unités
     *  2. CatalogSeeder  — marques, catégories, produits, codes-barres, stock
     *  3. SupplierSeeder — fournisseurs, liens produit-fournisseur, BCs
     *  4. ClientSeeder   — clients, points fidélité
     *  5. SalesSeeder    — postes, sessions caisse, ventes, paiements
     *  6. RestaurantSeeder — zones, tables, stations, sessions actives, réservations
     *  7. PromotionSeeder — promotions (produits/catégories doivent exister)
     *  8. LossSeeder     — pertes, mouvements de stock
     */
    public function run(): void
    {
        $this->call([
            SetupSeeder::class,
            CatalogSeeder::class,
            SupplierSeeder::class,
            ClientSeeder::class,
            SalesSeeder::class,
            RestaurantSeeder::class,
            PromotionSeeder::class,
            LossSeeder::class,
        ]);

        $this->command->newLine();
        $this->command->info('🎉 SmartCommerce Suite — base de données initialisée avec succès!');
        $this->command->newLine();
        $this->command->line('  Comptes de démonstration :');
        $this->command->line('  ┌──────────────┬─────────────────────────────────┬────────────────┬──────┐');
        $this->command->line('  │ Rôle         │ Email                           │ Mot de passe   │ PIN  │');
        $this->command->line('  ├──────────────┼─────────────────────────────────┼────────────────┼──────┤');
        $this->command->line('  │ Super Admin  │ admin@smartcommerce.sn          │ Admin@2026!    │ 1234 │');
        $this->command->line('  │ Gérant       │ gerant@smartcommerce.sn         │ Gerant@2026!   │ 5678 │');
        $this->command->line('  │ Caissier     │ caissier@smartcommerce.sn       │ Caissier@2026! │ 9012 │');
        $this->command->line('  │ Serveur      │ serveur@smartcommerce.sn        │ Serveur@2026!  │ 3456 │');
        $this->command->line('  │ Cuisinier    │ cuisine@smartcommerce.sn        │ Cuisine@2026!  │ 7890 │');
        $this->command->line('  │ Magasinier   │ stock@smartcommerce.sn          │ Stock@2026!    │ 2468 │');
        $this->command->line('  └──────────────┴─────────────────────────────────┴────────────────┴──────┘');
        $this->command->newLine();
    }
}
