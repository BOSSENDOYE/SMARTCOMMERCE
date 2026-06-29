<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $count = DB::table('products')->whereNull('store_id')->count();
        if ($count === 0) return;

        // Assign each NULL-store product to the store whose stock_levels reference it most.
        // Falls back to the central store of the first organization.
        $orphans = DB::table('products')->whereNull('store_id')->pluck('id');

        foreach ($orphans as $productId) {
            $storeId = DB::table('stock_levels')
                ->where('product_id', $productId)
                ->whereNotNull('store_id')
                ->select('store_id', DB::raw('count(*) as cnt'))
                ->groupBy('store_id')
                ->orderByDesc('cnt')
                ->value('store_id');

            if (!$storeId) {
                // Fallback: central store of the first organization
                $storeId = DB::table('stores')
                    ->whereNotNull('organization_id')
                    ->where('is_central', true)
                    ->orderBy('id')
                    ->value('id')
                    ?? DB::table('stores')->whereNotNull('organization_id')->orderBy('id')->value('id');
            }

            if ($storeId) {
                DB::table('products')->where('id', $productId)->update(['store_id' => $storeId]);
            }
        }
    }

    public function down(): void
    {
        // Non-reversible data migration
    }
};
