<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Répartition des productions (boulangerie) :
 *  - une production n'entre plus directement en stock POS : elle est « en attente de répartition »
 *  - la répartition l'affecte au point de vente (stock POS) et/ou à des livreurs (dotations)
 *  - chaque livreur a des tournées ; en fin de tournée il rend ses invendus (retour stock POS)
 *    et verse le montant de ses ventes au prix livreur ; un manquant reste à sa charge
 *
 *  - couriers               : livreurs (sans compte utilisateur)
 *  - products.courier_price : prix livreur (à défaut, prix de vente)
 *  - production_orders.qty_allocated : quantité déjà répartie
 *  - distribution_movements : journal de toutes les affectations / réaffectations
 *  - courier_rounds / courier_round_items : tournées et dotations par produit
 *  - courier_payments       : versements des livreurs (règlement de tournée ou de manquant)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('couriers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 30)->nullable();
            $table->string('zone', 120)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('products', function (Blueprint $table) {
            $table->decimal('courier_price', 15, 2)->nullable()->after('sale_price_ttc');
        });

        Schema::table('production_orders', function (Blueprint $table) {
            $table->decimal('qty_allocated', 12, 3)->default(0)->after('qty_produced');
        });

        Schema::create('courier_rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('courier_id')->constrained('couriers')->cascadeOnDelete();
            $table->string('reference', 30)->unique();
            $table->date('round_date');
            $table->string('status', 20)->default('open'); // open | settled
            $table->decimal('amount_due', 15, 2)->default(0);
            $table->decimal('amount_paid', 15, 2)->default(0);
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignId('settled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('settled_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'round_date']);
            $table->index(['courier_id', 'status']);
        });

        Schema::create('courier_round_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('courier_round_id')->constrained('courier_rounds')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty_given', 12, 3)->default(0);
            $table->decimal('qty_returned', 12, 3)->default(0);
            $table->decimal('unit_price', 15, 2);   // prix livreur figé à la première dotation
            $table->decimal('unit_cost', 15, 4)->default(0);
            $table->timestamps();

            $table->unique(['courier_round_id', 'product_id']);
        });

        Schema::create('distribution_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('production_order_id')->nullable()->constrained('production_orders')->nullOnDelete();
            $table->string('source', 20);       // production | pos | courier
            $table->foreignId('source_round_id')->nullable()->constrained('courier_rounds')->nullOnDelete();
            $table->string('destination', 20);  // pos | courier
            $table->foreignId('destination_round_id')->nullable()->constrained('courier_rounds')->nullOnDelete();
            $table->decimal('qty', 12, 3);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['store_id', 'created_at']);
        });

        Schema::create('courier_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('courier_id')->constrained('couriers')->cascadeOnDelete();
            $table->foreignId('courier_round_id')->nullable()->constrained('courier_rounds')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_sessions')->nullOnDelete();
            $table->string('payment_method', 30);
            $table->decimal('amount', 15, 2);
            $table->string('kind', 20); // settlement (versement de fin de tournée) | debt (remboursement de manquant)
            $table->timestamps();
        });

        // Productions existantes : déjà entrées en stock POS → considérées réparties au point de vente
        $orders = DB::table('production_orders')->where('status', 'completed')->get();
        foreach ($orders as $o) {
            DB::table('production_orders')->where('id', $o->id)->update(['qty_allocated' => $o->qty_produced]);
            DB::table('distribution_movements')->insert([
                'store_id'            => $o->store_id,
                'product_id'          => $o->product_id,
                'production_order_id' => $o->id,
                'source'              => 'production',
                'destination'         => 'pos',
                'qty'                 => $o->qty_produced,
                'user_id'             => $o->user_id,
                'created_at'          => $o->produced_at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('courier_payments');
        Schema::dropIfExists('distribution_movements');
        Schema::dropIfExists('courier_round_items');
        Schema::dropIfExists('courier_rounds');
        Schema::table('production_orders', fn (Blueprint $t) => $t->dropColumn('qty_allocated'));
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('courier_price'));
        Schema::dropIfExists('couriers');
    }
};
