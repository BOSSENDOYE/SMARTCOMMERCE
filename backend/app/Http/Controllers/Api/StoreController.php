<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\StockLevel;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StoreController extends Controller
{
    public function index(Request $request)
    {
        $query = Store::withCount(['users', 'clients'])
            ->with('organization')
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->organization_id, fn($q) => $q->where('organization_id', $request->organization_id));

        $user = $request->user();

        if ($user->organization_id) {
            // Tenant user (quel que soit son rôle) : uniquement son organisation
            $query->where('organization_id', $user->organization_id);
        } elseif (!$user->hasRole('super_admin')) {
            // Utilisateur sans organisation et pas super_admin : son seul magasin
            $query->where('id', $user->store_id);
        }
        // super_admin sans organisation = admin plateforme → voit tout

        return response()->json(
            $query->orderByDesc('is_central')->orderBy('name')->get()
        );
    }

    public function show(Store $store)
    {
        $stockValue = StockLevel::where('store_id', $store->id)->sum('total_value');

        return response()->json(
            array_merge($store->loadCount(['users', 'clients', 'sales'])->toArray(), [
                'stock_value' => (float) $stockValue,
            ])
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'organization_id'        => 'nullable|exists:organizations,id',
            'name'                   => 'required|string|max:100',
            'code'                   => 'required|string|max:20|unique:stores,code|regex:/^[A-Z0-9_-]+$/',
            'address'                => 'nullable|string|max:255',
            'phone'                  => 'nullable|string|max:30',
            'whatsapp_number'        => 'nullable|string|max:30',
            'email'                  => 'nullable|email|max:100',
            'ninea'                  => 'nullable|string|max:30',
            'rc'                     => 'nullable|string|max:30',
            'currency'               => 'nullable|string|max:10',
            'timezone'               => 'nullable|string|max:50',
            'business_type'          => 'nullable|in:grande_surface,restaurant,depot,mixte',
            'license_grande_surface' => 'boolean',
            'license_restaurant'     => 'boolean',
            'is_central'             => 'boolean',
            'receipt_footer'         => 'nullable|string|max:500',
        ]);

        // Dériver les licences depuis le business_type si non spécifiées
        $bt = $data['business_type'] ?? 'grande_surface';
        if (!isset($data['license_grande_surface'])) {
            $data['license_grande_surface'] = in_array($bt, ['grande_surface', 'mixte', 'depot']);
        }
        if (!isset($data['license_restaurant'])) {
            $data['license_restaurant'] = in_array($bt, ['restaurant', 'mixte']);
        }

        // Vérifier la limite de magasins du plan
        $orgId = $data['organization_id'] ?? $request->user()->store?->organization_id ?? $request->user()->organization_id;
        if ($orgId) {
            $sub = Subscription::where('organization_id', $orgId)
                ->whereIn('status', ['active', 'trial'])
                ->with('plan')
                ->latest('starts_at')
                ->first();

            if ($sub) {
                $max = $sub->maxStores();
                if ($max !== -1) {
                    $current = Store::where('organization_id', $orgId)->count();
                    if ($current >= $max) {
                        return response()->json([
                            'message' => "Limite atteinte : votre plan « {$sub->plan?->name} » autorise {$max} magasin(s). Contactez l'administrateur pour augmenter votre limite.",
                        ], 403);
                    }
                }
            }
        }

        $store = Store::create(array_merge($data, ['is_active' => true]));

        return response()->json($store, 201);
    }

    public function update(Request $request, Store $store)
    {
        $data = $request->validate([
            'organization_id'        => 'nullable|exists:organizations,id',
            'name'                   => 'sometimes|string|max:100',
            'address'                => 'nullable|string|max:255',
            'phone'                  => 'nullable|string|max:30',
            'whatsapp_number'        => 'nullable|string|max:30',
            'email'                  => 'nullable|email|max:100',
            'ninea'                  => 'nullable|string|max:30',
            'rc'                     => 'nullable|string|max:30',
            'currency'               => 'nullable|string|max:10',
            'timezone'               => 'nullable|string|max:50',
            'business_type'          => 'sometimes|in:grande_surface,restaurant,depot,mixte',
            'license_grande_surface' => 'sometimes|boolean',
            'license_restaurant'     => 'sometimes|boolean',
            'is_active'              => 'sometimes|boolean',
            'is_central'             => 'sometimes|boolean',
            'receipt_footer'         => 'nullable|string|max:500',
        ]);

        $store->update($data);

        return response()->json($store);
    }

    /** POST /stores/{store}/logo */
    public function uploadLogo(Request $request, Store $store)
    {
        $request->validate(['logo' => 'required|image|max:2048']);

        if ($store->logo && str_starts_with($store->logo, '/storage/')) {
            Storage::delete(str_replace('/storage/', 'public/', $store->logo));
        }

        $path = $request->file('logo')->store('logos/stores', 'public');
        $store->update(['logo' => Storage::url($path)]);

        return response()->json(['logo' => $store->logo]);
    }

    public function destroy(Store $store)
    {
        if ($store->is_central) {
            return response()->json(['message' => 'Le magasin central ne peut pas être désactivé.'], 422);
        }
        $store->update(['is_active' => false]);
        return response()->json(null, 204);
    }

    // ─── Menu personnalisé ────────────────────────────────────────────────────

    /** GET /stores/menu-config — retourne la config du magasin courant */
    public function getMenuConfig(Request $request)
    {
        $storeId = $request->user()->store_id
            ?? $request->header('X-Store-Id');

        $store = Store::find($storeId);

        return response()->json($store?->menu_config ?? []);
    }

    /** PUT /stores/menu-config — sauvegarde la config du magasin courant */
    public function updateMenuConfig(Request $request)
    {
        $storeId = $request->user()->store_id
            ?? $request->header('X-Store-Id');

        $data = $request->validate([
            'items'                   => 'required|array',
            'items.*.id'              => 'required|string|max:50',
            'items.*.customLabel'     => 'nullable|string|max:80',
            'items.*.visible'         => 'required|boolean',
            'items.*.order'           => 'required|integer|min:0',
        ]);

        $store = Store::findOrFail($storeId);
        $store->update(['menu_config' => $data['items']]);

        return response()->json($store->menu_config);
    }
}
