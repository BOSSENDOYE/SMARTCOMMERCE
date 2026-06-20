<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrmLead;
use App\Models\Product;
use App\Models\ProductLot;
use App\Models\PurchaseReception;
use App\Models\StockLevel;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class NotificationController extends Controller
{
    /**
     * Retourne un résumé groupé des notifications pour la cloche.
     * Scoped au magasin de l'utilisateur connecté.
     */
    public function summary(Request $request)
    {
        $storeId = $request->user()->store_id;
        $groups  = [];

        // ── 1. Ruptures de stock ────────────────────────────────────────────
        $ruptures = StockLevel::where('store_id', $storeId)
            ->where('qty_on_hand', '<=', 0)
            ->with(['product' => fn($q) => $q->select('id', 'name', 'internal_code', 'alert_stock')->where('is_active', true)])
            ->get()
            ->filter(fn($sl) => $sl->product !== null)
            ->take(10)
            ->values();

        if ($ruptures->count() > 0) {
            $groups[] = [
                'type'  => 'stock_rupture',
                'label' => 'Ruptures de stock',
                'icon'  => 'alert-triangle',
                'color' => 'red',
                'count' => $ruptures->count(),
                'link'  => '/products?low_stock=true',
                'items' => $ruptures->map(fn($sl) => [
                    'id'   => $sl->product->id,
                    'name' => $sl->product->name,
                    'code' => $sl->product->internal_code,
                    'qty'  => (float) $sl->qty_on_hand,
                    'text' => 'Rupture — stock épuisé',
                ])->values()->toArray(),
            ];
        }

        // ── 2. Stock faible (alert_stock > 0 ET qty > 0 ET qty <= alert_stock) ──
        $lowStock = StockLevel::where('stock_levels.store_id', $storeId)
            ->where('stock_levels.qty_on_hand', '>', 0)
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->whereRaw('products.alert_stock > 0 AND stock_levels.qty_on_hand <= products.alert_stock')
            ->where('products.is_active', true)
            ->select('stock_levels.*', 'products.name as product_name', 'products.internal_code as product_code', 'products.alert_stock as product_alert')
            ->take(10)
            ->get();

        if ($lowStock->count() > 0) {
            $groups[] = [
                'type'  => 'stock_alert',
                'label' => 'Stock faible',
                'icon'  => 'trending-down',
                'color' => 'orange',
                'count' => $lowStock->count(),
                'link'  => '/products?low_stock=true',
                'items' => $lowStock->map(fn($sl) => [
                    'id'   => $sl->product_id,
                    'name' => $sl->product_name,
                    'code' => $sl->product_code,
                    'qty'  => (float) $sl->qty_on_hand,
                    'text' => "Qté : {$sl->qty_on_hand} / Seuil : {$sl->product_alert}",
                ])->values()->toArray(),
            ];
        }

        // ── 3. Lots proches de l'expiration (≤ 30 jours) ───────────────────
        $expirySoon = ProductLot::where('store_id', $storeId)
            ->where('qty', '>', 0)
            ->whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [Carbon::today(), Carbon::today()->addDays(30)])
            ->with(['product' => fn($q) => $q->select('id', 'name', 'internal_code')])
            ->orderBy('expiry_date')
            ->take(10)
            ->get()
            ->filter(fn($lot) => $lot->product !== null)
            ->values();

        // Lots déjà expirés avec stock restant
        $expired = ProductLot::where('store_id', $storeId)
            ->where('qty', '>', 0)
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<', Carbon::today())
            ->with(['product' => fn($q) => $q->select('id', 'name', 'internal_code')])
            ->take(5)
            ->get()
            ->filter(fn($lot) => $lot->product !== null)
            ->values();

        if ($expired->count() > 0) {
            $groups[] = [
                'type'  => 'expiry_expired',
                'label' => 'Lots expirés (en stock)',
                'icon'  => 'x-circle',
                'color' => 'red',
                'count' => $expired->count(),
                'link'  => '/inventory',
                'items' => $expired->map(fn($lot) => [
                    'id'   => $lot->product->id,
                    'name' => $lot->product->name,
                    'code' => $lot->lot_number,
                    'qty'  => (float) $lot->qty,
                    'text' => 'Expiré le ' . $lot->expiry_date->format('d/m/Y'),
                ])->values()->toArray(),
            ];
        }

        if ($expirySoon->count() > 0) {
            $groups[] = [
                'type'  => 'expiry_alert',
                'label' => 'Expirations imminentes',
                'icon'  => 'clock',
                'color' => 'yellow',
                'count' => $expirySoon->count(),
                'link'  => '/inventory',
                'items' => $expirySoon->map(fn($lot) => [
                    'id'   => $lot->product->id,
                    'name' => $lot->product->name,
                    'code' => $lot->lot_number,
                    'qty'  => (float) $lot->qty,
                    'text' => 'Expire le ' . $lot->expiry_date->format('d/m/Y')
                        . ' (' . Carbon::today()->diffInDays($lot->expiry_date) . 'j)',
                ])->values()->toArray(),
            ];
        }

        // ── 4. Nouveaux arrivages (7 derniers jours) ────────────────────────
        $arrivals = PurchaseReception::where('store_id', $storeId)
            ->where('received_at', '>=', Carbon::now()->subDays(7))
            ->with(['order.supplier'])
            ->orderByDesc('received_at')
            ->take(5)
            ->get();

        if ($arrivals->count() > 0) {
            $groups[] = [
                'type'  => 'new_arrival',
                'label' => 'Nouveaux arrivages',
                'icon'  => 'package',
                'color' => 'green',
                'count' => $arrivals->count(),
                'link'  => '/purchases',
                'items' => $arrivals->map(fn($r) => [
                    'id'   => $r->id,
                    'name' => $r->order?->supplier?->name ?? 'Fournisseur inconnu',
                    'code' => $r->reference,
                    'qty'  => null,
                    'text' => 'Reçu le ' . Carbon::parse($r->received_at)->format('d/m/Y à H:i'),
                ])->values()->toArray(),
            ];
        }

        // ── 5. Leads CRM actifs (non clôturés) ─────────────────────────────
        $crmActive = CrmLead::where('store_id', $storeId)
            ->whereNotIn('stage', ['won', 'lost'])
            ->orderByDesc('created_at')
            ->take(5)
            ->get();

        // Leads récents (créés les 3 derniers jours)
        $crmNew = CrmLead::where('store_id', $storeId)
            ->whereNotIn('stage', ['won', 'lost'])
            ->where('created_at', '>=', Carbon::now()->subDays(3))
            ->count();

        if ($crmActive->count() > 0) {
            $groups[] = [
                'type'  => 'crm_lead',
                'label' => 'Leads CRM en cours',
                'icon'  => 'target',
                'color' => 'blue',
                'count' => $crmNew > 0 ? $crmNew : $crmActive->count(),
                'link'  => '/crm',
                'items' => $crmActive->map(fn($l) => [
                    'id'   => $l->id,
                    'name' => $l->display_name,
                    'code' => $l->stage,
                    'qty'  => $l->expected_amount ? (float) $l->expected_amount : null,
                    'text' => $l->expected_amount
                        ? number_format($l->expected_amount, 0, ',', ' ') . ' FCFA attendus'
                        : 'Lead en cours',
                ])->values()->toArray(),
            ];
        }

        // ── 6. Inventaires planifiés (rappel in-app) ────────────────────────
        $upcomingInventories = \App\Models\InventorySession::where('store_id', $storeId)
            ->where('status', 'scheduled')
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', Carbon::now()->addHours(24))
            ->orderBy('scheduled_at')
            ->take(5)
            ->get();

        foreach ($upcomingInventories as $inv) {
            $minutesLeft = (int) round(Carbon::now()->diffInMinutes($inv->scheduled_at, false));
            if ($minutesLeft < 0) {
                // Past scheduled time but not yet started — urgent
                $groups[] = [
                    'type'  => 'inventory_overdue',
                    'label' => 'Inventaire en attente de démarrage',
                    'icon'  => 'alert-triangle',
                    'color' => 'red',
                    'count' => 1,
                    'link'  => '/inventory',
                    'items' => [[
                        'id'   => $inv->id,
                        'name' => $inv->name,
                        'code' => null,
                        'qty'  => null,
                        'text' => "Planifié le {$inv->scheduled_at->format('d/m/Y à H:i')} — à démarrer",
                    ]],
                ];
            } else {
                $groups[] = [
                    'type'  => 'inventory_reminder',
                    'label' => 'Inventaire planifié',
                    'icon'  => 'clipboard-list',
                    'color' => 'blue',
                    'count' => 1,
                    'link'  => '/inventory',
                    'items' => [[
                        'id'   => $inv->id,
                        'name' => $inv->name,
                        'code' => null,
                        'qty'  => null,
                        'text' => "Prévu le {$inv->scheduled_at->format('d/m/Y à H:i')} (dans {$minutesLeft} min)",
                    ]],
                ];
            }
        }

        // ── 7. Inventaire actif : fiches à compter ──────────────────────────
        $activeInventory = \App\Models\InventorySession::where('store_id', $storeId)
            ->whereIn('status', ['draft', 'counting', 'pending'])
            ->latest('started_at')
            ->first();

        if ($activeInventory) {
            $myPendingSheets = $activeInventory->sheets()
                ->where('assigned_to', $request->user()->id)
                ->whereNotIn('status', ['validated', 'cancelled'])
                ->count();

            if ($myPendingSheets > 0) {
                $groups[] = [
                    'type'  => 'inventory_active',
                    'label' => 'Inventaire en cours',
                    'icon'  => 'clipboard-list',
                    'color' => 'purple',
                    'count' => $myPendingSheets,
                    'link'  => '/my-inventory',
                    'items' => [[
                        'id'   => $activeInventory->id,
                        'name' => $activeInventory->name,
                        'code' => null,
                        'qty'  => null,
                        'text' => "{$myPendingSheets} fiche(s) à compter",
                    ]],
                ];
            }
        }

        $total = array_sum(array_column($groups, 'count'));

        return response()->json([
            'total'  => $total,
            'groups' => $groups,
        ]);
    }
}
