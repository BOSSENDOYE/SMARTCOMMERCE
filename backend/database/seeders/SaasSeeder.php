<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SaasSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        // ── Récupère les plans existants ──────────────────────────────────────
        $starter    = DB::table('subscription_plans')->where('slug', 'starter')->first();
        $business   = DB::table('subscription_plans')->where('slug', 'business')->first();
        $enterprise = DB::table('subscription_plans')->where('slug', 'enterprise')->first();

        $saAdmin = DB::table('super_admins')->first();

        // ── 1. Organisations (tenants) ────────────────────────────────────────
        $orgs = [
            [
                'name'        => 'Boutique Diallo & Fils',
                'code'        => 'DIALLO',
                'email'       => 'contact@dialloetfils.sn',
                'phone'       => '+221 77 123 45 67',
                'address'     => 'Marché Sandaga, Dakar',
                'ninea'       => '003456789 2T1',
                'is_active'   => true,
                '_plan'       => 'starter',
                '_status'     => 'active',
                '_cycle'      => 'monthly',
                '_starts'     => $now->copy()->subMonths(3),
                '_ends'       => $now->copy()->addMonths(1),
            ],
            [
                'name'        => 'Restaurant Le Baobab',
                'code'        => 'BAOBAB_REST',
                'email'       => 'info@lebaobab.sn',
                'phone'       => '+221 33 821 00 11',
                'address'     => 'Plateau, Dakar',
                'ninea'       => '005678901 2T1',
                'is_active'   => true,
                '_plan'       => 'business',
                '_status'     => 'active',
                '_cycle'      => 'yearly',
                '_starts'     => $now->copy()->subMonths(8),
                '_ends'       => $now->copy()->addMonths(4),
            ],
            [
                'name'        => 'Pharmacie Centrale Thiès',
                'code'        => 'PHARMA_THIES',
                'email'       => 'pharmacie.centrale@thies.sn',
                'phone'       => '+221 77 456 78 90',
                'address'     => 'Centre-ville, Thiès',
                'ninea'       => '007890123 2T1',
                'is_active'   => true,
                '_plan'       => 'business',
                '_status'     => 'trial',
                '_cycle'      => 'monthly',
                '_starts'     => $now->copy()->subDays(5),
                '_ends'       => $now->copy()->addDays(9),
                '_trial_ends' => $now->copy()->addDays(9),
            ],
            [
                'name'        => 'Supermarché Ndiaye',
                'code'        => 'SUPER_NDIAYE',
                'email'       => 'admin@superndiaye.sn',
                'phone'       => '+221 33 869 22 33',
                'address'     => 'Almadies, Dakar',
                'ninea'       => '009012345 2T1',
                'is_active'   => true,
                '_plan'       => 'enterprise',
                '_status'     => 'active',
                '_cycle'      => 'yearly',
                '_starts'     => $now->copy()->subYear(),
                '_ends'       => $now->copy()->addDays(45),
            ],
            [
                'name'        => 'Épicerie Mama Fatou',
                'code'        => 'MAMA_FATOU',
                'email'       => 'mamafatou@gmail.com',
                'phone'       => '+221 76 234 56 78',
                'address'     => 'Guédiawaye, Dakar',
                'is_active'   => true,
                '_plan'       => 'starter',
                '_status'     => 'expired',
                '_cycle'      => 'monthly',
                '_starts'     => $now->copy()->subMonths(5),
                '_ends'       => $now->copy()->subDays(12),
            ],
            [
                'name'        => 'Mode & Style Keur Sokhna',
                'code'        => 'KEUR_SOKHNA',
                'email'       => 'contact@keursokhna.sn',
                'phone'       => '+221 77 876 54 32',
                'address'     => 'Touba, Diourbel',
                'is_active'   => true,
                '_plan'       => 'starter',
                '_status'     => 'suspended',
                '_cycle'      => 'quarterly',
                '_starts'     => $now->copy()->subMonths(6),
                '_ends'       => $now->copy()->addDays(18),
            ],
            [
                'name'        => 'Agro Distribution Saloum',
                'code'        => 'AGRO_SALOUM',
                'email'       => 'agro.saloum@kaolack.sn',
                'phone'       => '+221 33 941 88 99',
                'address'     => 'Kaolack, Centre',
                'ninea'       => '012345678 2T1',
                'is_active'   => true,
                '_plan'       => 'business',
                '_status'     => 'active',
                '_cycle'      => 'quarterly',
                '_starts'     => $now->copy()->subMonths(2),
                '_ends'       => $now->copy()->addDays(28),
            ],
            [
                'name'        => 'Tech Hub Saint-Louis',
                'code'        => 'TECHHUB_SL',
                'email'       => 'info@techhub-sl.sn',
                'phone'       => '+221 77 001 22 33',
                'address'     => 'Saint-Louis, Nord',
                'is_active'   => true,
                '_plan'       => 'starter',
                '_status'     => 'trial',
                '_cycle'      => 'monthly',
                '_starts'     => $now->copy()->subDays(2),
                '_ends'       => $now->copy()->addDays(12),
                '_trial_ends' => $now->copy()->addDays(12),
            ],
        ];

        $planMap  = ['starter' => $starter, 'business' => $business, 'enterprise' => $enterprise];
        $orgIds   = [];
        $subIds   = [];

        foreach ($orgs as $org) {
            $plan     = $planMap[$org['_plan']];
            $planStatus = $org['_status'];
            $starts   = $org['_starts'];
            $ends     = $org['_ends'];
            $trialEnd = $org['_trial_ends'] ?? null;

            // Insert organization
            $orgId = DB::table('organizations')->insertGetId([
                'name'       => $org['name'],
                'code'       => $org['code'],
                'email'      => $org['email'],
                'phone'      => $org['phone'],
                'address'    => $org['address'],
                'ninea'      => $org['ninea'] ?? null,
                'is_active'  => $org['is_active'],
                'created_at' => $starts,
                'updated_at' => $now,
            ]);
            $orgIds[$org['code']] = $orgId;

            // Insert subscription
            $subId = DB::table('subscriptions')->insertGetId([
                'organization_id'    => $orgId,
                'plan_id'            => $plan->id,
                'status'             => $planStatus,
                'billing_cycle'      => $org['_cycle'],
                'starts_at'          => $starts,
                'ends_at'            => $ends,
                'trial_ends_at'      => $trialEnd,
                'grace_ends_at'      => $planStatus === 'expired' ? $ends->copy()->addDays($plan->grace_period_days) : null,
                'created_at'         => $starts,
                'updated_at'         => $now,
            ]);
            $subIds[$org['code']] = $subId;
        }

        // ── 2. Demandes d'onboarding ──────────────────────────────────────────
        $requests = [
            [
                'company_name'     => 'Quincaillerie Modou Ba',
                'contact_name'     => 'Modou Ba',
                'email'            => 'modou.ba@gmail.com',
                'phone'            => '+221 77 345 67 89',
                'activity_type'    => 'Quincaillerie / BTP',
                'city'             => 'Rufisque',
                'country'          => 'Sénégal',
                'plan_slug'        => 'starter',
                'duration_months'  => 3,
                'status'           => 'pending',
                'notes'            => 'Intéressé par le module stock et caisse. Souhaite une démo avant validation.',
                'reviewed_by'      => null,
                'reviewed_at'      => null,
                'created_at'       => $now->copy()->subHours(2),
            ],
            [
                'company_name'     => 'Boulangerie Chez Aminata',
                'contact_name'     => 'Aminata Diallo',
                'email'            => 'aminata.boulang@yahoo.fr',
                'phone'            => '+221 76 555 44 33',
                'activity_type'    => 'Boulangerie / Pâtisserie',
                'city'             => 'Ziguinchor',
                'country'          => 'Sénégal',
                'plan_slug'        => 'business',
                'duration_months'  => 12,
                'status'           => 'pending',
                'notes'            => 'Possède 3 points de vente en Casamance. Besoin multi-stores urgente.',
                'reviewed_by'      => null,
                'reviewed_at'      => null,
                'created_at'       => $now->copy()->subHours(5),
            ],
            [
                'company_name'     => 'Librairie Papyrus',
                'contact_name'     => 'Ibrahima Sow',
                'email'            => 'ibrahima@librairie-papyrus.sn',
                'phone'            => '+221 33 825 11 22',
                'activity_type'    => 'Librairie / Papeterie',
                'city'             => 'Dakar',
                'country'          => 'Sénégal',
                'plan_slug'        => 'starter',
                'duration_months'  => 6,
                'status'           => 'approved',
                'notes'            => 'RAS',
                'reviewed_by'      => $saAdmin?->id,
                'reviewed_at'      => $now->copy()->subDays(2),
                'created_at'       => $now->copy()->subDays(4),
            ],
            [
                'company_name'     => 'Fast Food Téranga',
                'contact_name'     => 'Ousmane Ndiaye',
                'email'            => 'ousmane@teranga-food.sn',
                'phone'            => '+221 78 999 88 77',
                'activity_type'    => 'Restauration rapide',
                'city'             => 'Dakar',
                'country'          => 'Sénégal',
                'plan_slug'        => 'business',
                'duration_months'  => 12,
                'status'           => 'approved',
                'notes'            => 'Préfère paiement Wave. Livraison possible.',
                'reviewed_by'      => $saAdmin?->id,
                'reviewed_at'      => $now->copy()->subDays(7),
                'created_at'       => $now->copy()->subDays(10),
            ],
            [
                'company_name'     => 'Superette Luxe Shop',
                'contact_name'     => 'Fatoumata Traoré',
                'email'            => 'fatoumata@luxeshop.sn',
                'phone'            => '+221 77 112 33 44',
                'activity_type'    => 'Superette / Grande surface',
                'city'             => 'Mbour',
                'country'          => 'Sénégal',
                'plan_slug'        => 'business',
                'duration_months'  => 6,
                'status'           => 'rejected',
                'rejection_reason' => 'Documents administratifs incomplets. Pas de NINEA fourni. Relancer après régularisation.',
                'notes'            => 'Client déjà en contact avec notre équipe commerciale.',
                'reviewed_by'      => $saAdmin?->id,
                'reviewed_at'      => $now->copy()->subDays(3),
                'created_at'       => $now->copy()->subDays(6),
            ],
        ];

        foreach ($requests as $req) {
            DB::table('onboarding_requests')->insert($req + ['updated_at' => $now]);
        }

        // ── 3. Factures plateforme ────────────────────────────────────────────
        $invoices = [
            // Boutique Diallo - payée
            [
                'organization_id' => $orgIds['DIALLO'],
                'subscription_id' => $subIds['DIALLO'],
                'invoice_number'  => 'INV-2026-0001',
                'amount'          => 15000,
                'currency'        => 'XOF',
                'status'          => 'paid',
                'issued_at'       => $now->copy()->subMonths(3),
                'due_at'          => $now->copy()->subMonths(3)->addDays(15),
                'paid_at'         => $now->copy()->subMonths(3)->addDays(3),
            ],
            [
                'organization_id' => $orgIds['DIALLO'],
                'subscription_id' => $subIds['DIALLO'],
                'invoice_number'  => 'INV-2026-0002',
                'amount'          => 15000,
                'currency'        => 'XOF',
                'status'          => 'paid',
                'issued_at'       => $now->copy()->subMonths(2),
                'due_at'          => $now->copy()->subMonths(2)->addDays(15),
                'paid_at'         => $now->copy()->subMonths(2)->addDays(5),
            ],
            [
                'organization_id' => $orgIds['DIALLO'],
                'subscription_id' => $subIds['DIALLO'],
                'invoice_number'  => 'INV-2026-0003',
                'amount'          => 15000,
                'currency'        => 'XOF',
                'status'          => 'sent',
                'issued_at'       => $now->copy()->subDays(5),
                'due_at'          => $now->copy()->addDays(10),
                'paid_at'         => null,
            ],
            // Restaurant Le Baobab - annuel payé
            [
                'organization_id' => $orgIds['BAOBAB_REST'],
                'subscription_id' => $subIds['BAOBAB_REST'],
                'invoice_number'  => 'INV-2026-0004',
                'amount'          => 350000,
                'currency'        => 'XOF',
                'status'          => 'paid',
                'issued_at'       => $now->copy()->subMonths(8),
                'due_at'          => $now->copy()->subMonths(8)->addDays(15),
                'paid_at'         => $now->copy()->subMonths(8)->addDays(2),
            ],
            // Supermarché Ndiaye - Enterprise annuel
            [
                'organization_id' => $orgIds['SUPER_NDIAYE'],
                'subscription_id' => $subIds['SUPER_NDIAYE'],
                'invoice_number'  => 'INV-2026-0005',
                'amount'          => 800000,
                'currency'        => 'XOF',
                'status'          => 'paid',
                'issued_at'       => $now->copy()->subYear(),
                'due_at'          => $now->copy()->subYear()->addDays(15),
                'paid_at'         => $now->copy()->subYear()->addDays(7),
            ],
            // Renouvellement Ndiaye en attente
            [
                'organization_id' => $orgIds['SUPER_NDIAYE'],
                'subscription_id' => $subIds['SUPER_NDIAYE'],
                'invoice_number'  => 'INV-2026-0006',
                'amount'          => 800000,
                'currency'        => 'XOF',
                'status'          => 'sent',
                'issued_at'       => $now->copy()->subDays(10),
                'due_at'          => $now->copy()->addDays(35),
                'paid_at'         => null,
                'notes'           => 'Renouvellement annuel 2026-2027. Paiement Wave ou virement bancaire.',
            ],
            // Mama Fatou - en retard (expired)
            [
                'organization_id' => $orgIds['MAMA_FATOU'],
                'subscription_id' => $subIds['MAMA_FATOU'],
                'invoice_number'  => 'INV-2026-0007',
                'amount'          => 15000,
                'currency'        => 'XOF',
                'status'          => 'overdue',
                'issued_at'       => $now->copy()->subMonths(2),
                'due_at'          => $now->copy()->subDays(18),
                'paid_at'         => null,
                'notes'           => 'Rappel envoyé 2 fois. Numéro de téléphone incorrect.',
            ],
            // Agro Saloum - trimestriel payé
            [
                'organization_id' => $orgIds['AGRO_SALOUM'],
                'subscription_id' => $subIds['AGRO_SALOUM'],
                'invoice_number'  => 'INV-2026-0008',
                'amount'          => 95000,
                'currency'        => 'XOF',
                'status'          => 'paid',
                'issued_at'       => $now->copy()->subMonths(2),
                'due_at'          => $now->copy()->subMonths(2)->addDays(15),
                'paid_at'         => $now->copy()->subMonths(2)->addDays(1),
            ],
            // Keur Sokhna - suspendu, facture annulée
            [
                'organization_id' => $orgIds['KEUR_SOKHNA'],
                'subscription_id' => $subIds['KEUR_SOKHNA'],
                'invoice_number'  => 'INV-2026-0009',
                'amount'          => 40000,
                'currency'        => 'XOF',
                'status'          => 'overdue',
                'issued_at'       => $now->copy()->subMonths(3),
                'due_at'          => $now->copy()->subMonths(2)->subDays(15),
                'paid_at'         => null,
                'notes'           => 'Litige en cours. Compte suspendu le ' . $now->copy()->subMonths(1)->format('d/m/Y') . '.',
            ],
        ];

        foreach ($invoices as $inv) {
            DB::table('platform_invoices')->insert($inv + ['created_at' => $inv['issued_at'], 'updated_at' => $now]);
        }

        // ── 4. Logs d'audit ───────────────────────────────────────────────────
        $auditLogs = [
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'admin.login',
                'target_type'    => null,
                'target_id'      => null,
                'metadata'       => json_encode(['ip' => '197.155.42.10']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subHours(1),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'onboarding.approved',
                'target_type'    => 'OnboardingRequest',
                'target_id'      => 3,
                'metadata'       => json_encode(['company' => 'Librairie Papyrus', 'plan' => 'starter']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subDays(2),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'onboarding.approved',
                'target_type'    => 'OnboardingRequest',
                'target_id'      => 4,
                'metadata'       => json_encode(['company' => 'Fast Food Téranga', 'plan' => 'business']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subDays(7),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'onboarding.rejected',
                'target_type'    => 'OnboardingRequest',
                'target_id'      => 5,
                'metadata'       => json_encode(['company' => 'Superette Luxe Shop', 'reason' => 'Documents incomplets']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subDays(3),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'tenant.suspended',
                'target_type'    => 'Organization',
                'target_id'      => $orgIds['KEUR_SOKHNA'],
                'metadata'       => json_encode(['org' => 'Mode & Style Keur Sokhna', 'reason' => 'Facture impayée']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subMonths(1),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'invoice.mark_paid',
                'target_type'    => 'PlatformInvoice',
                'target_id'      => 4,
                'metadata'       => json_encode(['invoice' => 'INV-2026-0004', 'amount' => 350000, 'currency' => 'XOF']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subMonths(8)->addDays(2),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'tenant.extended',
                'target_type'    => 'Organization',
                'target_id'      => $orgIds['AGRO_SALOUM'],
                'metadata'       => json_encode(['org' => 'Agro Distribution Saloum', 'days' => 30]),
                'ip_address'     => '41.82.115.200',
                'created_at'     => $now->copy()->subWeeks(3),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'admin.login',
                'target_type'    => null,
                'target_id'      => null,
                'metadata'       => json_encode(['ip' => '41.82.115.200']),
                'ip_address'     => '41.82.115.200',
                'created_at'     => $now->copy()->subDays(10),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'plan.updated',
                'target_type'    => 'SubscriptionPlan',
                'target_id'      => $enterprise->id ?? 3,
                'metadata'       => json_encode(['plan' => 'Enterprise', 'field' => 'price_monthly', 'old' => 75000, 'new' => 0]),
                'ip_address'     => '41.82.115.200',
                'created_at'     => $now->copy()->subDays(15),
            ],
            [
                'super_admin_id' => $saAdmin?->id,
                'action'         => 'tenant.impersonate',
                'target_type'    => 'Organization',
                'target_id'      => $orgIds['SUPER_NDIAYE'],
                'metadata'       => json_encode(['org' => 'Supermarché Ndiaye', 'reason' => 'Support technique demandé']),
                'ip_address'     => '197.155.42.10',
                'created_at'     => $now->copy()->subDays(5),
            ],
        ];

        foreach ($auditLogs as $log) {
            DB::table('platform_audit_logs')->insert($log + ['updated_at' => $log['created_at']]);
        }

        $this->command->info('  ✓ SaaS: 8 organisations, 5 demandes, 9 factures, 10 logs d\'audit insérés.');
    }
}
