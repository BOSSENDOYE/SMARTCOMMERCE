<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\CashSessionController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\SuperAdmin\SuperAdminAuthController;
use App\Http\Controllers\Api\SuperAdmin\SuperAdminDashboardController;
use App\Http\Controllers\Api\SuperAdmin\OnboardingController;
use App\Http\Controllers\Api\SuperAdmin\PlansController;
use App\Http\Controllers\Api\SuperAdmin\TenantsController;
use App\Http\Controllers\Api\SuperAdmin\LicencesController;
use App\Http\Controllers\Api\SuperAdmin\PlatformInvoicesController;
use App\Http\Controllers\Api\SuperAdmin\AdminsManagementController;
use App\Http\Controllers\Api\SuperAdmin\AuditLogController;

Route::prefix('v1')->group(function () {

    // ── Public — Auth commerçant ──────────────────────────────────────────
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/pin', [AuthController::class, 'loginByPin']);

    // ── Public — Onboarding (formulaire landing page) ─────────────────────
    Route::post('/onboarding/request', [OnboardingController::class, 'store']);

    // ── SuperAdmin — Auth (guard: sanctum, model: SuperAdmin) ────────────
    Route::prefix('superadmin')->group(function () {
        Route::post('/auth/login', [SuperAdminAuthController::class, 'login']);

        Route::middleware(['auth:sanctum'])->group(function () {
            // Auth
            Route::post('/auth/logout', [SuperAdminAuthController::class, 'logout']);
            Route::get('/auth/me', [SuperAdminAuthController::class, 'me']);

            // Dashboard
            Route::get('/dashboard', [SuperAdminDashboardController::class, 'index']);

            // Onboarding requests
            Route::get('/requests', [OnboardingController::class, 'index']);
            Route::post('/requests/{onboardingRequest}/approve', [OnboardingController::class, 'approve']);
            Route::post('/requests/{onboardingRequest}/reject', [OnboardingController::class, 'reject']);

            // Plans
            Route::apiResource('/plans', PlansController::class);

            // Tenants
            Route::get('/tenants', [TenantsController::class, 'index']);
            Route::get('/tenants/{organization}', [TenantsController::class, 'show']);
            Route::post('/tenants/{organization}/activate', [TenantsController::class, 'activate']);
            Route::post('/tenants/{organization}/suspend', [TenantsController::class, 'suspend']);
            Route::post('/tenants/{organization}/extend', [TenantsController::class, 'extend']);
            Route::post('/tenants/{organization}/impersonate', [TenantsController::class, 'impersonate']);

            // Licences
            Route::get('/licences', [LicencesController::class, 'index']);
            Route::post('/licences/{subscription}/extend', [LicencesController::class, 'extend']);

            // Platform invoices
            Route::get('/invoices', [PlatformInvoicesController::class, 'index']);
            Route::post('/invoices/{invoice}/mark-paid', [PlatformInvoicesController::class, 'markPaid']);

            // Admins management
            Route::get('/admins', [AdminsManagementController::class, 'index']);
            Route::post('/admins', [AdminsManagementController::class, 'store']);
            Route::put('/admins/{admin}', [AdminsManagementController::class, 'update']);
            Route::patch('/admins/{admin}/toggle-active', [AdminsManagementController::class, 'toggleActive']);

            // Tenant users management
            Route::get('/tenants/{organization}/users',               [\App\Http\Controllers\Api\SuperAdmin\TenantUsersController::class, 'index']);
            Route::post('/tenants/{organization}/users',              [\App\Http\Controllers\Api\SuperAdmin\TenantUsersController::class, 'store']);
            Route::put('/tenants/{organization}/users/{user}',        [\App\Http\Controllers\Api\SuperAdmin\TenantUsersController::class, 'update']);
            Route::patch('/tenants/{organization}/users/{user}/toggle', [\App\Http\Controllers\Api\SuperAdmin\TenantUsersController::class, 'toggle']);
            Route::delete('/tenants/{organization}/users/{user}',     [\App\Http\Controllers\Api\SuperAdmin\TenantUsersController::class, 'destroy']);

            // Audit log
            Route::get('/audit', [AuditLogController::class, 'index']);
        });
    });

    // Offline sync — requires token
    Route::middleware('auth:sanctum')->group(function () {

        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/switch-store', [AuthController::class, 'switchStore']);

        // Notifications (cloche)
        Route::get('/notifications/summary', [\App\Http\Controllers\Api\NotificationController::class, 'summary']);

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index']);

        // Products
        Route::get('/products/stats', [ProductController::class, 'stats']);
        Route::get('/products/barcode', [ProductController::class, 'searchByBarcode']);
        Route::get('/products/import-template', [\App\Http\Controllers\Api\ProductImportController::class, 'template']);
        Route::post('/products/import/preview', [\App\Http\Controllers\Api\ProductImportController::class, 'preview']);
        Route::post('/products/import/confirm', [\App\Http\Controllers\Api\ProductImportController::class, 'confirm']);
        Route::apiResource('/products', ProductController::class);
        Route::post('/products/{product}/image', [ProductController::class, 'uploadImage']);

        // Product Containers (contenances)
        Route::get('/products/{product}/containers', fn(\App\Models\Product $product) =>
            response()->json($product->containers()->with('unit')->get())
        );
        Route::post('/products/{product}/containers', function (\Illuminate\Http\Request $r, \App\Models\Product $product) {
            $data = $r->validate([
                'unit_id'            => 'required|exists:units,id',
                'label'              => 'nullable|string|max:100',
                'conversion_factor'  => 'required|numeric|min:0.0001',
                'is_purchase_unit'   => 'boolean',
                'is_sale_unit'       => 'boolean',
                'is_stock_unit'      => 'boolean',
                'price_a'            => 'nullable|numeric|min:0',
                'price_b'            => 'nullable|numeric|min:0',
                'price_c'            => 'nullable|numeric|min:0',
                'barcode'            => 'nullable|string|max:100',
                'sort_order'         => 'integer|min:0',
            ]);
            return response()->json($product->containers()->create($data)->load('unit'), 201);
        });
        Route::put('/products/{product}/containers/{container}', function (\Illuminate\Http\Request $r, \App\Models\Product $product, \App\Models\ProductContainer $container) {
            if ($container->product_id !== $product->id) abort(403);
            $data = $r->validate([
                'unit_id'            => 'sometimes|exists:units,id',
                'label'              => 'nullable|string|max:100',
                'conversion_factor'  => 'sometimes|numeric|min:0.0001',
                'is_purchase_unit'   => 'boolean',
                'is_sale_unit'       => 'boolean',
                'is_stock_unit'      => 'boolean',
                'price_a'            => 'nullable|numeric|min:0',
                'price_b'            => 'nullable|numeric|min:0',
                'price_c'            => 'nullable|numeric|min:0',
                'barcode'            => 'nullable|string|max:100',
                'sort_order'         => 'integer|min:0',
            ]);
            $container->update($data);
            return response()->json($container->load('unit'));
        });
        Route::delete('/products/{product}/containers/{container}', function (\App\Models\Product $product, \App\Models\ProductContainer $container) {
            if ($container->product_id !== $product->id) abort(403);
            $container->delete();
            return response()->json(null, 204);
        });

        // Categories — isolées par organisation
        // Helper: résout l'org de l'utilisateur (direct ou via son magasin)
        $resolveOrgId = function (\Illuminate\Http\Request $r): ?int {
            $user = $r->user();
            if ($user->organization_id) return (int) $user->organization_id;
            if ($user->store_id) {
                return (int) \App\Models\Store::where('id', $user->store_id)->value('organization_id');
            }
            return null; // super_admin plateforme → voit tout
        };

        Route::get('/categories', function (\Illuminate\Http\Request $r) use ($resolveOrgId) {
            return response()->json(
                \App\Models\Category::with('children')
                    ->forOrganization($resolveOrgId($r))
                    ->whereNull('parent_id')
                    ->orderBy('sort_order')
                    ->get()
            );
        });
        Route::post('/categories', function (\Illuminate\Http\Request $r) use ($resolveOrgId) {
            $data = $r->validate(['name' => 'required', 'parent_id' => 'nullable|exists:categories,id', 'type' => 'nullable|in:common,grande_surface,restaurant']);
            return response()->json(\App\Models\Category::create(array_merge($data, ['organization_id' => $resolveOrgId($r)])), 201);
        });
        Route::put('/categories/{category}', function (\Illuminate\Http\Request $r, \App\Models\Category $category) use ($resolveOrgId) {
            if ($category->organization_id !== null && $category->organization_id !== $resolveOrgId($r)) {
                return response()->json(['message' => 'Action non autorisée.'], 403);
            }
            return response()->json(tap($category)->update($r->validate(['name' => 'required', 'parent_id' => 'nullable|exists:categories,id', 'type' => 'nullable|in:common,grande_surface,restaurant'])));
        });
        Route::delete('/categories/{category}', function (\Illuminate\Http\Request $r, \App\Models\Category $category) use ($resolveOrgId) {
            if ($category->organization_id !== null && $category->organization_id !== $resolveOrgId($r)) {
                return response()->json(['message' => 'Action non autorisée.'], 403);
            }
            if ($category->products()->count() > 0) {
                return response()->json(['message' => 'Impossible de supprimer : des produits utilisent cette catégorie.'], 422);
            }
            if ($category->children()->count() > 0) {
                return response()->json(['message' => 'Impossible de supprimer : cette catégorie a des sous-catégories.'], 422);
            }
            $category->delete();
            return response()->json(null, 204);
        });

        // Brands & Units
        Route::get('/brands', fn() => response()->json(\App\Models\Brand::orderBy('name')->get()));
        Route::post('/brands', fn(\Illuminate\Http\Request $r) => response()->json(\App\Models\Brand::create($r->validate(['name' => 'required'])), 201));
        Route::get('/units', fn() => response()->json(\App\Models\Unit::orderBy('name')->get()));

        // Suppliers
        Route::get('/suppliers/import-template', [\App\Http\Controllers\Api\SupplierImportController::class, 'template']);
        Route::post('/suppliers/import/preview',  [\App\Http\Controllers\Api\SupplierImportController::class, 'preview']);
        Route::post('/suppliers/import/confirm',  [\App\Http\Controllers\Api\SupplierImportController::class, 'confirm']);
        Route::get('/suppliers/stats', [\App\Http\Controllers\Api\SupplierController::class, 'stats']);
        Route::apiResource('/suppliers', \App\Http\Controllers\Api\SupplierController::class);
        Route::get('/suppliers/{supplier}/orders', [\App\Http\Controllers\Api\SupplierController::class, 'getOrders']);
        Route::get('/suppliers/{supplier}/invoices', [\App\Http\Controllers\Api\SupplierController::class, 'getInvoices']);
        Route::post('/suppliers/{supplier}/invoices', [\App\Http\Controllers\Api\SupplierController::class, 'addInvoice']);
        Route::post('/suppliers/{supplier}/invoices/{invoice}/pay', [\App\Http\Controllers\Api\SupplierController::class, 'payInvoice']);
        Route::get('/suppliers/{supplier}/products', [\App\Http\Controllers\Api\SupplierController::class, 'getProducts']);
        Route::post('/suppliers/{supplier}/products', [\App\Http\Controllers\Api\SupplierController::class, 'linkProduct']);
        Route::delete('/suppliers/{supplier}/products/{product}', [\App\Http\Controllers\Api\SupplierController::class, 'unlinkProduct']);

        // Clients
        Route::get('/clients/import-template', [\App\Http\Controllers\Api\ClientImportController::class, 'template']);
        Route::post('/clients/import/preview', [\App\Http\Controllers\Api\ClientImportController::class, 'preview']);
        Route::post('/clients/import/confirm', [\App\Http\Controllers\Api\ClientImportController::class, 'confirm']);
        Route::apiResource('/client-categories', \App\Http\Controllers\Api\ClientCategoryController::class)->except(['show']);
        Route::get('/clients/stats', [\App\Http\Controllers\Api\ClientController::class, 'stats']);
        Route::get('/clients/search', function (\Illuminate\Http\Request $r) {
            $term = trim((string) $r->input('q', ''));
            if ($term === '') return response()->json([]);
            return response()->json(
                \App\Models\Client::where('store_id', $r->user()->store_id)
                    ->where(fn($q) => $q->where('phone', 'like', "%{$term}%")
                                        ->orWhere('name',  'like', "%{$term}%"))
                    ->orderBy('name')
                    ->limit(15)
                    ->get(['id','name','phone','credit_balance','account_balance'])
            );
        });
        Route::apiResource('/clients', \App\Http\Controllers\Api\ClientController::class);
        Route::get('/clients/{client}/sales', [\App\Http\Controllers\Api\ClientController::class, 'sales']);
        Route::get('/clients/{client}/loyalty-transactions', [\App\Http\Controllers\Api\ClientController::class, 'loyaltyTransactions']);
        Route::post('/clients/{client}/adjust-credit', [\App\Http\Controllers\Api\ClientController::class, 'adjustCredit']);
        Route::post('/clients/{client}/pay-credit-with-account', [\App\Http\Controllers\Api\ClientController::class, 'payCreditWithAccount']);
        Route::post('/clients/{client}/adjust-loyalty', [\App\Http\Controllers\Api\ClientController::class, 'adjustLoyalty']);
        // Client account (wallet/avoir/dette)
        Route::get('/clients/{client}/account-transactions', [\App\Http\Controllers\Api\ClientController::class, 'accountTransactions']);
        Route::post('/clients/{client}/deposit', [\App\Http\Controllers\Api\ClientController::class, 'deposit']);
        Route::post('/clients/{client}/withdraw', [\App\Http\Controllers\Api\ClientController::class, 'withdraw']);
        // Encours (créances) client
        Route::get('/encours/history', [\App\Http\Controllers\Api\EncourController::class, 'globalHistory']);
        Route::get('/clients/{client}/encours', [\App\Http\Controllers\Api\EncourController::class, 'index']);
        Route::post('/clients/{client}/payer-encours', [\App\Http\Controllers\Api\EncourController::class, 'pay']);

        // Purchase Orders
        Route::get('/purchase-orders/stats', [\App\Http\Controllers\Api\PurchaseOrderController::class, 'stats']);
        Route::post('/purchase-orders/import-bl/preview', [\App\Http\Controllers\Api\BLImportController::class, 'preview']);
        Route::post('/purchase-orders/import-bl/confirm', [\App\Http\Controllers\Api\BLImportController::class, 'confirm']);
        Route::apiResource('/purchase-orders', \App\Http\Controllers\Api\PurchaseOrderController::class);
        Route::post('/purchase-orders/{purchaseOrder}/receive', [\App\Http\Controllers\Api\PurchaseOrderController::class, 'receive']);
        Route::post('/purchase-orders/{purchaseOrder}/send', [\App\Http\Controllers\Api\PurchaseOrderController::class, 'send']);
        Route::post('/purchase-orders/{purchaseOrder}/cancel', [\App\Http\Controllers\Api\PurchaseOrderController::class, 'cancel']);

        // Stock
        Route::get('/stock', fn(\Illuminate\Http\Request $r) => response()->json(
            \App\Models\StockLevel::where('store_id', $r->user()->store_id)
                ->with(['product.category', 'product.unit'])
                ->when($r->search, fn($q) => $q->whereHas('product', fn($p) => $p->where('name', 'like', "%{$r->search}%")->orWhere('internal_code', 'like', "%{$r->search}%")))
                ->when($r->status === 'low', fn($q) => $q->whereRaw('stock_levels.qty_on_hand > 0 AND stock_levels.qty_on_hand <= (SELECT alert_stock FROM products WHERE products.id = stock_levels.product_id)'))
                ->when($r->status === 'out', fn($q) => $q->where('qty_on_hand', '<=', 0))
                ->orderBy('qty_on_hand')
                ->paginate((int)($r->per_page ?? 50))
        ));
        Route::get('/stock/low', fn(\Illuminate\Http\Request $r) => response()->json(
            app(\App\Services\StockService::class)->getLowStockProducts($r->user()->store_id)
        ));
        Route::get('/stock/expiring', fn(\Illuminate\Http\Request $r) => response()->json(
            app(\App\Services\StockService::class)->getExpiringProducts($r->user()->store_id, (int)($r->days ?? 30))
        ));
        Route::post('/stock/adjust', fn(\Illuminate\Http\Request $r) => response()->json(
            app(\App\Services\StockService::class)->move(
                $r->user()->store_id,
                (int)$r->product_id,
                (float)$r->qty >= 0 ? 'adjustment_in' : 'adjustment_out',
                abs((float)$r->qty),
                0, null, $r->user()->id, null, null, $r->reason
            ), 201
        ));
        Route::get('/stock/movements', fn(\Illuminate\Http\Request $r) => response()->json(
            \App\Models\StockMovement::where('store_id', $r->user()->store_id)
                ->with(['product', 'user'])
                ->when($r->product_id, fn($q) => $q->where('product_id', $r->product_id))
                ->when($r->type, fn($q) => $q->where('type', $r->type))
                ->when($r->date_from, fn($q) => $q->whereDate('created_at', '>=', $r->date_from))
                ->when($r->date_to, fn($q) => $q->whereDate('created_at', '<=', $r->date_to))
                ->orderByDesc('created_at')
                ->paginate((int)($r->per_page ?? 50))
        ));

        // Stock rotation — produits les plus / moins mouvementés (paginé, adapté au type de commerce)
        Route::get('/stock/rotation', function (\Illuminate\Http\Request $r) {
            $storeId    = $r->user()->store_id;
            $perPage    = min((int)($r->per_page ?? 20), 100);
            $page       = max(1, (int)($r->page ?? 1));
            $order      = $r->order === 'asc' ? 'asc' : 'desc';
            $categoryId = $r->category_id ? (int)$r->category_id : null;

            // Business type → types de mouvements adaptés
            $store        = \App\Models\Store::find($storeId);
            $businessType = $store?->business_type ?? 'grande_surface';
            $types        = $r->mode === 'all'
                ? \App\Config\BusinessTypeConfig::$allOutTypes
                : \App\Config\BusinessTypeConfig::getSalesOutTypes($businessType);

            // Filtre catégorie (inclut sous-catégories)
            $categoryProductIds = null;
            if ($categoryId) {
                $catIds             = [$categoryId];
                $children           = \App\Models\Category::where('parent_id', $categoryId)->pluck('id')->toArray();
                $catIds             = array_merge($catIds, $children);
                $categoryProductIds = \App\Models\Product::whereIn('category_id', $catIds)->pluck('id')->toArray();
            }

            // Paginator sur les agrégats groupés par produit
            $paginator = \App\Models\StockMovement::where('store_id', $storeId)
                ->whereIn('type', $types)
                ->when($r->date_from,       fn($q) => $q->whereDate('created_at', '>=', $r->date_from))
                ->when($r->date_to,         fn($q) => $q->whereDate('created_at', '<=', $r->date_to))
                ->when($categoryProductIds, fn($q) => $q->whereIn('product_id', $categoryProductIds))
                ->groupBy('product_id')
                ->selectRaw('product_id,
                    SUM(qty)             AS total_qty_out,
                    COUNT(*)             AS movement_count,
                    SUM(qty * unit_cost) AS total_value_out')
                ->orderBy('total_qty_out', $order)
                ->paginate($perPage, ['*'], 'page', $page);

            // Enrichir uniquement les produits de la page courante
            $rows        = collect($paginator->items());
            $productIds  = $rows->pluck('product_id')->toArray();
            $products    = \App\Models\Product::whereIn('id', $productIds)
                ->with(['unit', 'category'])->get()->keyBy('id');
            $stockLevels = \App\Models\StockLevel::where('store_id', $storeId)
                ->whereIn('product_id', $productIds)->get()->keyBy('product_id');

            $enriched = $rows->map(function ($row) use ($products, $stockLevels) {
                $p            = $products[$row->product_id]  ?? null;
                $sl           = $stockLevels[$row->product_id] ?? null;
                $currentStock = $sl ? (float)$sl->qty_on_hand : 0;
                $totalQty     = (float)$row->total_qty_out;
                return [
                    'product_id'      => $row->product_id,
                    'product'         => $p ? [
                        'id'            => $p->id,
                        'name'          => $p->name,
                        'internal_code' => $p->internal_code,
                        'category'      => $p->category ? ['name' => $p->category->name, 'id' => $p->category->id] : null,
                        'unit'          => $p->unit     ? ['abbreviation' => $p->unit->abbreviation] : null,
                    ] : null,
                    'total_qty_out'   => $totalQty,
                    'movement_count'  => (int)$row->movement_count,
                    'total_value_out' => (float)$row->total_value_out,
                    'current_stock'   => $currentStock,
                    'avg_cost'        => $sl ? (float)$sl->avg_cost : 0,
                    'rotation_rate'   => $currentStock > 0 ? round($totalQty / $currentStock, 2) : null,
                ];
            });

            return response()->json([
                'meta'         => [
                    'business_type'       => $businessType,
                    'business_label'      => \App\Config\BusinessTypeConfig::$labels[$businessType] ?? $businessType,
                    'sales_mode_label'    => \App\Config\BusinessTypeConfig::$salesModeLabels[$businessType] ?? 'Ventes',
                    'movement_types_used' => $types,
                ],
                'data'         => $enriched,
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
                'per_page'     => $paginator->perPage(),
                'from'         => $paginator->firstItem(),
                'to'           => $paginator->lastItem(),
            ]);
        });

        // Inventory — specific routes before apiResource to avoid conflicts
        Route::get('/inventory-sessions/active',                                              [\App\Http\Controllers\Api\InventoryController::class, 'active']);
        Route::get('/inventory-sessions/my-sheets',                                           [\App\Http\Controllers\Api\InventorySheetController::class, 'mySheets']);
        Route::apiResource('/inventory-sessions', \App\Http\Controllers\Api\InventoryController::class);
        Route::post('/inventory-sessions/{inventorySession}/start',      [\App\Http\Controllers\Api\InventoryController::class, 'start']);
        Route::post('/inventory-sessions/{inventorySession}/validate',   [\App\Http\Controllers\Api\InventoryController::class, 'validate']);
        Route::post('/inventory-sessions/{inventorySession}/transmit',   [\App\Http\Controllers\Api\InventoryController::class, 'transmit']);
        Route::post('/inventory-sessions/{inventorySession}/items',      [\App\Http\Controllers\Api\InventoryController::class, 'addItem']);
        Route::delete('/inventory-sessions/{inventorySession}/items/{item}', [\App\Http\Controllers\Api\InventoryController::class, 'removeItem']);
        // Inventory sheets
        Route::post('/inventory-sessions/{inventorySession}/sheets',                          [\App\Http\Controllers\Api\InventorySheetController::class, 'store']);
        Route::post('/inventory-sessions/{inventorySession}/sheets/{sheet}/validate',         [\App\Http\Controllers\Api\InventorySheetController::class, 'validateSheet']);
        Route::post('/inventory-sessions/{inventorySession}/sheets/{sheet}/items',            [\App\Http\Controllers\Api\InventorySheetController::class, 'addSheetItem']);
        Route::delete('/inventory-sessions/{inventorySession}/sheets/{sheet}',                [\App\Http\Controllers\Api\InventorySheetController::class, 'destroy']);

        // POS — Sales
        Route::post('/sales/sync-offline', [SaleController::class, 'syncOffline']);
        Route::get('/sales/today-stats', [SaleController::class, 'todayStats']);
        Route::post('/sales/{sale}/cancel', [SaleController::class, 'cancel']);
        Route::apiResource('/sales', SaleController::class)->only(['index', 'store', 'show']);

        // Cash Sessions
        Route::get('/cash-sessions', [CashSessionController::class, 'index']);
        Route::post('/cash-sessions/open', [CashSessionController::class, 'open']);
        Route::get('/cash-sessions/current', [CashSessionController::class, 'current']);
        Route::post('/cash-sessions/{session}/close', [CashSessionController::class, 'close']);
        Route::post('/cash-sessions/{session}/movements', [CashSessionController::class, 'addMovement']);
        Route::get('/cash-sessions/{session}', [CashSessionController::class, 'show']);

        // Promotions
        Route::get('/promotions/stats', [\App\Http\Controllers\Api\PromotionController::class, 'stats']);
        Route::apiResource('/promotions', \App\Http\Controllers\Api\PromotionController::class);

        // Losses
        Route::get('/losses/stats', [\App\Http\Controllers\Api\LossController::class, 'stats']);
        Route::post('/losses/{loss}/validate', [\App\Http\Controllers\Api\LossController::class, 'validate']);
        Route::post('/losses/{loss}/reject', [\App\Http\Controllers\Api\LossController::class, 'reject']);
        Route::apiResource('/losses', \App\Http\Controllers\Api\LossController::class);

        // Reports
        Route::prefix('/reports')->group(function () {
            Route::get('/sales-by-product', [\App\Http\Controllers\Api\ReportController::class, 'salesByProduct']);
            Route::get('/sales-by-cashier', [\App\Http\Controllers\Api\ReportController::class, 'salesByCashier']);
            Route::get('/sales-by-category', [\App\Http\Controllers\Api\ReportController::class, 'salesByCategory']);
            Route::get('/payment-methods', [\App\Http\Controllers\Api\ReportController::class, 'paymentMethods']);
            Route::get('/stock-valuation', [\App\Http\Controllers\Api\ReportController::class, 'stockValuation']);
            Route::get('/supplier-balances', [\App\Http\Controllers\Api\ReportController::class, 'supplierBalances']);
            Route::get('/client-credit', [\App\Http\Controllers\Api\ReportController::class, 'clientCredit']);
        });

        // Restaurant
        Route::prefix('/restaurant')->group(function () {
            Route::get('/stats', [\App\Http\Controllers\Api\RestaurantController::class, 'stats']);
            Route::get('/floor-plan', [\App\Http\Controllers\Api\RestaurantController::class, 'floorPlan']);
            Route::post('/tables/{table}/open', [\App\Http\Controllers\Api\RestaurantController::class, 'openTable']);
            Route::post('/tables/{table}/close', [\App\Http\Controllers\Api\RestaurantController::class, 'closeTable']);
            Route::get('/sessions/{session}/orders', [\App\Http\Controllers\Api\RestaurantController::class, 'tableOrders']);
            Route::get('/kds', [\App\Http\Controllers\Api\RestaurantController::class, 'kdsView']);
            Route::post('/orders', [\App\Http\Controllers\Api\RestaurantController::class, 'createOrder']);
            Route::put('/orders/{order}', [\App\Http\Controllers\Api\RestaurantController::class, 'updateOrder']);
            Route::post('/orders/{order}/send-to-kitchen', [\App\Http\Controllers\Api\RestaurantController::class, 'sendToKitchen']);
            Route::post('/orders/{order}/items/{orderItem}/ready', [\App\Http\Controllers\Api\RestaurantController::class, 'markItemReady']);
            Route::get('/reservations', [\App\Http\Controllers\Api\RestaurantController::class, 'reservations']);
            Route::post('/reservations', [\App\Http\Controllers\Api\RestaurantController::class, 'createReservation']);
            Route::put('/reservations/{reservation}', [\App\Http\Controllers\Api\RestaurantController::class, 'updateReservation']);
        });

        // Menu Restaurant (catalogue articles)
        Route::prefix('/restaurant-items')->group(function () {
            Route::get('/stats',                                  [\App\Http\Controllers\Api\RestaurantItemController::class, 'stats']);
            Route::get('/stations',                               [\App\Http\Controllers\Api\RestaurantItemController::class, 'stations']);
            Route::get('/',                                       [\App\Http\Controllers\Api\RestaurantItemController::class, 'index']);
            Route::post('/',                                      [\App\Http\Controllers\Api\RestaurantItemController::class, 'store']);
            Route::get('/{restaurantItem}',                       [\App\Http\Controllers\Api\RestaurantItemController::class, 'show']);
            Route::put('/{restaurantItem}',                       [\App\Http\Controllers\Api\RestaurantItemController::class, 'update']);
            Route::delete('/{restaurantItem}',                    [\App\Http\Controllers\Api\RestaurantItemController::class, 'destroy']);
            Route::post('/{restaurantItem}/toggle-availability',  [\App\Http\Controllers\Api\RestaurantItemController::class, 'toggleAvailability']);
            Route::post('/{restaurantItem}/image',                [\App\Http\Controllers\Api\RestaurantItemController::class, 'uploadImage']);
            Route::post('/{restaurantItem}/recipe',               [\App\Http\Controllers\Api\RestaurantItemController::class, 'syncRecipe']);
        });

        // Comptabilité
        Route::prefix('/accounting')->group(function () {
            Route::post('/accounts/init',             [\App\Http\Controllers\Api\AccountingController::class, 'initAccounts']);
            Route::get('/accounts',                   [\App\Http\Controllers\Api\AccountingController::class, 'accounts']);
            Route::post('/accounts',                  [\App\Http\Controllers\Api\AccountingController::class, 'storeAccount']);
            Route::put('/accounts/{account}',         [\App\Http\Controllers\Api\AccountingController::class, 'updateAccount']);
            Route::delete('/accounts/{account}',      [\App\Http\Controllers\Api\AccountingController::class, 'destroyAccount']);
            Route::get('/journal',                    [\App\Http\Controllers\Api\AccountingController::class, 'journal']);
            Route::post('/journal',                   [\App\Http\Controllers\Api\AccountingController::class, 'storeEntry']);
            Route::post('/journal/{entry}/validate',  [\App\Http\Controllers\Api\AccountingController::class, 'validateEntry']);
            Route::get('/ledger/{account}',           [\App\Http\Controllers\Api\AccountingController::class, 'generalLedger']);
            Route::get('/trial-balance',              [\App\Http\Controllers\Api\AccountingController::class, 'trialBalance']);
            Route::get('/income-statement',           [\App\Http\Controllers\Api\AccountingController::class, 'incomeStatement']);
            Route::get('/bilan',                      [\App\Http\Controllers\Api\AccountingController::class, 'bilan']);
            Route::post('/generate/sales',            [\App\Http\Controllers\Api\AccountingController::class, 'generateFromSales']);
            Route::post('/generate/purchases',        [\App\Http\Controllers\Api\AccountingController::class, 'generateFromPurchases']);
            Route::post('/generate/expenses',         [\App\Http\Controllers\Api\AccountingController::class, 'generateFromExpenses']);
        });

        // Dépenses
        Route::prefix('/expenses')->group(function () {
            Route::get('/stats',                                        [\App\Http\Controllers\Api\ExpenseController::class, 'stats']);
            Route::get('/',                                             [\App\Http\Controllers\Api\ExpenseController::class, 'index']);
            Route::post('/',                                            [\App\Http\Controllers\Api\ExpenseController::class, 'store']);
            Route::get('/{expense}',                                    [\App\Http\Controllers\Api\ExpenseController::class, 'show']);
            Route::put('/{expense}',                                    [\App\Http\Controllers\Api\ExpenseController::class, 'update']);
            Route::post('/{expense}/validate',                          [\App\Http\Controllers\Api\ExpenseController::class, 'validate']);
            Route::post('/{expense}/cancel',                            [\App\Http\Controllers\Api\ExpenseController::class, 'cancel']);
        });

        // Catégories de dépenses
        Route::prefix('/expense-categories')->group(function () {
            Route::post('/init',                                        [\App\Http\Controllers\Api\ExpenseController::class, 'initCategories']);
            Route::get('/',                                             [\App\Http\Controllers\Api\ExpenseController::class, 'categories']);
            Route::post('/',                                            [\App\Http\Controllers\Api\ExpenseController::class, 'storeCategory']);
            Route::put('/{category}',                                   [\App\Http\Controllers\Api\ExpenseController::class, 'updateCategory']);
            Route::delete('/{category}',                                [\App\Http\Controllers\Api\ExpenseController::class, 'destroyCategory']);
        });

        // Print Templates
        Route::get('/print-templates/default/{type}', [\App\Http\Controllers\Api\PrintTemplateController::class, 'defaultForType']);
        Route::apiResource('/print-templates', \App\Http\Controllers\Api\PrintTemplateController::class);

        // Organizations, Stores & Users (admin)
        Route::apiResource('/organizations', \App\Http\Controllers\Api\OrganizationController::class);
        Route::post('/organizations/{organization}/logo', [\App\Http\Controllers\Api\OrganizationController::class, 'uploadLogo']);
        Route::get('/stores/menu-config',        [\App\Http\Controllers\Api\StoreController::class, 'getMenuConfig']);
        Route::put('/stores/menu-config',        [\App\Http\Controllers\Api\StoreController::class, 'updateMenuConfig']);
        Route::apiResource('/stores', \App\Http\Controllers\Api\StoreController::class);
        Route::post('/stores/{store}/logo',      [\App\Http\Controllers\Api\StoreController::class, 'uploadLogo']);
        Route::apiResource('/users', \App\Http\Controllers\Api\UserController::class);
        Route::put('/profile', [\App\Http\Controllers\Api\UserController::class, 'updateProfile']);
        // Roles & Permissions management
        Route::get('/roles/simple', [\App\Http\Controllers\Api\RoleController::class, 'simple']);
        Route::get('/roles', [\App\Http\Controllers\Api\RoleController::class, 'index']);
        Route::post('/roles', [\App\Http\Controllers\Api\RoleController::class, 'store']);
        Route::put('/roles/{role}', [\App\Http\Controllers\Api\RoleController::class, 'update']);
        Route::delete('/roles/{role}', [\App\Http\Controllers\Api\RoleController::class, 'destroy']);
        Route::get('/permissions', [\App\Http\Controllers\Api\RoleController::class, 'permissions']);

        // Store Transfers (inter-magasins)
        Route::get('/store-transfers', [\App\Http\Controllers\Api\StoreTransferController::class, 'index']);
        Route::post('/store-transfers', [\App\Http\Controllers\Api\StoreTransferController::class, 'store']);
        Route::get('/store-transfers/{storeTransfer}', [\App\Http\Controllers\Api\StoreTransferController::class, 'show']);
        Route::post('/store-transfers/{storeTransfer}/approve', [\App\Http\Controllers\Api\StoreTransferController::class, 'approve']);
        Route::post('/store-transfers/{storeTransfer}/reject', [\App\Http\Controllers\Api\StoreTransferController::class, 'reject']);
        Route::post('/store-transfers/{storeTransfer}/ship', [\App\Http\Controllers\Api\StoreTransferController::class, 'ship']);
        Route::post('/store-transfers/{storeTransfer}/receive', [\App\Http\Controllers\Api\StoreTransferController::class, 'receive']);
        Route::post('/store-transfers/{storeTransfer}/cancel', [\App\Http\Controllers\Api\StoreTransferController::class, 'cancel']);
        Route::get('/audit-logs', fn(\Illuminate\Http\Request $r) => response()->json(
            \App\Models\AuditLog::where('store_id', $r->user()->store_id)
                ->with('user')
                ->orderByDesc('created_at')
                ->paginate(50)
        ));

        // ── PDF Export ────────────────────────────────────────────────────────
        Route::prefix('pdf')->group(function () {
            Route::get('/invoices/{invoice}',        [\App\Http\Controllers\Api\PdfController::class, 'invoice']);
            Route::get('/quotes/{quote}',            [\App\Http\Controllers\Api\PdfController::class, 'quote']);
            Route::get('/reports/sales-by-product',  [\App\Http\Controllers\Api\PdfController::class, 'reportSalesByProduct']);
            Route::get('/reports/sales-by-cashier',  [\App\Http\Controllers\Api\PdfController::class, 'reportSalesByCashier']);
            Route::get('/reports/sales-by-category', [\App\Http\Controllers\Api\PdfController::class, 'reportSalesByCategory']);
            Route::get('/reports/stock-valuation',   [\App\Http\Controllers\Api\PdfController::class, 'reportStockValuation']);
            Route::get('/reports/supplier-balances', [\App\Http\Controllers\Api\PdfController::class, 'reportSupplierBalances']);
            Route::get('/reports/client-credit',     [\App\Http\Controllers\Api\PdfController::class, 'reportClientCredit']);
            // ── États comptables ──────────────────────────────────────────────
            Route::get('/accounting/journal',         [\App\Http\Controllers\Api\PdfController::class, 'accountingJournal']);
            Route::get('/accounting/balance',         [\App\Http\Controllers\Api\PdfController::class, 'accountingBalance']);
            Route::get('/accounting/resultat',        [\App\Http\Controllers\Api\PdfController::class, 'accountingResultat']);
            Route::get('/accounting/bilan',           [\App\Http\Controllers\Api\PdfController::class, 'accountingBilan']);
        });

        // ── Facturation & Devis ────────────────────────────────────────────────
        Route::get('/invoices/import-template', [\App\Http\Controllers\Api\InvoiceImportController::class, 'template']);
        Route::post('/invoices/import/preview', [\App\Http\Controllers\Api\InvoiceImportController::class, 'preview']);
        Route::post('/invoices/import/confirm', [\App\Http\Controllers\Api\InvoiceImportController::class, 'confirm']);

        Route::prefix('invoices')->group(function () {
            Route::get('/stats',                   [\App\Http\Controllers\Api\InvoiceController::class, 'stats']);
            Route::get('/',                        [\App\Http\Controllers\Api\InvoiceController::class, 'index']);
            Route::post('/',                       [\App\Http\Controllers\Api\InvoiceController::class, 'store']);
            Route::get('/{invoice}',               [\App\Http\Controllers\Api\InvoiceController::class, 'show']);
            Route::put('/{invoice}',               [\App\Http\Controllers\Api\InvoiceController::class, 'update']);
            Route::delete('/{invoice}',            [\App\Http\Controllers\Api\InvoiceController::class, 'destroy']);
            Route::post('/{invoice}/mark-sent',    [\App\Http\Controllers\Api\InvoiceController::class, 'markSent']);
            Route::post('/{invoice}/cancel',       [\App\Http\Controllers\Api\InvoiceController::class, 'cancel']);
            Route::post('/{invoice}/payments',     [\App\Http\Controllers\Api\InvoiceController::class, 'addPayment']);
            Route::post('/{invoice}/reminders',    [\App\Http\Controllers\Api\InvoiceController::class, 'addReminder']);
        });

        Route::prefix('quotes')->group(function () {
            Route::get('/',                        [\App\Http\Controllers\Api\InvoiceController::class, 'quotesIndex']);
            Route::post('/',                       [\App\Http\Controllers\Api\InvoiceController::class, 'quotesStore']);
            Route::get('/{quote}',                 [\App\Http\Controllers\Api\InvoiceController::class, 'quotesShow']);
            Route::put('/{quote}',                 [\App\Http\Controllers\Api\InvoiceController::class, 'quotesUpdate']);
            Route::delete('/{quote}',              [\App\Http\Controllers\Api\InvoiceController::class, 'quotesDestroy']);
            Route::post('/{quote}/mark-sent',      [\App\Http\Controllers\Api\InvoiceController::class, 'quoteMarkSent']);
            Route::post('/{quote}/accept',         [\App\Http\Controllers\Api\InvoiceController::class, 'quoteAccept']);
            Route::post('/{quote}/convert',        [\App\Http\Controllers\Api\InvoiceController::class, 'quoteConvert']);
        });

        // ── Relances factures ─────────────────────────────────────────────────────
        Route::get('/invoice-reminder-rules/default-template', [\App\Http\Controllers\Api\InvoiceReminderController::class, 'getDefaultTemplate']);
        Route::get('/invoice-reminder-rules',                  [\App\Http\Controllers\Api\InvoiceReminderController::class, 'indexRules']);
        Route::post('/invoice-reminder-rules',                 [\App\Http\Controllers\Api\InvoiceReminderController::class, 'storeRule']);
        Route::put('/invoice-reminder-rules/{invoiceReminderRule}',    [\App\Http\Controllers\Api\InvoiceReminderController::class, 'updateRule']);
        Route::delete('/invoice-reminder-rules/{invoiceReminderRule}', [\App\Http\Controllers\Api\InvoiceReminderController::class, 'destroyRule']);
        Route::get('/invoice-reminder-queue',                          [\App\Http\Controllers\Api\InvoiceReminderController::class, 'indexQueue']);
        Route::post('/invoice-reminder-queue/process',                 [\App\Http\Controllers\Api\InvoiceReminderController::class, 'processQueue']);
        Route::post('/invoice-reminder-queue/{invoiceReminderQueue}/send',  [\App\Http\Controllers\Api\InvoiceReminderController::class, 'markSent']);
        Route::post('/invoice-reminder-queue/{invoiceReminderQueue}/skip',  [\App\Http\Controllers\Api\InvoiceReminderController::class, 'markSkipped']);
        // Twilio
        Route::get('/twilio/status',    [\App\Http\Controllers\Api\InvoiceReminderController::class, 'twilioStatus']);
        Route::post('/twilio/test',     [\App\Http\Controllers\Api\InvoiceReminderController::class, 'twilioTest']);
        Route::post('/twilio/send-test', [\App\Http\Controllers\Api\InvoiceReminderController::class, 'twilioSendTest']);
        // Mail (relances)
        Route::get('/mail/status',      [\App\Http\Controllers\Api\InvoiceReminderController::class, 'mailStatus']);
        Route::post('/mail/test',        [\App\Http\Controllers\Api\InvoiceReminderController::class, 'mailTest']);
        Route::post('/mail/send-test',   [\App\Http\Controllers\Api\InvoiceReminderController::class, 'mailSendTest']);

        // Configuration email organisation
        Route::get('/mail-settings',        [\App\Http\Controllers\Api\MailSettingController::class, 'show']);
        Route::put('/mail-settings',        [\App\Http\Controllers\Api\MailSettingController::class, 'update']);
        Route::post('/mail-settings/test',  [\App\Http\Controllers\Api\MailSettingController::class, 'test']);

        // ── Rayons / Rangement ────────────────────────────────────────────────────
        Route::prefix('sections')->group(function () {
            Route::get('/',                                 [\App\Http\Controllers\Api\StoreSectionController::class, 'index']);
            Route::post('/',                               [\App\Http\Controllers\Api\StoreSectionController::class, 'store']);
            Route::post('/reorder',                        [\App\Http\Controllers\Api\StoreSectionController::class, 'reorder']);
            Route::get('/unassigned',                      [\App\Http\Controllers\Api\StoreSectionController::class, 'unassigned']);
            Route::delete('/products/{productId}/unassign',[\App\Http\Controllers\Api\StoreSectionController::class, 'unassignProduct']);
            Route::put('/{section}',                       [\App\Http\Controllers\Api\StoreSectionController::class, 'update']);
            Route::delete('/{section}',                    [\App\Http\Controllers\Api\StoreSectionController::class, 'destroy']);
            Route::get('/{section}/products',              [\App\Http\Controllers\Api\StoreSectionController::class, 'products']);
            Route::post('/{section}/assign',               [\App\Http\Controllers\Api\StoreSectionController::class, 'assignProduct']);
            Route::post('/{section}/assign-bulk',          [\App\Http\Controllers\Api\StoreSectionController::class, 'assignBulk']);
        });

        // ── CRM ───────────────────────────────────────────────────────────────
        Route::prefix('crm')->group(function () {
            Route::get('/stats',                                   [\App\Http\Controllers\Api\CrmController::class, 'stats']);
            Route::get('/tasks',                                   [\App\Http\Controllers\Api\CrmController::class, 'tasks']);
            // Pipelines
            Route::get('/pipelines',                               [\App\Http\Controllers\Api\CrmPipelineController::class, 'index']);
            Route::post('/pipelines',                              [\App\Http\Controllers\Api\CrmPipelineController::class, 'store']);
            Route::put('/pipelines/{pipeline}',                    [\App\Http\Controllers\Api\CrmPipelineController::class, 'update']);
            Route::delete('/pipelines/{pipeline}',                 [\App\Http\Controllers\Api\CrmPipelineController::class, 'destroy']);
            Route::post('/pipelines/reorder',                      [\App\Http\Controllers\Api\CrmPipelineController::class, 'reorder']);
            // Leads
            Route::get('/leads',                                   [\App\Http\Controllers\Api\CrmController::class, 'index']);
            Route::post('/leads',                                  [\App\Http\Controllers\Api\CrmController::class, 'store']);
            Route::get('/leads/{crmLead}',                         [\App\Http\Controllers\Api\CrmController::class, 'show']);
            Route::put('/leads/{crmLead}',                         [\App\Http\Controllers\Api\CrmController::class, 'update']);
            Route::delete('/leads/{crmLead}',                      [\App\Http\Controllers\Api\CrmController::class, 'destroy']);
            Route::post('/leads/{crmLead}/move-stage',             [\App\Http\Controllers\Api\CrmController::class, 'moveStage']);
            Route::post('/leads/{crmLead}/convert-to-client',      [\App\Http\Controllers\Api\CrmController::class, 'convertToClient']);
            Route::post('/leads/{crmLead}/activities',             [\App\Http\Controllers\Api\CrmController::class, 'storeActivity']);
            Route::post('/activities/{crmActivity}/complete',      [\App\Http\Controllers\Api\CrmController::class, 'completeActivity']);
            Route::delete('/activities/{crmActivity}',             [\App\Http\Controllers\Api\CrmController::class, 'destroyActivity']);
        });

        // ── Support Tickets ───────────────────────────────────────────────────
        Route::prefix('/support')->group(function () {
            Route::get('/stats',                                           [\App\Http\Controllers\Api\SupportTicketController::class, 'stats']);
            Route::get('/tickets',                                         [\App\Http\Controllers\Api\SupportTicketController::class, 'index']);
            Route::post('/tickets',                                        [\App\Http\Controllers\Api\SupportTicketController::class, 'store']);
            Route::get('/tickets/{supportTicket}',                         [\App\Http\Controllers\Api\SupportTicketController::class, 'show']);
            Route::post('/tickets/{supportTicket}/reply',                  [\App\Http\Controllers\Api\SupportTicketController::class, 'reply']);
            Route::patch('/tickets/{supportTicket}/status',                [\App\Http\Controllers\Api\SupportTicketController::class, 'updateStatus']);
            Route::post('/tickets/{supportTicket}/close',                  [\App\Http\Controllers\Api\SupportTicketController::class, 'close']);
        });
    });
});
