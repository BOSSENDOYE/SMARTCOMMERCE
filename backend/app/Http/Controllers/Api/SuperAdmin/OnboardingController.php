<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Mail\NewOnboardingRequestMail;
use App\Mail\OnboardingApprovedMail;
use App\Models\OnboardingRequest;
use App\Models\Organization;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\PlatformInvoice;
use App\Models\PlatformAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class OnboardingController extends Controller
{
    // Public — anyone can submit an onboarding request
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_name'    => 'required|string|max:255',
            'contact_name'    => 'required|string|max:255',
            'email'           => 'required|email|max:255',
            'phone'           => 'required|string|max:50',
            'activity_type'   => 'required|string|max:100',
            'city'            => 'nullable|string|max:100',
            'country'         => 'nullable|string|max:100',
            'plan_slug'       => 'nullable|string|max:50',
            'duration_months' => 'nullable|integer|min:1|max:24',
            'notes'           => 'nullable|string|max:2000',
        ]);

        $req = OnboardingRequest::create($data);

        // Notifier le super admin
        try {
            $adminEmail = config('mail.superadmin_notify', env('SUPERADMIN_NOTIFY_EMAIL'));
            if ($adminEmail) {
                Mail::to($adminEmail)->send(new NewOnboardingRequestMail($req));
            }
        } catch (\Throwable $e) {
            Log::error('Mail nouvelle demande onboarding : ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Demande enregistrée. Notre équipe vous contactera sous 24h.',
            'id'      => $req->id,
        ], 201);
    }

    // SuperAdmin — list all requests
    public function index(Request $request)
    {
        $requests = OnboardingRequest::with('reviewer:id,name')
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($requests);
    }

    // SuperAdmin — approve a request → crée org + store + admin user + abonnement + facture
    public function approve(Request $request, OnboardingRequest $onboardingRequest)
    {
        if ($onboardingRequest->status !== 'pending') {
            return response()->json(['message' => 'Cette demande a déjà été traitée'], 422);
        }

        $data = $request->validate([
            'plan_slug'       => 'required|string',
            'duration_months' => 'required|integer|min:1',
        ]);

        $plan  = SubscriptionPlan::where('slug', $data['plan_slug'])->firstOrFail();
        $admin = $request->user();

        // ── Générer un code unique pour l'organisation ────────────────────────
        $base = strtoupper(preg_replace('/[^A-Z0-9]/', '', strtoupper($onboardingRequest->company_name)));
        $base = substr($base, 0, 6) ?: 'ORG';
        $code = $base;
        $i = 1;
        while (Organization::where('code', $code)->exists()) {
            $code = $base . $i++;
        }

        // ── 1. Créer l'organisation ───────────────────────────────────────────
        $address = implode(', ', array_filter([
            $onboardingRequest->city,
            $onboardingRequest->country ?? 'Sénégal',
        ]));

        $org = Organization::create([
            'name'      => $onboardingRequest->company_name,
            'code'      => $code,
            'email'     => $onboardingRequest->email,
            'phone'     => $onboardingRequest->phone,
            'address'   => $address,
            'is_active' => true,
        ]);

        // ── 2. Créer le magasin principal ─────────────────────────────────────
        $storeCode = $code . '-001';
        $store = Store::create([
            'organization_id' => $org->id,
            'name'            => $onboardingRequest->company_name,
            'code'            => $storeCode,
            'business_type'   => $this->inferBusinessType($onboardingRequest->activity_type),
            'address'         => $address,
            'phone'           => $onboardingRequest->phone,
            'email'           => $onboardingRequest->email,
            'currency'        => 'XOF',
            'timezone'        => 'Africa/Dakar',
            'is_active'       => true,
            'is_central'      => true,
        ]);

        // ── 3. Créer l'utilisateur admin du tenant ────────────────────────────
        $password = Str::random(10) . '!';

        // Si l'email existe déjà, on génère un email unique
        $email = $onboardingRequest->email;
        if (User::where('email', $email)->exists()) {
            $email = 'admin+' . $org->id . '@' . Str::slug($onboardingRequest->company_name) . '.sn';
        }

        $tenantAdmin = User::create([
            'name'            => $onboardingRequest->contact_name,
            'email'           => $email,
            'password'        => Hash::make($password),
            'organization_id' => $org->id,
            'store_id'        => $store->id,
            'is_active'       => true,
        ]);
        $tenantAdmin->assignRole('super_admin');

        // ── 4. Créer l'abonnement ─────────────────────────────────────────────
        $startsAt = now();
        $endsAt   = $startsAt->copy()->addMonths($data['duration_months']);

        $billing = match(true) {
            $data['duration_months'] >= 12 => 'yearly',
            $data['duration_months'] >= 3  => 'quarterly',
            default                        => 'monthly',
        };

        $subscription = Subscription::create([
            'organization_id' => $org->id,
            'plan_id'         => $plan->id,
            'status'          => 'active',
            'billing_cycle'   => $billing,
            'starts_at'       => $startsAt,
            'ends_at'         => $endsAt,
            'grace_ends_at'   => $endsAt->copy()->addDays($plan->grace_period_days),
        ]);

        // ── 5. Générer la facture ─────────────────────────────────────────────
        $amount = match($billing) {
            'yearly'    => (int) ($plan->price_yearly  * ($data['duration_months'] / 12)),
            'quarterly' => (int) ($plan->price_quarterly * ($data['duration_months'] / 3)),
            default     => $plan->price_monthly * $data['duration_months'],
        };

        PlatformInvoice::create([
            'organization_id' => $org->id,
            'subscription_id' => $subscription->id,
            'invoice_number'  => PlatformInvoice::generateNumber(),
            'amount'          => $amount,
            'currency'        => 'XOF',
            'status'          => 'sent',
            'issued_at'       => now(),
            'due_at'          => now()->addDays(15),
        ]);

        // ── 6. Mettre à jour la demande ───────────────────────────────────────
        $onboardingRequest->update([
            'status'      => 'approved',
            'reviewed_by' => $admin->id,
            'reviewed_at' => now(),
        ]);

        PlatformAuditLog::record(
            'onboarding.approved',
            $admin->id,
            'OnboardingRequest',
            $onboardingRequest->id,
            [
                'organization_id' => $org->id,
                'plan'            => $plan->slug,
                'admin_email'     => $email,
            ]
        );

        // Envoyer les identifiants au nouveau client
        try {
            Mail::to($email)->send(new OnboardingApprovedMail(
                contactName: $onboardingRequest->contact_name,
                companyName: $onboardingRequest->company_name,
                email:       $email,
                password:    $password,
                appUrl:      rtrim(config('app.frontend_url', env('FRONTEND_URL', 'https://www.senbaobab.com')), '/'),
            ));
        } catch (\Throwable $e) {
            Log::error('Mail approbation onboarding : ' . $e->getMessage());
        }

        return response()->json([
            'message'         => 'Demande approuvée. Organisation et compte admin créés.',
            'organization_id' => $org->id,
            'subscription_id' => $subscription->id,
            'admin_email'     => $email,
            'admin_password'  => $password,
        ]);
    }

    // SuperAdmin — reject a request
    public function reject(Request $request, OnboardingRequest $onboardingRequest)
    {
        if ($onboardingRequest->status !== 'pending') {
            return response()->json(['message' => 'Cette demande a déjà été traitée'], 422);
        }

        $data = $request->validate([
            'rejection_reason' => 'required|string|max:1000',
        ]);

        $admin = $request->user();

        $onboardingRequest->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['rejection_reason'],
            'reviewed_by'      => $admin->id,
            'reviewed_at'      => now(),
        ]);

        PlatformAuditLog::record(
            'onboarding.rejected',
            $admin->id,
            'OnboardingRequest',
            $onboardingRequest->id,
            ['reason' => $data['rejection_reason']]
        );

        return response()->json(['message' => 'Demande refusée.']);
    }

    private function inferBusinessType(string $activityType): string
    {
        $type = strtolower($activityType);
        if (str_contains($type, 'restaurant') || str_contains($type, 'fast') || str_contains($type, 'snack') || str_contains($type, 'café') || str_contains($type, 'cafe')) {
            return 'restaurant';
        }
        if (str_contains($type, 'supermarché') || str_contains($type, 'superette') || str_contains($type, 'grande surface') || str_contains($type, 'supermarche')) {
            return 'grande_surface';
        }
        if (str_contains($type, 'dépôt') || str_contains($type, 'depot') || str_contains($type, 'entrepôt') || str_contains($type, 'entrepot') || str_contains($type, 'grossiste')) {
            return 'depot';
        }
        // 'mixte' est le fallback sûr — couvre pharmacie, boutique, etc.
        return 'mixte';
    }
}
