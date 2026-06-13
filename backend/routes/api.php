<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\CashSessionController;
use App\Http\Controllers\Api\DashboardController;

Route::prefix('v1')->group(function () {

    // Auth — public
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/pin', [AuthController::class, 'loginByPin']);

    // Offline sync — requires token
    Route::middleware('auth:sanctum')->group(function () {

        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index']);

        // Products
        Route::get('/products/stats', [ProductController::class, 'stats']);
        Route::get('/products/barcode', [ProductController::class, 'searchByBarcode']);
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

        // Categories
        Route::get('/categories', fn() => response()->json(\App\Models\Category::with('children')->whereNull('parent_id')->orderBy('sort_order')->get()));
        Route::post('/categories', fn(\Illuminate\Http\Request $r) => response()->json(\App\Models\Category::create($r->validate(['name' => 'required', 'parent_id' => 'nullable|exists:categories,id', 'type' => 'nullable|in:common,grande_surface,restaurant'])), 201));
        Route::put('/categories/{category}', fn(\Illuminate\Http\Request $r, \App\Models\Category $category) => response()->json(tap($category)->update($r->validate(['name' => 'required', 'parent_id' => 'nullable|exists:categories,id', 'type' => 'nullable|in:common,grande_surface,restaurant']))));
        Route::delete('/categories/{category}', function (\App\Models\Category $category) {
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
        Route::get('/clients/stats', [\App\Http\Controllers\Api\ClientController::class, 'stats']);
        Route::get('/clients/search', fn(\Illuminate\Http\Request $r) => response()->json(
            \App\Models\Client::where('store_id', $r->user()->store_id)
                ->where(fn($q) => $q->where('phone', 'like', "%{$r->q}%")->orWhere('name', 'like', "%{$r->q}%"))
                ->limit(10)->get()
        ));
        Route::apiResource('/clients', \App\Http\Controllers\Api\ClientController::class);
        Route::get('/clients/{client}/sales', [\App\Http\Controllers\Api\ClientController::class, 'sales']);
        Route::get('/clients/{client}/loyalty-transactions', [\App\Http\Controllers\Api\ClientController::class, 'loyaltyTransactions']);
        Route::post('/clients/{client}/adjust-credit', [\App\Http\Controllers\Api\ClientController::class, 'adjustCredit']);
        Route::post('/clients/{client}/adjust-loyalty', [\App\Http\Controllers\Api\ClientController::class, 'adjustLoyalty']);
        // Client account (wallet/avoir/dette)
        Route::get('/clients/{client}/account-transactions', [\App\Http\Controllers\Api\ClientController::class, 'accountTransactions']);
        Route::post('/clients/{client}/deposit', [\App\Http\Controllers\Api\ClientController::class, 'deposit']);
        Route::post('/clients/{client}/withdraw', [\App\Http\Controllers\Api\ClientController::class, 'withdraw']);

        // Purchase Orders
        Route::get('/purchase-orders/stats', [\App\Http\Controllers\Api\PurchaseOrderController::class, 'stats']);
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

        // Inventory
        Route::apiResource('/inventory-sessions', \App\Http\Controllers\Api\InventoryController::class);
        Route::post('/inventory-sessions/{inventorySession}/validate', [\App\Http\Controllers\Api\InventoryController::class, 'validate']);
        Route::post('/inventory-sessions/{inventorySession}/items', [\App\Http\Controllers\Api\InventoryController::class, 'addItem']);
        Route::delete('/inventory-sessions/{inventorySession}/items/{item}', [\App\Http\Controllers\Api\InventoryController::class, 'removeItem']);

        // POS — Sales
        Route::post('/sales/sync-offline', [SaleController::class, 'syncOffline']);
        Route::get('/sales/today-stats', [SaleController::class, 'todayStats']);
        Route::post('/sales/{sale}/cancel', [SaleController::class, 'cancel']);
        Route::apiResource('/sales', SaleController::class)->only(['index', 'store', 'show']);

        // Cash Sessions
        Route::post('/cash-sessions/open', [CashSessionController::class, 'open']);
        Route::get('/cash-sessions/current', [CashSessionController::class, 'current']);
        Route::post('/cash-sessions/{session}/close', [CashSessionController::class, 'close']);
        Route::post('/cash-sessions/{session}/movements', [CashSessionController::class, 'addMovement']);

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
        Route::apiResource('/stores', \App\Http\Controllers\Api\StoreController::class);
        Route::post('/stores/{store}/logo', [\App\Http\Controllers\Api\StoreController::class, 'uploadLogo']);
        Route::apiResource('/users', \App\Http\Controllers\Api\UserController::class);

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
    });
});
