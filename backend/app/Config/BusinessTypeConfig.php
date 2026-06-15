<?php

namespace App\Config;

/**
 * Configuration centralisée par type de commerce.
 *
 * Pour ajouter un nouveau type de commerce (pharmacie, boulangerie, café…)
 * il suffit d'ajouter une entrée dans chaque tableau ci-dessous.
 * Aucune migration nécessaire grâce au varchar sur stores.business_type.
 *
 * Types de mouvements de stock disponibles :
 *   Entrées  : purchase_in | return_in | adjustment_in | transfer_in | production_in | inventory_adjustment
 *   Sorties  : sale_out | return_out | adjustment_out | transfer_out | loss
 *              kitchen_consumption | production_consumption | prescription_out | waste_out | expired_out
 */
class BusinessTypeConfig
{
    /**
     * Types de mouvements considérés comme "ventes / sorties liées à l'activité principale"
     * pour chaque type de commerce. Utilisés dans la rotation stock (mode=sales).
     */
    public static array $salesOutTypes = [
        'grande_surface' => ['sale_out'],
        'restaurant'     => ['sale_out', 'kitchen_consumption'],
        'depot'          => ['transfer_out', 'sale_out'],
        'mixte'          => ['sale_out', 'kitchen_consumption'],

        // ── Nouveaux types (ajoutez librement) ───────────────────────
        'pharmacie'      => ['sale_out', 'prescription_out'],
        'boulangerie'    => ['sale_out', 'kitchen_consumption', 'production_consumption'],
        'cafe_snack'     => ['sale_out', 'kitchen_consumption'],
        'boutique'       => ['sale_out'],
        'superette'      => ['sale_out'],
    ];

    /**
     * Tous les types de mouvement sortant (pour le mode "all" en rotation).
     * Commun à tous les types de commerce.
     */
    public static array $allOutTypes = [
        'sale_out',
        'return_out',
        'adjustment_out',
        'transfer_out',
        'loss',
        'kitchen_consumption',
        'production_consumption',
        'prescription_out',
        'waste_out',
        'expired_out',
    ];

    /**
     * Label lisible du type de commerce (pour affichage front).
     */
    public static array $labels = [
        'grande_surface' => 'Grande surface',
        'restaurant'     => 'Restaurant',
        'depot'          => 'Dépôt / Entrepôt',
        'mixte'          => 'Commerce mixte',
        'pharmacie'      => 'Pharmacie',
        'boulangerie'    => 'Boulangerie / Pâtisserie',
        'cafe_snack'     => 'Café / Snack',
        'boutique'       => 'Boutique',
        'superette'      => 'Supérette',
    ];

    /**
     * Description du mode "ventes" pour chaque type de commerce.
     * Utilisé pour informer l'utilisateur dans l'interface.
     */
    public static array $salesModeLabels = [
        'grande_surface' => 'Ventes directes (caisse + comptoir)',
        'restaurant'     => 'Ventes + consommation cuisine',
        'depot'          => 'Transferts sortants + ventes',
        'mixte'          => 'Ventes + consommation cuisine',
        'pharmacie'      => 'Ventes + délivrances sur ordonnance',
        'boulangerie'    => 'Ventes + consommation production + ingrédients',
        'cafe_snack'     => 'Ventes + consommation cuisine',
        'boutique'       => 'Ventes directes',
        'superette'      => 'Ventes directes',
    ];

    /**
     * Retourne les types de mouvements "ventes" pour un business type donné.
     * Si le type est inconnu, on revient à la configuration par défaut.
     */
    public static function getSalesOutTypes(string $businessType): array
    {
        return self::$salesOutTypes[$businessType] ?? self::$salesOutTypes['grande_surface'];
    }

    /**
     * Modules / features activés par défaut pour chaque type de commerce.
     * Utile pour masquer automatiquement les modules non pertinents.
     */
    public static array $enabledModules = [
        'grande_surface' => ['pos', 'sales', 'products', 'stock', 'inventory', 'suppliers', 'purchases',
                             'clients', 'invoices', 'crm', 'promotions', 'losses', 'expenses', 'transfers',
                             'reports', 'accounting'],
        'restaurant'     => ['pos', 'sales', 'restaurant', 'restaurant-menu', 'stock', 'inventory',
                             'suppliers', 'purchases', 'clients', 'expenses', 'reports', 'accounting'],
        'depot'          => ['stock', 'inventory', 'suppliers', 'purchases', 'transfers', 'losses',
                             'expenses', 'reports', 'accounting'],
        'mixte'          => ['pos', 'sales', 'restaurant', 'restaurant-menu', 'products', 'stock',
                             'inventory', 'suppliers', 'purchases', 'clients', 'invoices', 'promotions',
                             'losses', 'expenses', 'transfers', 'reports', 'accounting'],
        'pharmacie'      => ['pos', 'sales', 'products', 'stock', 'inventory', 'suppliers', 'purchases',
                             'clients', 'invoices', 'losses', 'expenses', 'reports', 'accounting'],
        'boulangerie'    => ['pos', 'sales', 'products', 'stock', 'inventory', 'suppliers', 'purchases',
                             'losses', 'expenses', 'reports', 'accounting'],
        'cafe_snack'     => ['pos', 'sales', 'restaurant', 'restaurant-menu', 'stock', 'inventory',
                             'suppliers', 'purchases', 'expenses', 'reports', 'accounting'],
        'boutique'       => ['pos', 'sales', 'products', 'stock', 'inventory', 'suppliers', 'purchases',
                             'clients', 'promotions', 'losses', 'expenses', 'reports', 'accounting'],
        'superette'      => ['pos', 'sales', 'products', 'stock', 'inventory', 'suppliers', 'purchases',
                             'clients', 'promotions', 'losses', 'expenses', 'transfers', 'reports', 'accounting'],
    ];
}
