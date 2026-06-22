<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rend le système extensible pour de nouveaux types de commerce
 * (pharmacie, boulangerie, café, boutique…) sans avoir à modifier
 * un ENUM à chaque fois.
 *
 * On convertit l'enum figé en varchar(50) sur la table stores.
 * Les mouvements de stock (stock_movements.type) restent en varchar —
 * aucun changement nécessaire là-bas, on ajoute juste de la doc.
 */
return new class extends Migration
{
    public function up(): void
    {
        // SQLite stocke déjà tout en varchar — MODIFY COLUMN n'existe pas.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type VARCHAR(50) NOT NULL DEFAULT 'grande_surface'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE stores MODIFY COLUMN business_type ENUM('grande_surface','restaurant','depot','mixte') NOT NULL DEFAULT 'grande_surface'");
        }
    }
};
