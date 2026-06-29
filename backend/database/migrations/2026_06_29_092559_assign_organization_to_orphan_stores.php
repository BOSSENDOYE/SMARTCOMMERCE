<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Assign orphan stores (organization_id = NULL) to the correct organization
        // by looking at which org the majority of users in that store belong to.
        $orphans = DB::table('stores')->whereNull('organization_id')->get(['id', 'code', 'name']);

        foreach ($orphans as $store) {
            // Via users who have an organization_id and belong to this store
            $orgId = DB::table('users')
                ->where('store_id', $store->id)
                ->whereNotNull('organization_id')
                ->select('organization_id', DB::raw('count(*) as cnt'))
                ->groupBy('organization_id')
                ->orderByDesc('cnt')
                ->value('organization_id');

            if (!$orgId) {
                // Via products in this store → their category's organization
                $orgId = DB::table('products')
                    ->join('categories', 'products.category_id', '=', 'categories.id')
                    ->where('products.store_id', $store->id)
                    ->whereNotNull('categories.organization_id')
                    ->select('categories.organization_id', DB::raw('count(*) as cnt'))
                    ->groupBy('categories.organization_id')
                    ->orderByDesc('cnt')
                    ->value('organization_id');
            }

            if ($orgId) {
                DB::table('stores')->where('id', $store->id)->update(['organization_id' => $orgId]);
            }
            // If still null: platform store (like MAIN) — leave as NULL intentionally
        }
    }

    public function down(): void
    {
        // Non-reversible data migration
    }
};
