<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiningArea;
use App\Models\Table;
use App\Models\TableSession;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RestaurantController extends Controller
{
    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;

        $occupiedTables = Table::whereHas('area', fn($q) => $q->where('store_id', $storeId))
            ->whereIn('status', ['occupied', 'ordered', 'served', 'bill_requested'])
            ->count();

        $totalTables = Table::whereHas('area', fn($q) => $q->where('store_id', $storeId))
            ->where('is_active', true)->count();

        $activeOrders = Order::where('store_id', $storeId)
            ->whereNotIn('status', ['served', 'cancelled'])
            ->count();

        $todayRevenue = Order::where('store_id', $storeId)
            ->where('status', 'served')
            ->whereDate('updated_at', today())
            ->sum('total_amount');

        $todayReservations = Reservation::where('store_id', $storeId)
            ->whereDate('reservation_date', today())
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->count();

        return response()->json([
            'occupied_tables' => $occupiedTables,
            'total_tables' => $totalTables,
            'active_orders' => $activeOrders,
            'today_revenue' => (float) $todayRevenue,
            'today_reservations' => $todayReservations,
        ]);
    }

    public function floorPlan(Request $request)
    {
        $storeId = $request->user()->store_id;
        $areas = DiningArea::with(['tables' => function ($q) {
            $q->with(['activeSession' => function ($sq) {
                $sq->with(['orders' => function ($oq) {
                    $oq->whereNotIn('status', ['cancelled', 'served'])->select('id', 'table_session_id', 'status', 'reference', 'total_amount');
                }]);
            }])->where('is_active', true)->orderBy('number');
        }])
        ->where('store_id', $storeId)
        ->where('is_active', true)
        ->orderBy('sort_order')
        ->get();

        return response()->json($areas);
    }

    public function openTable(Request $request, Table $table)
    {
        $data = $request->validate([
            'covers' => 'required|integer|min:1',
        ]);

        if ($table->status !== 'free') {
            return response()->json(['message' => 'Table déjà occupée'], 422);
        }

        return DB::transaction(function () use ($table, $data, $request) {
            $session = TableSession::create([
                'table_id' => $table->id,
                'opened_by' => $request->user()->id,
                'covers' => $data['covers'],
                'opened_at' => now(),
            ]);

            $table->update(['status' => 'occupied']);

            return response()->json($session, 201);
        });
    }

    public function closeTable(Request $request, Table $table)
    {
        $session = $table->activeSession;
        if (!$session) {
            return response()->json(['message' => 'Aucune session active'], 422);
        }

        $session->update([
            'closed_by' => $request->user()->id,
            'closed_at' => now(),
        ]);

        $table->update(['status' => 'free']);

        return response()->json(['message' => 'Table libérée']);
    }

    public function tableOrders(Request $request, TableSession $session)
    {
        $orders = $session->orders()
            ->with(['items.product:id,name,price_ttc'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($orders);
    }

    public function createOrder(Request $request)
    {
        $data = $request->validate([
            'table_session_id' => 'nullable|exists:table_sessions,id',
            'channel' => 'required|in:dine_in,takeaway,delivery',
            'client_name' => 'nullable|string|max:100',
            'client_phone' => 'nullable|string|max:30',
            'covers' => 'nullable|integer|min:1',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.qty' => 'required|numeric|min:0.5',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.course' => 'nullable|in:starter,main,dessert,drink,other',
            'items.*.notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $date = now()->format('Ymd');
            $last = Order::where('store_id', $request->user()->store_id)
                ->whereDate('created_at', today())
                ->orderByDesc('id')->value('reference');
            $seq = $last ? (int) substr($last, -4) + 1 : 1;
            $reference = 'CMD' . $date . str_pad($seq, 4, '0', STR_PAD_LEFT);

            $totalAmount = collect($data['items'])->sum(fn($i) => $i['qty'] * $i['unit_price']);

            $order = Order::create([
                'store_id' => $request->user()->store_id,
                'table_session_id' => $data['table_session_id'] ?? null,
                'user_id' => $request->user()->id,
                'reference' => $reference,
                'channel' => $data['channel'],
                'client_name' => $data['client_name'] ?? null,
                'client_phone' => $data['client_phone'] ?? null,
                'covers' => $data['covers'] ?? 1,
                'notes' => $data['notes'] ?? null,
                'status' => 'pending',
                'total_amount' => $totalAmount,
            ]);

            foreach ($data['items'] as $item) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $item['product_id'],
                    'qty' => $item['qty'],
                    'unit_price' => $item['unit_price'],
                    'course' => $item['course'] ?? 'main',
                    'status' => 'pending',
                    'notes' => $item['notes'] ?? null,
                ]);
            }

            if ($data['table_session_id'] ?? null) {
                $session = TableSession::find($data['table_session_id']);
                $session?->table->update(['status' => 'ordered']);
            }

            return response()->json($order->load('items.product:id,name,price_ttc'), 201);
        });
    }

    public function updateOrder(Request $request, Order $order)
    {
        $data = $request->validate([
            'status' => 'sometimes|in:pending,confirmed,preparing,ready,served,cancelled',
            'notes' => 'nullable|string',
        ]);

        $order->update($data);

        if (isset($data['status']) && $order->table_session_id) {
            $session = $order->tableSession;
            if ($session) {
                if ($data['status'] === 'served') {
                    $pending = $session->orders()->whereNotIn('status', ['served', 'cancelled'])->count();
                    $session->table->update(['status' => $pending === 0 ? 'bill_requested' : 'served']);
                } elseif ($data['status'] === 'preparing') {
                    $session->table->update(['status' => 'ordered']);
                }
            }
        }

        return response()->json($order->fresh()->load('items.product:id,name'));
    }

    public function sendToKitchen(Request $request, Order $order)
    {
        $order->items()->where('status', 'pending')->update([
            'status' => 'preparing',
            'sent_at' => now(),
        ]);
        $order->update(['status' => 'preparing']);

        $order->tableSession?->table->update(['status' => 'ordered']);

        return response()->json($order->fresh()->load('items.product:id,name'));
    }

    public function markItemReady(Request $request, OrderItem $orderItem)
    {
        $orderItem->update(['status' => 'ready', 'prepared_at' => now()]);

        $allReady = $orderItem->order->items()
            ->whereNotIn('status', ['ready', 'served', 'cancelled'])
            ->doesntExist();

        if ($allReady) {
            $orderItem->order->update(['status' => 'ready']);
        }

        return response()->json($orderItem->fresh());
    }

    public function kdsView(Request $request)
    {
        $storeId = $request->user()->store_id;
        $stationId = $request->input('station_id');

        $orders = Order::with(['items' => function ($q) use ($stationId) {
            $q->whereIn('status', ['pending', 'preparing']);
            if ($stationId) {
                $q->where('station_id', $stationId);
            }
            $q->with('product:id,name');
        }])
        ->where('store_id', $storeId)
        ->whereIn('status', ['pending', 'confirmed', 'preparing'])
        ->with(['tableSession.table:id,number'])
        ->orderBy('created_at')
        ->get()
        ->filter(fn($o) => $o->items->isNotEmpty())
        ->values();

        return response()->json($orders);
    }

    public function reservations(Request $request)
    {
        $query = Reservation::with(['client:id,name,phone', 'table:id,number'])
            ->where('store_id', $request->user()->store_id);

        if ($request->date) {
            $query->whereDate('reservation_date', $request->date);
        } else {
            $query->whereDate('reservation_date', '>=', today());
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        return response()->json($query->orderBy('reservation_date')->orderBy('reservation_time')->get());
    }

    public function createReservation(Request $request)
    {
        $data = $request->validate([
            'client_id' => 'nullable|exists:clients,id',
            'table_id' => 'nullable|exists:tables,id',
            'client_name' => 'required|string|max:100',
            'client_phone' => 'nullable|string|max:30',
            'covers' => 'required|integer|min:1',
            'reservation_date' => 'required|date',
            'reservation_time' => 'required|string',
            'special_requests' => 'nullable|string',
        ]);

        $reservation = Reservation::create(array_merge($data, [
            'store_id' => $request->user()->store_id,
            'status' => 'confirmed',
        ]));

        return response()->json(
            $reservation->load('client:id,name,phone', 'table:id,number'),
            201
        );
    }

    public function updateReservation(Request $request, Reservation $reservation)
    {
        $data = $request->validate([
            'status' => 'sometimes|in:pending,confirmed,arrived,no_show,cancelled',
            'client_name' => 'sometimes|string|max:100',
            'client_phone' => 'nullable|string|max:30',
            'covers' => 'sometimes|integer|min:1',
            'reservation_date' => 'sometimes|date',
            'reservation_time' => 'sometimes|string',
            'table_id' => 'nullable|exists:tables,id',
            'special_requests' => 'nullable|string',
        ]);

        $reservation->update($data);

        return response()->json($reservation->fresh()->load('client:id,name,phone', 'table:id,number'));
    }
}
