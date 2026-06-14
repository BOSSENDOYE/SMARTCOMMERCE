<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Leads / Opportunités ──────────────────────────────────────────────
        Schema::create('crm_leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();

            // Infos contact (utilisé quand pas encore client)
            $table->string('title', 255);                          // Ex: "Vente mobilier bureau"
            $table->string('contact_name', 150)->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->string('contact_email', 150)->nullable();
            $table->string('company_name', 150)->nullable();

            // Pipeline
            $table->enum('stage', [
                'new',          // Nouveau
                'qualified',    // Qualifié
                'proposal',     // Proposition envoyée
                'negotiation',  // En négociation
                'won',          // Gagné
                'lost',         // Perdu
            ])->default('new');

            $table->enum('source', [
                'walk_in', 'referral', 'phone', 'whatsapp',
                'social', 'website', 'email', 'other',
            ])->default('other');

            $table->unsignedTinyInteger('probability')->default(10); // 0-100 %
            $table->decimal('expected_amount', 15, 2)->nullable();
            $table->date('expected_close_date')->nullable();
            $table->text('lost_reason')->nullable();
            $table->text('notes')->nullable();

            // Timestamps de transition
            $table->timestamp('won_at')->nullable();
            $table->timestamp('lost_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'stage']);
            $table->index(['store_id', 'assigned_to']);
        });

        // ── Activités CRM ────────────────────────────────────────────────────
        Schema::create('crm_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('crm_leads')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->enum('type', [
                'call', 'email', 'meeting', 'visit',
                'whatsapp', 'sms', 'note', 'task',
            ])->default('note');

            $table->string('title', 255);
            $table->text('description')->nullable();

            $table->timestamp('scheduled_at')->nullable();   // null = pas de planification
            $table->timestamp('completed_at')->nullable();   // null = non terminé

            $table->timestamps();

            $table->index(['lead_id', 'completed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_activities');
        Schema::dropIfExists('crm_leads');
    }
};
