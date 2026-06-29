<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Assign each NULL-org category to the organization whose products use it most.
        $orphans = DB::table('categories')->whereNull('organization_id')->pluck('id');

        foreach ($orphans as $catId) {
            $orgId = DB::table('products')
                ->join('stores', 'products.store_id', '=', 'stores.id')
                ->where('products.category_id', $catId)
                ->whereNotNull('stores.organization_id')
                ->select('stores.organization_id', DB::raw('count(*) as cnt'))
                ->groupBy('stores.organization_id')
                ->orderByDesc('cnt')
                ->value('organization_id');

            if ($orgId) {
                DB::table('categories')
                    ->where('id', $catId)
                    ->update(['organization_id' => $orgId]);
            }
        }

        // Categories still NULL (no products linked) — assign to the first organization
        $firstOrgId = DB::table('organizations')->orderBy('id')->value('id');
        if ($firstOrgId) {
            DB::table('categories')
                ->whereNull('organization_id')
                ->update(['organization_id' => $firstOrgId]);
        }
    }

    public function down(): void
    {
        // Non-reversible data migration
    }
};
