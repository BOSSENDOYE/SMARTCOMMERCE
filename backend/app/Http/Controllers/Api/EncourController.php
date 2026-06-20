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
     * Retourne toutes les créances non soldées du client pour ce magasin.
     */
    public function index(Request $request, Client $client)
    {
        $storeId = $request->user()->store_id;

        // Factures impayées (envoyées, partiellement payées, ou en retard)
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

        // Ventes à crédit non entièrement encaissées
        $creditSales = Sale::where('store_id', $storeId)
            ->where('client_id', $client->id)
            ->where('status', 'completed')
            ->whereHas('payments', fn($q) => $q->where('payment_method', 'credit'))
            ->get()
            ->filter(fn($s) => (float) $s->total_ttc - (float) $s->paid_amount > 0.01)
            ->map(fn($s) => [
                'id'          => $s->id,
                'type'        => 'sale',
                'reference'   => $s->reference,
                'label'       => $s->reference,
                'date'        => $s->created_at?->format('Y-m-d'),
                'due_date'    => null,
                'total_ttc'   => (float) $s->total_ttc,
                'paid_amount' => (float) $s->paid_amount,
                'balance'     => round((float) $s->total_ttc - (float) $s->paid_amount, 2),
                'status'      => 'credit',
                'is_overdue'  => false,
            ])
            ->values();

        $items    = collect($invoices)->concat($creditSales)->sortBy('date')->values();
        $totalDue = round($items->sum('balance'), 2);

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
        ]);
    }

    /**
     * POST /clients/{client}/payer-encours
     * Enregistre le règlement des créances (factures, ventes crédit, ou avance).
     */
    public function pay(Request $request, Client $client)
    {
        $data = $request->validate([
            'method'            => 'required|in:cash,mobile_money,bank_transfer,check,other',
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
            $results      = [];
            $totalPaid    = 0;

            // ── Règlements sur documents ──────────────────────────────────────────
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

                    $balance = round((float) $sale->total_ttc - (float) $sale->paid_amount, 2);
                    $amount  = min(round((float) $pmt['amount'], 2), $balance);
                    if ($amount <= 0) continue;

                    // Nouvel encaissement sur la vente
                    SalePayment::create([
                        'sale_id'        => $sale->id,
                        'payment_method' => $data['method'],
                        'amount'         => $amount,
                        'reference'      => $data['reference'] ?? null,
                        'is_confirmed'   => true,
                    ]);

                    // Mise à jour paid_amount (bypass Eloquent boot protection)
                    DB::table('sales')
                        ->where('id', $sale->id)
                        ->update(['paid_amount' => (float) $sale->paid_amount + $amount]);

                    // Réduction du credit_balance client
                    $newCredit = max(0, (float) $client->fresh()->credit_balance - $amount);
                    $client->update(['credit_balance' => $newCredit]);

                    $totalPaid += $amount;
                    $results[]  = ['type' => 'sale', 'id' => $sale->id, 'reference' => $sale->reference, 'amount' => $amount];
                }
            }

            // ── Avance sur compte ─────────────────────────────────────────────────
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
