<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Support\Collection;

class PromotionService
{
    public function getApplicablePromotions(int $storeId, array $cartItems): Collection
    {
        $now = now();
        return Promotion::where('is_active', true)
            ->where('store_id', $storeId)
            ->where(fn($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->with(['products', 'categories'])
            ->get()
            ->filter(fn(Promotion $p) => $this->isHappyHourActive($p))
            ->filter(fn(Promotion $p) => $this->appliesToCart($p, $cartItems));
    }

    private function isHappyHourActive(Promotion $p): bool
    {
        if ($p->type !== 'happy_hour') return true;
        $now = now()->format('H:i:s');
        return $now >= $p->happy_hour_start && $now <= $p->happy_hour_end;
    }

    private function appliesToCart(Promotion $p, array $cartItems): bool
    {
        if ($p->applies_to_all) return true;

        $productIds = collect($cartItems)->pluck('product_id');
        if ($p->products->isNotEmpty()) {
            return $p->products->pluck('id')->intersect($productIds)->isNotEmpty();
        }

        $categoryIds = Product::whereIn('id', $productIds)->pluck('category_id');
        if ($p->categories->isNotEmpty()) {
            return $p->categories->pluck('id')->intersect($categoryIds)->isNotEmpty();
        }

        return false;
    }

    public function applyToItem(Promotion $p, float $qty, float $unitPrice): array
    {
        return match ($p->type) {
            'percentage' => [
                'discount_pct' => $p->value,
                'discount_amount' => round($unitPrice * $qty * $p->value / 100, 2),
                'promotion_id' => $p->id,
                'promotion_name' => $p->name,
            ],
            'fixed_amount' => [
                'discount_pct' => 0,
                'discount_amount' => min($p->value, $unitPrice * $qty),
                'promotion_id' => $p->id,
                'promotion_name' => $p->name,
            ],
            'special_price' => [
                'discount_pct' => 0,
                'discount_amount' => round(($unitPrice - $p->value) * $qty, 2),
                'promotion_id' => $p->id,
                'promotion_name' => $p->name,
            ],
            default => ['discount_pct' => 0, 'discount_amount' => 0],
        };
    }
}
