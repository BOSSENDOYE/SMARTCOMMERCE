<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientAccountTransaction;
use App\Models\LoyaltyTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    public function stats(Request $request)
    {
        $storeId = $request->user()->store_id;
        $base = Client::where('store_id', $storeId);

        return response()->json([
            'total'           => (clone $base)->count(),
            'active'          => (clone $base)->where('is_active', true)->count(),
            'with_credit'     => (clone $base)->where('credit_balance', '>', 0)->count(),
            'total_credit'    => (clone $base)->sum('credit_balance'),
            'total_loyalty'   => (clone $base)->sum('loyalty_points'),
            'total_avoir'     => (clone $base)->where('account_balance', '>', 0)->sum('account_balance'),
            'total_dette'     => (clone $base)->where('account_balance', '<', 0)->selectRaw('ABS(SUM(account_balance)) as v')->value('v') ?? 0,
        ]);
    }

    public function index(Request $request)
    {
        return response()->json(
            Client::where('store_id', $request->user()->store_id)
                ->with('category')
                ->when($request->search, fn($q) => $q->where(fn($q2) =>
                    $q2->where('name', 'ilike', "%{$request->search}%")
                       ->orWhere('phone', 'ilike', "%{$request->search}%")
                       ->orWhere('email', 'ilike', "%{$request->search}%")
                ))
                ->when($request->type, fn($q) => $q->where('type', $request->type))
                ->when($request->client_category_id, fn($q) => $q->where('client_category_id', $request->client_category_id))
                ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
                ->when($request->has_credit, fn($q) => $q->where('credit_balance', '>', 0))
                ->withCount('sales')
                ->orderBy('name')
                ->paginate($request->per_page ?? 30)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'               => 'required|string|max:100',
            'phone'              => 'nullable|string|max:30',
            'email'              => 'nullable|email',
            'address'            => 'nullable|string',
            'type'               => 'nullable|in:individual,company',
            'client_category_id' => 'nullable|exists:client_categories,id',
            'ninea'              => 'nullable|string|max:30',
            'notes'              => 'nullable|string',
            'credit_limit'       => 'nullable|numeric|min:0',
        ]);

        $client = Client::create(array_merge($data, [
            'store_id'  => $request->user()->store_id,
            'is_active' => true,
        ]));

        return response()->json($client->load('category'), 201);
    }

    public function show(Client $client)
    {
        return response()->json($client->loadCount('sales'));
    }

    public function update(Request $request, Client $client)
    {
        $data = $request->validate([
            'name'               => 'sometimes|string|max:100',
            'phone'              => 'nullable|string|max:30',
            'email'              => 'nullable|email',
            'address'            => 'nullable|string',
            'type'               => 'nullable|in:individual,company',
            'client_category_id' => 'nullable|exists:client_categories,id',
            'ninea'              => 'nullable|string|max:30',
            'notes'              => 'nullable|string',
            'credit_limit'       => 'nullable|numeric|min:0',
            'is_active'          => 'sometimes|boolean',
        ]);

        $client->update($data);
        return response()->json($client->load('category'));
    }

    public function destroy(Client $client)
    {
        if ($client->credit_balance > 0) {
            return response()->json(['message' => 'Ce client a un solde crédit en cours. Soldez le compte avant suppression.'], 422);
        }
        $client->delete();
        return response()->json(null, 204);
    }

    public function sales(Request $request, Client $client)
    {
        return response()->json(
            $client->sales()
                ->with(['payments'])
                ->orderByDesc('created_at')
                ->paginate($request->per_page ?? 15)
        );
    }

    public function loyaltyTransactions(Request $request, Client $client)
    {
        return response()->json(
            $client->loyaltyTransactions()
                ->orderByDesc('created_at')
                ->paginate($request->per_page ?? 20)
        );
    }

    // ── Account (Compte client) ────────────────────────────────────────────────

    public function accountTransactions(Request $request, Client $client)
    {
        return response()->json(
            $client->accountTransactions()
                ->with(['sale:id,reference', 'creator:id,name'])
                ->orderByDesc('created_at')
                ->paginate($request->per_page ?? 20)
        );
    }

    public function deposit(Request $request, Client $client)
    {
        $data = $request->validate([
            'amount' => 'required|numeric|min:1',
            'note'   => 'nullable|string|max:200',
        ]);

        return DB::transaction(function () use ($client, $data, $request) {
            $before = (float) $client->account_balance;
            $after  = $before + $data['amount'];

            $client->update(['account_balance' => $after]);

            $tx = ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'created_by'     => $request->user()->id,
                'type'           => 'deposit',
                'amount'         => $data['amount'],
                'balance_before' => $before,
                'balance_after'  => $after,
                'note'           => $data['note'] ?? 'Dépôt manuel',
            ]);

            return response()->json([
                'account_balance' => $client->fresh()->account_balance,
                'transaction'     => $tx,
            ]);
        });
    }

    public function withdraw(Request $request, Client $client)
    {
        $data = $request->validate([
            'amount' => 'required|numeric|min:1',
            'note'   => 'nullable|string|max:200',
        ]);

        return DB::transaction(function () use ($client, $data, $request) {
            $before = (float) $client->account_balance;
            $after  = $before - $data['amount'];

            // Allow negative (becomes debt)
            $client->update(['account_balance' => $after]);

            $tx = ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'created_by'     => $request->user()->id,
                'type'           => 'withdrawal',
                'amount'         => $data['amount'],
                'balance_before' => $before,
                'balance_after'  => $after,
                'note'           => $data['note'] ?? 'Retrait manuel',
            ]);

            return response()->json([
                'account_balance' => $client->fresh()->account_balance,
                'transaction'     => $tx,
            ]);
        });
    }

    // ── Payer le crédit dû via le solde du compte ─────────────────────────────

    public function payCreditWithAccount(Request $request, Client $client)
    {
        $data = $request->validate([
            'amount' => 'required|numeric|min:1',
            'note'   => 'nullable|string|max:200',
        ]);

        $amount = (float) $data['amount'];

        if ($amount > $client->account_balance) {
            return response()->json(['message' => 'Solde compte insuffisant.'], 422);
        }
        if ($amount > $client->credit_balance) {
            return response()->json(['message' => 'Montant supérieur au crédit dû.'], 422);
        }

        return DB::transaction(function () use ($client, $amount, $data, $request) {
            $accBefore    = (float) $client->account_balance;
            $creditBefore = (float) $client->credit_balance;

            $accAfter    = $accBefore    - $amount;
            $creditAfter = $creditBefore - $amount;

            $client->update([
                'account_balance' => $accAfter,
                'credit_balance'  => $creditAfter,
            ]);

            // Trace dans le journal du compte
            ClientAccountTransaction::create([
                'client_id'      => $client->id,
                'created_by'     => $request->user()->id,
                'type'           => 'credit_payment',
                'amount'         => $amount,
                'balance_before' => $accBefore,
                'balance_after'  => $accAfter,
                'note'           => $data['note'] ?? 'Remboursement crédit via compte',
            ]);

            return response()->json([
                'account_balance' => $client->fresh()->account_balance,
                'credit_balance'  => $client->fresh()->credit_balance,
            ]);
        });
    }

    // ── Legacy credit/debt management (kept for backward compat) ──────────────

    public function adjustCredit(Request $request, Client $client)
    {
        $data = $request->validate([
            'amount'  => 'required|numeric',
            'type'    => 'required|in:add,deduct',
            'reason'  => 'required|string|max:200',
        ]);

        $delta = $data['type'] === 'add' ? abs($data['amount']) : -abs($data['amount']);
        $newBalance = $client->credit_balance + $delta;

        if ($newBalance < 0) {
            return response()->json(['message' => 'Solde insuffisant pour ce débit.'], 422);
        }

        $client->update(['credit_balance' => $newBalance]);

        return response()->json([
            'credit_balance' => $client->fresh()->credit_balance,
            'delta'          => $delta,
        ]);
    }

    public function adjustLoyalty(Request $request, Client $client)
    {
        $data = $request->validate([
            'points' => 'required|numeric',
            'type'   => 'required|in:add,redeem',
            'notes'  => 'nullable|string|max:200',
        ]);

        $delta = $data['type'] === 'add' ? abs($data['points']) : -abs($data['points']);
        $newBalance = $client->loyalty_points + $delta;

        if ($newBalance < 0) {
            return response()->json(['message' => 'Points insuffisants.'], 422);
        }

        $client->update(['loyalty_points' => $newBalance]);

        LoyaltyTransaction::create([
            'client_id'     => $client->id,
            'type'          => $data['type'] === 'add' ? 'adjust' : 'redeem',
            'points'        => abs($delta),
            'balance_after' => $newBalance,
            'notes'         => $data['notes'] ?? null,
        ]);

        return response()->json([
            'loyalty_points' => $client->fresh()->loyalty_points,
            'delta'          => $delta,
        ]);
    }
}
