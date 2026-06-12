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

        // Categories
        Route::get('/categories', fn() => response()->json(\App\Models\Category::with('children')->whereNull('parent_id')->orderBy('sort_order')->get()));
        Route::post('/categories', fn(\Illuminate\Http\Request $r) => response()->json(\App\Models\Category::create($r->validate(['name' => 'required', 'parent_id' => 'nullable|exists:categories,id', 'type' => 'nullable|in:common,grande_surface,restaurant'])), 201));

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

        // Stores & Users (admin)
        Route::apiResource('/stores', \App\Http\Controllers\Api\StoreController::class);
        Route::apiResource('/users', \App\Http\Controllers\Api\UserController::class);
        Route::get('/audit-logs', fn(\Illuminate\Http\Request $r) => response()->json(
            \App\Models\AuditLog::where('store_id', $r->user()->store_id)
                ->with('user')
                ->orderByDesc('created_at')
                ->paginate(50)
        ));
    });
});
