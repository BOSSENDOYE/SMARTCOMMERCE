<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\CashSessionMovement;
use App\Services\AuditService;
use Illuminate\Http\Request;

class CashSessionController extends Controller
{
    public function open(Request $request)
    {
        $storeId = $request->user()->store_id;

        $active = CashSession::where('store_id', $storeId)
            ->where('workstation_id', $request->workstation_id)
            ->where('status', 'open')
            ->first();

        if ($active) {
            return response()->json($active->load('user'), 200);
        }

        $request->validate([
            'opening_balance' => 'required|numeric|min:0',
            'workstation_id' => 'nullable|exists:workstations,id',
            'opening_count' => 'nullable|array',
        ]);

        $session = CashSession::create([
            'store_id' => $storeId,
            'workstation_id' => $request->workstation_id,
            'user_id' => $request->user()->id,
            'status' => 'open',
            'opening_balance' => $request->opening_balance,
            'opening_count' => $request->opening_count,
            'opened_at' => now(),
        ]);

        AuditService::log('cash_session_opened', 'cash_sessions', $session->id, [
            'opening_balance' => $session->opening_balance,
        ]);

        return response()->json($session, 201);
    }

    public function index(Request $request)
    {
        $storeId = $request->user()->store_id;

        $sessions = CashSession::where('store_id', $storeId)
            ->with(['user:id,name', 'closedByUser:id,name'])
            ->orderByDesc('opened_at')
            ->paginate(30);

        // Aggregate sales stats in one query
        $ids = $sessions->pluck('id');
        $stats = \App\Models\Sale::whereIn('cash_session_id', $ids)
            ->where('status', 'completed')
            ->selectRaw('cash_session_id, COUNT(*) as sales_count, SUM(total_ttc) as total_ttc')
            ->groupBy('cash_session_id')
            ->get()->keyBy('cash_session_id');

        $sessions->each(function ($s) use ($stats) {
            $row = $stats[$s->id] ?? null;
            $s->sales_count = $row ? (int) $row->sales_count : 0;
            $s->total_sales = $row ? (float) $row->total_ttc  : 0.0;
        });

        return response()->json($sessions);
    }

    public function show(Request $request, CashSession $session)
    {
        abort_if($session->store_id !== $request->user()->store_id, 403);

        $sales = \App\Models\Sale::where('cash_session_id', $session->id)
            ->where('status', 'completed')
            ->orderByDesc('created_at')
            ->get(['id', 'reference', 'total_ttc', 'paid_amount', 'created_at', 'channel']);

        $paymentTotals = \App\Models\SalePayment::whereHas('sale', fn($q) => $q
                ->where('cash_session_id', $session->id)->where('status', 'completed')
            )
            ->selectRaw('payment_method, SUM(amount) as total')
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method');

        $movements = $session->movements()->orderByDesc('created_at')->get();

        return response()->json([
            'session'           => $session->load('user:id,name', 'closedByUser:id,name'),
            'sales'             => $sales,
            'payment_breakdown' => $paymentTotals,
            'movements'         => $movements,
            'stats'             => [
                'total_sales'   => $sales->count(),
                'total_ttc'     => (float) $sales->sum('total_ttc'),
                'cash_expected' => (float) ($session->closing_balance_expected ?? 0),
                'cash_actual'   => (float) ($session->closing_balance_actual   ?? 0),
                'cash_variance' => (float) ($session->closing_balance_variance  ?? 0),
            ],
        ]);
    }

    public function close(Request $request, CashSession $session)
    {
        abort_if($session->store_id !== $request->user()->store_id, 403);

        // Already closed → return existing Z-report instead of an error
        if ($session->status === 'closed') {
            return response()->json($this->buildZReport($session));
        }

        $request->validate([
            'closing_balance_actual' => 'required|numeric|min:0',
            'closing_count' => 'nullable|array',
        ]);

        $expectedBalance = $this->calculateExpected($session);
        $variance = $request->closing_balance_actual - $expectedBalance;

        $session->update([
            'status' => 'closed',
            'closing_balance_expected' => $expectedBalance,
            'closing_balance_actual' => $request->closing_balance_actual,
            'closing_balance_variance' => $variance,
            'closing_count' => $request->closing_count,
            'closed_at' => now(),
            'closed_by' => $request->user()->id,
        ]);

        AuditService::log('cash_session_closed', 'cash_sessions', $session->id, [
            'variance' => $variance,
            'expected' => $expectedBalance,
            'actual' => $request->closing_balance_actual,
        ]);

        return response()->json($this->buildZReport($session));
    }

    private function calculateExpected(CashSession $session): float
    {
        $cashSales = \App\Models\SalePayment::whereHas('sale', fn($q) => $q->where('cash_session_id', $session->id)->where('status', 'completed'))
            ->where('payment_method', 'cash')
            ->sum('amount');

        $deposits = $session->movements()->where('type', 'deposit')->sum('amount');
        $withdrawals = $session->movements()->whereIn('type', ['withdrawal', 'expense'])->sum('amount');

        return $session->opening_balance + $cashSales + $deposits - $withdrawals;
    }

    private function buildZReport(CashSession $session): array
    {
        $sales = \App\Models\Sale::where('cash_session_id', $session->id)
            ->where('status', 'completed');

        $paymentTotals = \App\Models\SalePayment::whereHas('sale', fn($q) => $q
                ->where('cash_session_id', $session->id)->where('status', 'completed')
            )
            ->selectRaw('payment_method, SUM(amount) as total')
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method');

        return [
            'session' => $session->load('user', 'workstation'),
            'z_report' => [
                'transaction_count' => (clone $sales)->count(),
                'total_ttc' => (clone $sales)->sum('total_ttc'),
                'total_ht' => (clone $sales)->sum('subtotal_ht'),
                'total_vat' => (clone $sales)->sum('vat_amount'),
                'total_discounts' => (clone $sales)->sum('discount_amount'),
                'payment_breakdown' => $paymentTotals,
                'cash_expected' => $session->closing_balance_expected,
                'cash_actual' => $session->closing_balance_actual,
                'cash_variance' => $session->closing_balance_variance,
            ],
        ];
    }

    public function addMovement(Request $request, CashSession $session)
    {
        if ($session->status !== 'open') {
            return response()->json(['message' => 'Session fermée.'], 422);
        }

        $request->validate([
            'type' => 'required|in:deposit,withdrawal,expense',
            'amount' => 'required|numeric|min:0.01',
            'motive' => 'required|string|max:200',
        ]);

        $movement = CashSessionMovement::create([
            'cash_session_id' => $session->id,
            'user_id' => $request->user()->id,
            'type' => $request->type,
            'amount' => $request->amount,
            'motive' => $request->motive,
            'receipt_ref' => $request->receipt_ref,
        ]);

        AuditService::log('cash_movement', 'cash_session_movements', $movement->id, $movement->toArray());

        return response()->json($movement, 201);
    }

    public function current(Request $request)
    {
        $session = CashSession::where('store_id', $request->user()->store_id)
            ->where('status', 'open')
            ->when($request->workstation_id, fn($q) => $q->where('workstation_id', $request->workstation_id))
            ->with(['user', 'workstation'])
            ->first();

        return response()->json($session);
    }
}
