<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    public function up(): void
    {
        // ── 1. subscription_plans ─────────────────────────────────────────
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->integer('max_stores')->default(1);
            $table->integer('max_users')->default(5);
            $table->json('features')->default('[]');
            $table->unsignedBigInteger('price_monthly')->default(0);
            $table->unsignedBigInteger('price_quarterly')->default(0);
            $table->unsignedBigInteger('price_yearly')->default(0);
            $table->unsignedSmallInteger('trial_days')->default(14);
            $table->unsignedSmallInteger('grace_period_days')->default(7);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ── 2. super_admins ───────────────────────────────────────────────
        Schema::create('super_admins', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->enum('role', ['super_admin', 'support', 'billing'])->default('super_admin');
            $table->timestamp('last_login_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        // ── 3. onboarding_requests ────────────────────────────────────────
        Schema::create('onboarding_requests', function (Blueprint $table) {
            $table->id();
            $table->enum('status', ['pending', 'approved', 'rejected', 'expired'])->default('pending');
            $table->string('company_name');
            $table->string('contact_name');
            $table->string('email');
            $table->string('phone');
            $table->string('activity_type');
            $table->string('city')->nullable();
            $table->string('country')->default('Sénégal');
            $table->string('plan_slug')->nullable();
            $table->unsignedSmallInteger('duration_months')->default(3);
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('super_admins')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('email');
        });

        // ── 4. subscriptions ──────────────────────────────────────────────
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('subscription_plans');
            $table->json('custom_features')->nullable();
            $table->enum('status', ['trial', 'active', 'suspended', 'expired', 'cancelled'])->default('trial');
            $table->enum('billing_cycle', ['monthly', 'quarterly', 'yearly'])->default('monthly');
            $table->integer('max_stores_override')->nullable();
            $table->integer('max_users_override')->nullable();
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->timestamp('grace_ends_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('status');
            $table->index('ends_at');
        });

        // ── 5. platform_invoices ──────────────────────────────────────────
        Schema::create('platform_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('subscription_id')->nullable()->constrained('subscriptions')->nullOnDelete();
            $table->string('invoice_number')->unique();
            $table->unsignedBigInteger('amount');
            $table->char('currency', 3)->default('XOF');
            $table->enum('status', ['draft', 'sent', 'paid', 'overdue', 'cancelled'])->default('draft');
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('pdf_path')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('status');
        });

        // ── 6. platform_audit_logs ────────────────────────────────────────
        Schema::create('platform_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('super_admin_id')->nullable()->constrained('super_admins')->nullOnDelete();
            $table->string('action');
            $table->string('target_type')->nullable();
            $table->unsignedBigInteger('target_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            $table->index('super_admin_id');
            $table->index(['target_type', 'target_id']);
        });

        // ── Seed default plans ────────────────────────────────────────────
        $defaultFeatures = [
            'starter'    => ['pos_sales', 'stock_inventory', 'clients_loyalty', 'offline_pwa', 'mobile_money'],
            'business'   => ['pos_sales', 'stock_inventory', 'clients_loyalty', 'purchases_suppliers', 'invoicing_quotes', 'crm_pipeline', 'restaurant_kds', 'multi_stores', 'offline_pwa', 'advanced_reports', 'sms_whatsapp', 'mobile_money'],
            'enterprise' => ['pos_sales', 'stock_inventory', 'clients_loyalty', 'purchases_suppliers', 'invoicing_quotes', 'crm_pipeline', 'restaurant_kds', 'accounting_syscohada', 'multi_stores', 'offline_pwa', 'advanced_reports', 'api_webhooks', 'sms_whatsapp', 'mobile_money'],
        ];

        \DB::table('subscription_plans')->insert([
            [
                'name' => 'Starter', 'slug' => 'starter',
                'description' => 'Pour les petites boutiques et épiceries',
                'max_stores' => 1, 'max_users' => 3,
                'features' => json_encode($defaultFeatures['starter']),
                'price_monthly' => 15000, 'price_quarterly' => 40000, 'price_yearly' => 150000,
                'trial_days' => 14, 'grace_period_days' => 7,
                'is_active' => 1, 'sort_order' => 1,
                'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'name' => 'Business', 'slug' => 'business',
                'description' => 'Pour les PME et commerces multi-sites',
                'max_stores' => 5, 'max_users' => 20,
                'features' => json_encode($defaultFeatures['business']),
                'price_monthly' => 35000, 'price_quarterly' => 95000, 'price_yearly' => 350000,
                'trial_days' => 14, 'grace_period_days' => 7,
                'is_active' => 1, 'sort_order' => 2,
                'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'name' => 'Enterprise', 'slug' => 'enterprise',
                'description' => 'Pour les grandes surfaces et chaînes',
                'max_stores' => -1, 'max_users' => -1,
                'features' => json_encode($defaultFeatures['enterprise']),
                'price_monthly' => 0, 'price_quarterly' => 0, 'price_yearly' => 0,
                'trial_days' => 14, 'grace_period_days' => 14,
                'is_active' => 1, 'sort_order' => 3,
                'created_at' => now(), 'updated_at' => now(),
            ],
        ]);

        // ── Seed default super admin ──────────────────────────────────────
        \DB::table('super_admins')->insert([
            'name'       => 'SuperAdmin Baobab',
            'email'      => 'superadmin@baobab.sn',
            'password'   => Hash::make('SuperAdmin@2026!'),
            'role'       => 'super_admin',
            'is_active'  => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_audit_logs');
        Schema::dropIfExists('platform_invoices');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('onboarding_requests');
        Schema::dropIfExists('super_admins');
        Schema::dropIfExists('subscription_plans');
    }
};
