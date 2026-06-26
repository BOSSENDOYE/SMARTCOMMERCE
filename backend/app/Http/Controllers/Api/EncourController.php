<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientAccountTransaction;
use App\Models\Invoice;
use App\Models\InvoicePayment;
use App\Models\Sale;
use App\Models\SalePayment;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EncourController extends Controller
{
    /**
     * GET /clients/{client}/encours
     * Retourne toutes les créances non soldées du client + historique des encaissements.
     */
    public function index(Request $request, Client $client)
    {
        $storeId = $request->user()->store_id;

        // ── Factures impayées ─────────────────────────────────────────────────
        $invoices = Invoice::where('store_id', $storeId)
            ->where('client_id', $client->id)
            ->whereIn('status', ['sent', 'partial', 'overdue'])
            ->orderBy('due_date')
            ->orderByDesc('issue_date')
            ->get()
            ->map(fn($inv) => [
                'id'          => $inv->id,
                'type'        => 'invoice',
                'reference'   => $inv->reference,
                'label'       => $inv->object ?: $inv->reference,
                'date'        => $inv->issue_date?->format('Y-m-d'),
                'due_date'    => $inv->due_date?->format('Y-m-d'),
                'total_ttc'   => (float) $inv->total_ttc,
                'paid_amount' => (float) $inv->paid_amount,
                'balance'     => round((float) $inv->total_ttc - (float) $inv->paid_amount, 2),
                'status'      => $inv->status,
                'is_overdue'  => $inv->due_date && now()->gt($inv->due_date) && !in_array($inv->status, ['paid', 'cancelled']),
            ]);

        // ── Ventes à crédit non entièrement encaissées ────────────────────────
        // Balance = montant crédit initial − encaissements reçus (paid_at IS NOT NULL)
        $allCreditData = Sale::where('store_id', $storeId)
            ->where('client_id', $client->id)
            ->where('status', 'completed')
            ->whereHas('payments', fn($q) => $q->where('payment_method', 'credit'))
            ->with('payments')
            ->get()
            ->map(function ($s) {
                $creditAmount = round((float) $s->payments->where('payment_method', 'credit')->sum('amount'), 2);
                $encaissed    = round((float) $s->payments->filter(fn($p) => !is_null($p->paid_at))->sum('amount'), 2);
                $balance      = round($creditAmount - $encaissed, 2);
                return compact('s', 'creditAmount', 'encaissed', 'balance');
            });

        // Synchroniser credit_balance avec le vrai solde calculé (corrige les dérives dues aux annulations, etc.)
        $realCreditBalance = round($allCreditData->sum('balance'), 2);
        if (abs((float) $client->credit_balance - $realCreditBalance) > 0.01) {
            $client->update(['credit_balance' => $realCreditBalance]);
            $client->credit_balance = $realCreditBalance;
        }

        $creditSales = $allCreditData
            ->filter(fn($item) => $item['balance'] > 0.01)
            ->map(fn($item) => [
                'id'          => $item['s']->id,
                'type'        => 'sale',
                'reference'   => $item['s']->reference,
                'label'       => $item['s']->reference,
                'date'        => $item['s']->created_at?->format('Y-m-d'),
                'due_date'    => null,
                'total_ttc'   => (float) $item['s']->total_ttc,
                'paid_amount' => $item['encaissed'],
                'balance'     => $item['balance'],
                'status'      => 'credit',
                'is_overdue'  => false,
            ])
            ->values();

        $items    = collect($invoices)->concat($creditSales)->sortBy('date')->values();
        $totalDue = round($items->sum('balance'), 2);

        // ── Historique des encaissements ──────────────────────────────────────
        $saleHistory = SalePayment::whereHas('sale', fn($q) =>
                $q->where('store_id', $storeId)->where('client_id', $client->id))
            ->whereNotNull('paid_at')
            ->with('recordedBy:id,name', 'sale:id,reference')
            ->orderByDesc('paid_at')
            ->get()
            ->map(fn($p) => [
                'id'        => $p->id,
                'type'      => 'sale',
                'reference' => $p->sale?->reference,
                'amount'    => (float) $p->amount,
                'method'    => $p->payment_method,
                'paid_at'   => $p->paid_at?->toIso8601String(),
                'notes'     => $p->notes,
                'recorder'  => $p->recordedBy ? ['id' => $p->recordedBy->id, 'name' => $p->recordedBy->name] : null,
            ]);

        $invoiceHistory = InvoicePayment::whereHas('invoice', fn($q) =>
                $q->where('store_id', $storeId)->where('client_id', $client->id))
            ->with('recordedBy:id,name', 'invoice:id,reference')
            ->orderByDesc('paid_at')
            ->get()
            ->map(fn($p) => [
                'id'        => $p->id,
                'type'      => 'invoice',
                'reference' => $p->invoice?->reference,
                'amount'    => (float) $p->amount,
                'method'    => $p->method,
                'paid_at'   => $p->paid_at?->toIso8601String(),
                'notes'     => $p->notes,
                'recorder'  => $p->recordedBy ? ['id' => $p->recordedBy->id, 'name' => $p->recordedBy->name] : null,
            ]);

        $history = collect($saleHistory)->concat($invoiceHistory)->sortByDesc('paid_at')->values();

        return response()->json([
            'client' => [
                'id'              => $client->id,
                'name'            => $client->name,
                'phone'           => $client->phone,
                'credit_balance'  => (float) $client->credit_balance,
                'account_balance' => (float) $client->account_balance,
            ],
            'items'     => $items,
            'total_due' => $totalDue,
            'history'   => $history,
        ]);
    }

    /**
     * GET /encours/history
     * Historique global de tous les encaissements du magasin (recherche, filtre date).
     */
    public function globalHistory(Request $request)
    {
        $storeId = $request->user()->store_id;
        $search  = $request->search;
        $from    = $request->from;
        $to      = $request->to;

        $salePayments = SalePayment::whereHas('sale', fn($q) => $q->where('store_id', $storeId))
            ->whereNotNull('paid_at')
            ->with('recordedBy:id,name', 'sale:id,reference,client_id', 'sale.client:id,name')
            ->when($from, fn($q) => $q->where('paid_at', '>=', $from))
            ->when($to,   fn($q) => $q->where('paid_at', '<=', $to . ' 23:59:59'))
            ->orderByDesc('paid_at')
            ->get()
            ->map(fn($p) => [
                'id'          => $p->id,
                'type'        => 'sale',
                'reference'   => $p->sale?->reference,
                'client_name' => $p->sale?->client?->name,
                'client_id'   => $p->sale?->client_id,
                'amount'      => (float) $p->amount,
                'method'      => $p->payment_method,
                'paid_at'     => $p->paid_at?->toIso8601String(),
                'notes'       => $p->notes,
                'recorder'    => $p->recordedBy ? ['id' => $p->recordedBy->id, 'name' => $p->recordedBy->name] : null,
            ]);

        $invoicePayments = InvoicePayment::whereHas('invoice', fn($q) => $q->where('store_id', $storeId))
            ->with('recordedBy:id,name', 'invoice:id,reference,client_id', 'invoice.client:id,name')
            ->when($from, fn($q) => $q->where('paid_at', '>=', $from))
            ->when($to,   fn($q) => $q->where('paid_at', '<=', $to . ' 23:59:59'))
            ->orderByDesc('paid_at')
            ->get()
            ->map(fn($p) => [
                'id'          => $p->id,
                'type'        => 'invoice',
                'reference'   => $p->invoice?->reference,
                'client_name' => $p->invoice?->client?->name,
                'client_id'   => $p->invoice?->client_id,
                'amount'      => (float) $p->amount,
                'method'      => $p->method,
                'paid_at'     => $p->paid_at?->toIso8601String(),
                'notes'       => $p->notes,
                'recorder'    => $p->recordedBy ? ['id' => $p->recordedBy->id, 'name' => $p->recordedBy->name] : null,
            ]);

        $all = collect($salePayments)->concat($invoicePayments)->sortByDesc('paid_at')->values();

        if ($search) {
            $s   = mb_strtolower($search);
            $all = $all->filter(fn($item) =>
                str_contains(mb_strtolower($item['client_name'] ?? ''), $s) ||
                str_contains(mb_strtolower($item['reference']   ?? ''), $s) ||
                str_contains(mb_strtolower($item['recorder']['name'] ?? ''), $s) ||
                str_contains(mb_strtolower($item['notes']       ?? ''), $s)
            )->values();
        }

        return response()->json([
            'data'  => $all,
            'total' => round($all->sum('amount'), 2),
            'count' => $all->count(),
        ]);
    }

    /**
     * POST /clients/{client}/payer-encours
     * Enregistre le règlement des créances (factures, ventes crédit, ou avance).
     */
    public function pay(Request $request, Client $client)
    {
        $data = $request->validate([
            'method'            => 'required|in:cash,mobile_money,bank_transfer,check,other,card,wave,orange_money,free_money',
            'reference'         => 'nullable|string|max:100',
            'note'              => 'nullable|string|max:300',
            'payments'          => 'nullable|array',
            'payments.*.type'   => 'required_with:payments|in:invoice,sale',
            'payments.*.id'     => 'required_with:payments|integer',
            'payments.*.amount' => 'required_with:payments|numeric|min:0.01',
            'advance'           => 'nullable|numeric|min:0.01',
        ]);

        if (empty($data['payments']) && empty($data['advance'])) {
            return response()->json(['message' => 'Aucun paiement à enregistrer.'], 422);
        }

        $storeId = $request->user()->store_id;
        $userId  = $request->user()->id;

        return DB::transaction(function () use ($data, $client, $storeId, $userId) {
            $results   = [];
            $totalPaid = 0;

            // ── Règlements sur documents ──────────────────────────────────────
            foreach ($data['payments'] ?? [] as $pmt) {
                if ($pmt['type'] === 'invoice') {
                    $invoice = Invoice::where('store_id', $storeId)
                        ->where('client_id', $client->id)
                        ->findOrFail((int) $pmt['id']);

                    $balance = round((float) $invoice->total_ttc - (float) $invoice->paid_amount, 2);
                    $amount  = min(round((float) $pmt['amount'], 2), $balance);
                    if ($amount <= 0) continue;

                    InvoicePayment::create([
                        'invoice_id'  => $invoice->id,
                        'amount'      => $amount,
                        'method'      => $data['method'],
                        'reference'   => $data['reference'] ?? null,
                        'paid_at'     => now(),
                        'notes'       => $data['note'] ?? null,
                        'recorded_by' => $userId,
                    ]);

                    $invoice->refreshPaidAmount();
                    $totalPaid += $amount;
                    $results[]  = ['type' => 'invoice', 'id' => $invoice->id, 'reference' => $invoice->reference, 'amount' => $amount];

                } elseif ($pmt['type'] === 'sale') {
                    $sale = Sale::where('store_id', $storeId)
                        ->where('client_id', $client->id)
                        ->findOrFail((int) $pmt['id']);

                    // Balance réelle = crédit initial − encaissements déjà reçus (paid_at NOT NULL)
                    $sale->load('payments');
                    $creditAmount  = round((float) $sale->payments->where('payment_method', 'credit')->sum('amount'), 2);
                    $prevEncaissed = round((float) $sale->payments->filter(fn($p) => !is_null($p->paid_at))->sum('amount'), 2);
                    $balance       = round($creditAmount - $prevEncaissed, 2);

                    $amount = min(round((float) $pmt['amount'], 2), $balance);
                    if ($amount <= 0) continue;

                    SalePayment::create([
                        'sale_id'        => $sale->id,
                        'payment_method' => $data['method'],
                        'amount'         => $amount,
                        'reference'      => $data['reference'] ?? null,
                        'notes'          => $data['note'] ?? null,
                        'paid_at'        => now(),
                        'recorded_by'    => $userId,
                        'is_confirmed'   => true,
                    ]);

                    // Réduction du credit_balance client
                    $newCredit = max(0, (float) $client->fresh()->credit_balance - $amount);
                    $client->update(['credit_balance' => $newCredit]);

                    $totalPaid += $amount;
                    $results[]  = ['type' => 'sale', 'id' => $sale->id, 'reference' => $sale->reference, 'amount' => $amount];
                }
            }

            // ── Avance sur compte ─────────────────────────────────────────────
            if (!empty($data['advance']) && $data['advance'] > 0) {
                $client->refresh();
                $before = (float) $client->account_balance;
                $after  = $before + (float) $data['advance'];

                $client->update(['account_balance' => $after]);

                ClientAccountTransaction::create([
                    'client_id'      => $client->id,
                    'created_by'     => $userId,
                    'type'           => 'deposit',
                    'amount'         => (float) $data['advance'],
                    'balance_before' => $before,
                    'balance_after'  => $after,
                    'note'           => 'Avance sur compte — ' . ($data['note'] ?? strtoupper($data['method'])),
                ]);

                $results[] = ['type' => 'advance', 'amount' => (float) $data['advance']];
            }

            AuditService::log('payer_encours', 'clients', $client->id);

            $client->refresh();

            return response()->json([
                'success'         => true,
                'results'         => $results,
                'total_paid'      => $totalPaid,
                'credit_balance'  => (float) $client->credit_balance,
                'account_balance' => (float) $client->account_balance,
            ]);
        });
    }
}
