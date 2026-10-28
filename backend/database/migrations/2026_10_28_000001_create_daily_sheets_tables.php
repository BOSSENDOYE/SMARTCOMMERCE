<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fiche journalière (boulangerie) : une fiche par jour, trois équipes (matin, soir, nuit).
 *
 *  - daily_sheets       : la fiche du jour
 *  - sheet_shifts       : une équipe (responsable, ouverture / clôture manuelles)
 *  - sheet_lines        : une ligne par produit ; Départ figé à l'ouverture, les autres
 *                         colonnes figées à la clôture (calculées en direct tant qu'elle est ouverte)
 *  - sheet_audits       : traçabilité (ouverture, ajouts, clôture, réouverture)
 *  - categories.unsold_end_of_day : le reste de la nuit part en invendus (ex. pains)
 *  - stores.sheet_gap_tolerance_* : tolérance d'écart réglée par le gérant
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->boolean('unsold_end_of_day')->default(false)->after('is_active');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->decimal('sheet_gap_tolerance_pct', 5, 2)->default(0);
            $table->decimal('sheet_gap_tolerance_qty', 10, 3)->default(0);
        });

        Schema::create('daily_sheets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->date('sheet_date');
            $table->timestamps();

            $table->unique(['store_id', 'sheet_date']);
        });

        Schema::create('sheet_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_sheet_id')->constrained('daily_sheets')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('shift', 10);              // matin | soir | nuit
            $table->unsignedTinyInteger('position');  // 1, 2, 3
            $table->string('status', 10)->default('open'); // open | closed
            $table->foreignId('responsible_id')->constrained('users');
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at');
            // Repère exact : seuls les mouvements de stock d'id supérieur appartiennent à l'équipe
            $table->unsignedBigInteger('start_movement_id')->default(0);
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('unsold_report_id')->nullable()->constrained('unsold_reports')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['daily_sheet_id', 'shift']);
            $table->index(['store_id', 'status']);
        });

        Schema::create('sheet_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sheet_shift_id')->constrained('sheet_shifts')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('unit_price', 15, 2);
            $table->decimal('opening_qty', 12, 3)->default(0);
            // Figés à la clôture
            $table->decimal('added_qty', 12, 3)->nullable();
            $table->decimal('pos_sold_qty', 12, 3)->nullable();
            $table->decimal('other_qty', 12, 3)->nullable();     // retours livreurs, pertes, transferts…
            $table->decimal('expected_qty', 12, 3)->nullable();  // stock théorique
            $table->decimal('remaining_qty', 12, 3)->nullable(); // comptage
            $table->decimal('gap_qty', 12, 3)->nullable();       // expected − remaining (> 0 = manquant)
            $table->timestamps();

            $table->unique(['sheet_shift_id', 'product_id']);
        });

        Schema::create('sheet_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sheet_shift_id')->constrained('sheet_shifts')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 30);          // open | add | remove | close | reopen
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->decimal('qty', 12, 3)->nullable();
            $table->json('details')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        // Catégories de pain : le reste de fin de journée part en invendus
        DB::table('categories')->whereRaw("LOWER(name) LIKE 'pain%'")->update(['unsold_end_of_day' => true]);
    }

    public function down(): void
    {
        Schema::dropIfExists('sheet_audits');
        Schema::dropIfExists('sheet_lines');
        Schema::dropIfExists('sheet_shifts');
        Schema::dropIfExists('daily_sheets');
        Schema::table('stores', fn (Blueprint $t) => $t->dropColumn(['sheet_gap_tolerance_pct', 'sheet_gap_tolerance_qty']));
        Schema::table('categories', fn (Blueprint $t) => $t->dropColumn('unsold_end_of_day'));
    }
};
