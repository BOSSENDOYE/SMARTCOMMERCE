<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiningArea;
use App\Models\TableSession;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RestaurantController extends Controller
{
    public function floorPlan(Request $request)
    {
        $storeId = $request->user()->store_id;
        $areas = DiningArea::with(['tables' => function ($q) use ($storeId) {
            $q->where('store_id', $storeId)
              ->with(['activeSession.order:id,table_session_id,status']);
        }])
        ->where('store_id', $storeId)
        ->get();

        return response()->json($areas);
    }

    public function createOrder(Request $request)
    {
        $data = $request->validate([
            'table_session_id' => 'nullable|exists:table_sessions,id',
            'type' => 'required|in:dine_in,takeaway,delivery',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.qty' => 'required|numeric|min:0.5',
            'items.*.unit_price_ttc' => 'required|numeric|min:0',
            'items.*.notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $order = Order::create([
                'store_id' => $request->user()->store_id,
                'table_session_id' => $data['table_session_id'] ?? null,
                'type' => $data['type'],
                'status' => 'pending',
                'server_id' => $request->user()->id,
            ]);

            foreach ($data['items'] as $item) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $item['product_id'],
                    'qty' => $item['qty'],
                    'unit_price_ttc' => $item['unit_price_ttc'],
                    'status' => 'pending',
                    'notes' => $item['notes'] ?? null,
                ]);
            }

            return response()->json($order->load('items.product:id,name'), 201);
        });
    }

    public function updateOrder(Request $request, Order $order)
    {
        $data = $request->validate([
            'status' => 'sometimes|in:pending,preparing,ready,served,cancelled',
            'notes' => 'nullable|string',
        ]);
        $order->update($data);
        return response()->json($order->load('items'));
    }

    public function markItemReady(Request $request, OrderItem $orderItem)
    {
        $orderItem->update(['status' => 'ready', 'ready_at' => now()]);
        $allReady = $orderItem->order->items()->where('status', '!=', 'ready')->doesntExist();
        if ($allReady) {
            $orderItem->order->update(['status' => 'ready']);
        }
        return response()->json($orderItem->fresh());
    }

    public function kdsView(Request $request)
    {
        $stationId = $request->input('station_id');
        $orders = Order::with(['items' => function ($q) use ($stationId) {
            $q->where('status', 'pending');
            if ($stationId) {
                $q->whereHas('product', fn($q) => $q->where('production_station_id', $stationId));
            }
        }])
        ->where('store_id', $request->user()->store_id)
        ->whereIn('status', ['pending', 'preparing'])
        ->with('tableSession.table:id,label')
        ->orderBy('created_at')
        ->get();

        return response()->json($orders);
    }

    public function reservations(Request $request)
    {
        $query = Reservation::with('client:id,name,phone')
            ->where('store_id', $request->user()->store_id);

        if ($request->date) {
            $query->whereDate('reservation_date', $request->date);
        } else {
            $query->where('reservation_date', '>=', now()->startOfDay());
        }

        return response()->json($query->orderBy('reservation_date')->get());
    }

    public function createReservation(Request $request)
    {
        $data = $request->validate([
            'client_id' => 'nullable|exists:clients,id',
            'guest_name' => 'required_without:client_id|nullable|string',
            'guest_phone' => 'nullable|string',
            'party_size' => 'required|integer|min:1',
            'reservation_date' => 'required|date',
            'duration_minutes' => 'nullable|integer|min:30',
            'notes' => 'nullable|string',
        ]);

        $reservation = Reservation::create(array_merge($data, [
            'store_id' => $request->user()->store_id,
            'status' => 'confirmed',
            'created_by' => $request->user()->id,
        ]));

        return response()->json($reservation, 201);
    }
}
