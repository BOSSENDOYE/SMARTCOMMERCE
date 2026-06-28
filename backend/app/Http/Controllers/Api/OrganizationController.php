<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\StockLevel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class OrganizationController extends Controller
{
    /** GET /organizations */
    public function index(Request $request)
    {
        $user = $request->user();

        if ($user->hasRole('super_admin')) {
            $orgs = Organization::withCount(['stores', 'users'])
                ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
                ->when($request->search, fn($q) => $q->where('name', 'ilike', '%' . $request->search . '%'))
                ->orderBy('name')
                ->get();
        } else {
            $orgId = optional(\App\Models\Store::find($user->store_id))->organization_id;
            $orgs = $orgId
                ? Organization::withCount(['stores', 'users'])->where('id', $orgId)->get()
                : collect();
        }

        return response()->json($orgs);
    }

    /** GET /organizations/{organization} */
    public function show(Organization $organization)
    {
        $storeIds   = $organization->stores()->pluck('id');
        $stockValue = StockLevel::whereIn('store_id', $storeIds)->sum('total_value');

        $stores = $organization->stores()
            ->withCount(['users', 'clients', 'sales'])
            ->orderByDesc('is_central')
            ->orderBy('name')
            ->get();

        $users = \App\Models\User::with('roles:name')
            ->select(['id', 'name', 'email', 'is_active', 'store_id', 'last_login_at'])
            ->whereIn('store_id', $storeIds)
            ->orderBy('name')
            ->get()
            ->map(fn($u) => array_merge($u->toArray(), [
                'role' => $u->roles->first()?->name,
            ]));

        return response()->json(
            array_merge(
                $organization->loadCount(['stores', 'users'])->toArray(),
                [
                    'stock_value' => (float) $stockValue,
                    'stores'      => $stores,
                    'users'       => $users,
                ]
            )
        );
    }

    /** POST /organizations */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:150|unique:organizations,name',
            'code'        => 'required|string|max:30|unique:organizations,code|regex:/^[A-Z0-9_-]+$/',
            'ninea'       => 'nullable|string|max:30',
            'rc'          => 'nullable|string|max:30',
            'address'     => 'nullable|string|max:255',
            'phone'       => 'nullable|string|max:30',
            'email'       => 'nullable|email|max:150',
            'description' => 'nullable|string|max:1000',
        ]);

        $org = Organization::create(array_merge($data, ['is_active' => true]));

        return response()->json($org, 201);
    }

    /** PUT /organizations/{organization} */
    public function update(Request $request, Organization $organization)
    {
        $data = $request->validate([
            'name'        => 'sometimes|string|max:150|unique:organizations,name,' . $organization->id,
            'ninea'       => 'nullable|string|max:30',
            'rc'          => 'nullable|string|max:30',
            'address'     => 'nullable|string|max:255',
            'phone'       => 'nullable|string|max:30',
            'email'       => 'nullable|email|max:150',
            'description' => 'nullable|string|max:1000',
            'is_active'   => 'sometimes|boolean',
        ]);

        $organization->update($data);

        return response()->json($organization);
    }

    /** POST /organizations/{organization}/logo */
    public function uploadLogo(Request $request, Organization $organization)
    {
        $request->validate(['logo' => 'required|image|max:2048']);

        if ($organization->logo && str_starts_with($organization->logo, '/storage/')) {
            Storage::delete(str_replace('/storage/', 'public/', $organization->logo));
        }

        $path = $request->file('logo')->store('logos/organizations', 'public');
        $organization->update(['logo' => Storage::url($path)]);

        return response()->json(['logo' => $organization->logo]);
    }

    /** DELETE /organizations/{organization} */
    public function destroy(Organization $organization)
    {
        if ($organization->stores()->exists()) {
            return response()->json([
                'message' => 'Impossible de supprimer : des magasins appartiennent à cette organisation.',
            ], 422);
        }

        $organization->delete();

        return response()->json(null, 204);
    }
}
