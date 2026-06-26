<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoicePayment;
use App\Models\InvoiceReminder;
use App\Models\Quote;
use App\Models\QuoteItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class InvoiceController extends Controller
{
    // ═══════════════════════════════════════════════════════════════════════════
    // FACTURES
    // ═══════════════════════════════════════════════════════════════════════════

    public function index(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id ?? null);

        $q = Invoice::with(['client:id,name,phone,email', 'createdBy:id,name'])
            ->where('store_id', $storeId)
            ->orderByDesc('issue_date')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }
        if ($request->filled('client_id')) {
            $q->where('client_id', $request->client_id);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $q->where(function ($qq) use ($search) {
                $qq->where('reference', 'ilike', "%{$search}%")
                   ->orWhere('object', 'ilike', "%{$search}%")
                   ->orWhereHas('client', fn($c) => $c->where('name', 'ilike', "%{$search}%"));
            });
        }
        if ($request->filled('date_from')) {
            $q->where('issue_date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $q->where('issue_date', '<=', $request->date_to);
        }
        if ($request->boolean('overdue')) {
            $q->where('due_date', '<', now())
              ->whereNotIn('status', ['paid', 'cancelled']);
        }

        $invoices = $q->paginate($request->integer('per_page', 20));

        // Ajouter balance calculée
        $invoices->getCollection()->transform(function ($inv) {
            $inv->balance = (float) $inv->total_ttc - (float) $inv->paid_amount;
            $inv->is_overdue = $inv->due_date
                && now()->gt($inv->due_date)
                && !in_array($inv->status, ['paid', 'cancelled']);
            return $inv;
        });

        return response()->json($invoices);
    }

    public function stats(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id ?? null);
        $year    = $request->integer('year', now()->year);

        $base = Invoice::where('store_id', $storeId)
            ->whereNotIn('status', ['cancelled']);

        return response()->json([
            'total_count'    => $base->clone()->count(),
            'draft_count'    => $base->clone()->where('status', 'draft')->count(),
            'sent_count'     => $base->clone()->whereIn('status', ['sent', 'partial'])->count(),
            'paid_count'     => $base->clone()->where('status', 'paid')->count(),
            'overdue_count'  => $base->clone()
                ->where('due_date', '<', now())
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->count(),
            'total_ttc'      => $base->clone()->sum('total_ttc'),
            'total_paid'     => $base->clone()->sum('paid_amount'),
            'total_balance'  => $base->clone()->selectRaw('SUM(total_ttc - paid_amount) as b')->value('b') ?? 0,
            'monthly_revenue'=> Invoice::where('store_id', $storeId)
                ->where('status', 'paid')
                ->whereYear('paid_at', $year)
                ->selectRaw('MONTH(paid_at) as month, SUM(total_ttc) as total')
                ->groupBy('month')
                ->pluck('total', 'month'),
        ]);
    }

    public function store(Request $request)
    {
        // Fallback: utiliser le magasin de l'utilisateur si non fourni
        if (!$request->filled('store_id') && Auth::user()?->store_id) {
            $request->merge(['store_id' => Auth::user()->store_id]);
        }

        $data = $request->validate([
            'store_id'        => 'required|exists:stores,id',
            'client_id'       => 'nullable|exists:clients,id',
            'object'          => 'nullable|string|max:255',
            'issue_date'      => 'required|date',
            'due_date'        => 'nullable|date|after_or_equal:issue_date',
            'notes'           => 'nullable|string',
            'terms'           => 'nullable|string',
            'items'           => 'required|array|min:1',
            'items.*.description'     => 'required|string|max:500',
            'items.*.product_id'      => 'nullable|exists:products,id',
            'items.*.quantity'        => 'required|numeric|min:0.001',
            'items.*.unit'            => 'nullable|string|max:20',
            'items.*.unit_price'      => 'required|numeric|min:0',
            'items.*.discount_percent'=> 'nullable|numeric|min:0|max:100',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        return DB::transaction(function () use ($data, $request) {
            $invoice = Invoice::create([
                'store_id'   => $data['store_id'],
                'client_id'  => $data['client_id'] ?? null,
                'created_by' => Auth::id(),
                'reference'  => Invoice::generateReference($data['store_id']),
                'object'     => $data['object'] ?? null,
                'status'     => 'draft',
                'issue_date' => $data['issue_date'],
                'due_date'   => $data['due_date'] ?? null,
                'notes'      => $data['notes'] ?? null,
                'terms'      => $data['terms'] ?? null,
                'subtotal_ht'=> 0, 'vat_amount' => 0,
                'discount_amount' => 0, 'total_ttc' => 0, 'paid_amount' => 0,
            ]);

            $this->syncItems($invoice, $data['items']);

            return response()->json($invoice->load(['client', 'items', 'createdBy']), 201);
        });
    }

    public function show(Invoice $invoice)
    {
        $invoice->load(['client', 'items.product', 'payments.recordedBy', 'reminders.sentBy', 'createdBy', 'store']);
        $invoice->balance   = (float) $invoice->total_ttc - (float) $invoice->paid_amount;
        $invoice->is_overdue = $invoice->due_date && now()->gt($invoice->due_date) && !in_array($invoice->status, ['paid', 'cancelled']);
        return response()->json($invoice);
    }

    public function update(Request $request, Invoice $invoice)
    {
        if (in_array($invoice->status, ['paid', 'cancelled'])) {
            return response()->json(['message' => 'Impossible de modifier une facture payée ou annulée.'], 422);
        }

        $data = $request->validate([
            'client_id'  => 'nullable|exists:clients,id',
            'object'     => 'nullable|string|max:255',
            'issue_date' => 'sometimes|date',
            'due_date'   => 'nullable|date',
            'notes'      => 'nullable|string',
            'terms'      => 'nullable|string',
            'items'      => 'sometimes|array|min:1',
            'items.*.description'     => 'required_with:items|string|max:500',
            'items.*.product_id'      => 'nullable|exists:products,id',
            'items.*.quantity'        => 'required_with:items|numeric|min:0.001',
            'items.*.unit'            => 'nullable|string|max:20',
            'items.*.unit_price'      => 'required_with:items|numeric|min:0',
            'items.*.discount_percent'=> 'nullable|numeric|min:0|max:100',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        return DB::transaction(function () use ($data, $invoice) {
            $invoice->update(array_filter([
                'client_id'  => $data['client_id'] ?? $invoice->client_id,
                'object'     => $data['object'] ?? $invoice->object,
                'issue_date' => $data['issue_date'] ?? $invoice->issue_date,
                'due_date'   => array_key_exists('due_date', $data) ? $data['due_date'] : $invoice->due_date,
                'notes'      => $data['notes'] ?? $invoice->notes,
                'terms'      => $data['terms'] ?? $invoice->terms,
            ], fn($v) => $v !== null));

            if (isset($data['items'])) {
                $this->syncItems($invoice, $data['items']);
            }

            return response()->json($invoice->fresh()->load(['client', 'items', 'payments', 'createdBy']));
        });
    }

    public function destroy(Invoice $invoice)
    {
        if (in_array($invoice->status, ['paid'])) {
            return response()->json(['message' => 'Impossible de supprimer une facture payée.'], 422);
        }
        $invoice->delete();
        return response()->json(['message' => 'Facture supprimée.']);
    }

    /** Passer en statut "envoyée" */
    public function markSent(Invoice $invoice)
    {
        if ($invoice->status === 'draft') {
            $invoice->update(['status' => 'sent', 'sent_at' => now()]);
        }
        return response()->json($invoice);
    }

    /** Enregistrer un paiement */
    public function addPayment(Request $request, Invoice $invoice)
    {
        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'Facture annulée.'], 422);
        }

        $data = $request->validate([
            'amount'    => 'required|numeric|min:0.01',
            'method'    => 'required|in:cash,mobile_money,bank_transfer,check,other',
            'reference' => 'nullable|string|max:100',
            'paid_at'   => 'nullable|date',
            'notes'     => 'nullable|string',
        ]);

        return DB::transaction(function () use ($data, $invoice) {
            InvoicePayment::create([
                'invoice_id'  => $invoice->id,
                'amount'      => $data['amount'],
                'method'      => $data['method'],
                'reference'   => $data['reference'] ?? null,
                'paid_at'     => $data['paid_at'] ?? now(),
                'notes'       => $data['notes'] ?? null,
                'recorded_by' => Auth::id(),
            ]);

            $invoice->refreshPaidAmount();

            return response()->json($invoice->fresh()->load(['payments.recordedBy']));
        });
    }

    /** Enregistrer une relance */
    public function addReminder(Request $request, Invoice $invoice)
    {
        $data = $request->validate([
            'type'   => 'required|in:first,second,final',
            'method' => 'required|in:email,sms,phone,in_person,whatsapp',
            'notes'  => 'nullable|string',
            'sent_at'=> 'nullable|date',
        ]);

        $reminder = InvoiceReminder::create([
            'invoice_id' => $invoice->id,
            'type'       => $data['type'],
            'method'     => $data['method'],
            'notes'      => $data['notes'] ?? null,
            'sent_at'    => $data['sent_at'] ?? now(),
            'sent_by'    => Auth::id(),
        ]);

        return response()->json($reminder->load('sentBy'), 201);
    }

    /** Annuler une facture */
    public function cancel(Request $request, Invoice $invoice)
    {
        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'Impossible d\'annuler une facture payée.'], 422);
        }
        $invoice->update(['status' => 'cancelled']);
        return response()->json($invoice);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEVIS
    // ═══════════════════════════════════════════════════════════════════════════

    public function quotesIndex(Request $request)
    {
        $storeId = $request->query('store_id', Auth::user()->store_id ?? null);

        $q = Quote::with(['client:id,name,phone,email', 'createdBy:id,name'])
            ->where('store_id', $storeId)
            ->orderByDesc('issue_date')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $q->where(function ($qq) use ($search) {
                $qq->where('reference', 'ilike', "%{$search}%")
                   ->orWhere('object', 'ilike', "%{$search}%")
                   ->orWhereHas('client', fn($c) => $c->where('name', 'ilike', "%{$search}%"));
            });
        }

        $quotes = $q->paginate($request->integer('per_page', 20));

        $quotes->getCollection()->transform(function ($quote) {
            $quote->is_expired = $quote->valid_until
                && now()->gt($quote->valid_until)
                && !in_array($quote->status, ['accepted', 'invoiced', 'cancelled']);
            return $quote;
        });

        return response()->json($quotes);
    }

    public function quotesStore(Request $request)
    {
        if (!$request->filled('store_id') && Auth::user()?->store_id) {
            $request->merge(['store_id' => Auth::user()->store_id]);
        }

        $data = $request->validate([
            'store_id'    => 'required|exists:stores,id',
            'client_id'   => 'nullable|exists:clients,id',
            'object'      => 'nullable|string|max:255',
            'issue_date'  => 'required|date',
            'valid_until' => 'nullable|date|after_or_equal:issue_date',
            'notes'       => 'nullable|string',
            'terms'       => 'nullable|string',
            'items'       => 'required|array|min:1',
            'items.*.description'     => 'required|string|max:500',
            'items.*.product_id'      => 'nullable|exists:products,id',
            'items.*.quantity'        => 'required|numeric|min:0.001',
            'items.*.unit'            => 'nullable|string|max:20',
            'items.*.unit_price'      => 'required|numeric|min:0',
            'items.*.discount_percent'=> 'nullable|numeric|min:0|max:100',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        return DB::transaction(function () use ($data) {
            $quote = Quote::create([
                'store_id'    => $data['store_id'],
                'client_id'   => $data['client_id'] ?? null,
                'created_by'  => Auth::id(),
                'reference'   => Quote::generateReference($data['store_id']),
                'object'      => $data['object'] ?? null,
                'status'      => 'draft',
                'issue_date'  => $data['issue_date'],
                'valid_until' => $data['valid_until'] ?? null,
                'notes'       => $data['notes'] ?? null,
                'terms'       => $data['terms'] ?? null,
                'subtotal_ht' => 0, 'vat_amount' => 0,
                'discount_amount' => 0, 'total_ttc' => 0,
            ]);

            $this->syncQuoteItems($quote, $data['items']);

            return response()->json($quote->load(['client', 'items', 'createdBy']), 201);
        });
    }

    public function quotesShow(Quote $quote)
    {
        $quote->load(['client', 'items.product', 'createdBy', 'store', 'invoice']);
        $quote->is_expired = $quote->valid_until && now()->gt($quote->valid_until) && !in_array($quote->status, ['accepted', 'invoiced', 'cancelled']);
        return response()->json($quote);
    }

    public function quotesUpdate(Request $request, Quote $quote)
    {
        if (in_array($quote->status, ['invoiced', 'cancelled'])) {
            return response()->json(['message' => 'Impossible de modifier ce devis.'], 422);
        }

        $data = $request->validate([
            'client_id'   => 'nullable|exists:clients,id',
            'object'      => 'nullable|string|max:255',
            'issue_date'  => 'sometimes|date',
            'valid_until' => 'nullable|date',
            'notes'       => 'nullable|string',
            'terms'       => 'nullable|string',
            'items'       => 'sometimes|array|min:1',
            'items.*.description'     => 'required_with:items|string|max:500',
            'items.*.product_id'      => 'nullable|exists:products,id',
            'items.*.quantity'        => 'required_with:items|numeric|min:0.001',
            'items.*.unit'            => 'nullable|string|max:20',
            'items.*.unit_price'      => 'required_with:items|numeric|min:0',
            'items.*.discount_percent'=> 'nullable|numeric|min:0|max:100',
            'items.*.vat_rate'        => 'nullable|numeric|min:0|max:100',
        ]);

        return DB::transaction(function () use ($data, $quote) {
            $quote->update(array_filter([
                'client_id'   => $data['client_id'] ?? $quote->client_id,
                'object'      => $data['object'] ?? $quote->object,
                'issue_date'  => $data['issue_date'] ?? $quote->issue_date,
                'valid_until' => array_key_exists('valid_until', $data) ? $data['valid_until'] : $quote->valid_until,
                'notes'       => $data['notes'] ?? $quote->notes,
                'terms'       => $data['terms'] ?? $quote->terms,
            ], fn($v) => $v !== null));

            if (isset($data['items'])) {
                $this->syncQuoteItems($quote, $data['items']);
            }

            return response()->json($quote->fresh()->load(['client', 'items', 'createdBy']));
        });
    }

    public function quotesDestroy(Quote $quote)
    {
        if ($quote->status === 'invoiced') {
            return response()->json(['message' => 'Devis déjà facturé.'], 422);
        }
        $quote->delete();
        return response()->json(['message' => 'Devis supprimé.']);
    }

    /** Marquer devis comme envoyé */
    public function quoteMarkSent(Quote $quote)
    {
        if ($quote->status === 'draft') {
            $quote->update(['status' => 'sent', 'sent_at' => now()]);
        }
        return response()->json($quote);
    }

    /** Accepter un devis */
    public function quoteAccept(Quote $quote)
    {
        if (!in_array($quote->status, ['draft', 'sent'])) {
            return response()->json(['message' => 'Ce devis ne peut pas être accepté.'], 422);
        }
        $quote->update(['status' => 'accepted']);
        return response()->json($quote);
    }

    /** Convertir devis → facture */
    public function quoteConvert(Request $request, Quote $quote)
    {
        if ($quote->status === 'invoiced') {
            return response()->json(['message' => 'Devis déjà converti en facture.'], 422);
        }
        if ($quote->status === 'cancelled') {
            return response()->json(['message' => 'Devis annulé.'], 422);
        }

        $data = $request->validate([
            'due_date' => 'nullable|date',
        ]);

        return DB::transaction(function () use ($data, $quote) {
            // Créer la facture depuis le devis
            $invoice = Invoice::create([
                'store_id'   => $quote->store_id,
                'client_id'  => $quote->client_id,
                'created_by' => Auth::id(),
                'reference'  => Invoice::generateReference($quote->store_id),
                'object'     => $quote->object,
                'status'     => 'draft',
                'issue_date' => now()->toDateString(),
                'due_date'   => $data['due_date'] ?? null,
                'notes'      => $quote->notes,
                'terms'      => $quote->terms,
                'subtotal_ht'    => $quote->subtotal_ht,
                'vat_amount'     => $quote->vat_amount,
                'discount_amount'=> $quote->discount_amount,
                'total_ttc'      => $quote->total_ttc,
                'paid_amount'    => 0,
            ]);

            // Copier les lignes
            foreach ($quote->items as $qi) {
                InvoiceItem::create([
                    'invoice_id'       => $invoice->id,
                    'product_id'       => $qi->product_id,
                    'description'      => $qi->description,
                    'quantity'         => $qi->quantity,
                    'unit'             => $qi->unit,
                    'unit_price'       => $qi->unit_price,
                    'discount_percent' => $qi->discount_percent,
                    'vat_rate'         => $qi->vat_rate,
                    'total_ht'         => $qi->total_ht,
                    'total_ttc'        => $qi->total_ttc,
                    'sort_order'       => $qi->sort_order,
                ]);
            }

            // Marquer le devis comme facturé
            $quote->update(['status' => 'invoiced', 'invoice_id' => $invoice->id]);

            return response()->json([
                'invoice' => $invoice->load(['client', 'items']),
                'quote'   => $quote,
            ], 201);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Helpers privés
    // ═══════════════════════════════════════════════════════════════════════════

    private function syncItems(Invoice $invoice, array $itemsData): void
    {
        $invoice->items()->delete();

        $subtotalHt   = 0;
        $vatTotal     = 0;
        $discountTotal = 0;

        foreach ($itemsData as $i => $row) {
            $item = new InvoiceItem([
                'invoice_id'       => $invoice->id,
                'product_id'       => $row['product_id'] ?? null,
                'description'      => $row['description'],
                'quantity'         => $row['quantity'],
                'unit'             => $row['unit'] ?? 'unité',
                'unit_price'       => $row['unit_price'],
                'discount_percent' => $row['discount_percent'] ?? 0,
                'vat_rate'         => $row['vat_rate'] ?? 18,
                'sort_order'       => $i,
            ]);
            $item->recalculate();
            $item->save();

            $base    = (float) $row['quantity'] * (float) $row['unit_price'];
            $discount = $base * ((float) ($row['discount_percent'] ?? 0) / 100);
            $discountTotal += $discount;
            $subtotalHt   += $item->total_ht;
            $vatTotal     += $item->total_ttc - $item->total_ht;
        }

        $invoice->update([
            'subtotal_ht'     => round($subtotalHt, 2),
            'vat_amount'      => round($vatTotal, 2),
            'discount_amount' => round($discountTotal, 2),
            'total_ttc'       => round($subtotalHt + $vatTotal, 2),
        ]);
    }

    private function syncQuoteItems(Quote $quote, array $itemsData): void
    {
        $quote->items()->delete();

        $subtotalHt    = 0;
        $vatTotal      = 0;
        $discountTotal = 0;

        foreach ($itemsData as $i => $row) {
            $item = new QuoteItem([
                'quote_id'         => $quote->id,
                'product_id'       => $row['product_id'] ?? null,
                'description'      => $row['description'],
                'quantity'         => $row['quantity'],
                'unit'             => $row['unit'] ?? 'unité',
                'unit_price'       => $row['unit_price'],
                'discount_percent' => $row['discount_percent'] ?? 0,
                'vat_rate'         => $row['vat_rate'] ?? 18,
                'sort_order'       => $i,
            ]);
            $item->recalculate();
            $item->save();

            $base     = (float) $row['quantity'] * (float) $row['unit_price'];
            $discount = $base * ((float) ($row['discount_percent'] ?? 0) / 100);
            $discountTotal += $discount;
            $subtotalHt   += $item->total_ht;
            $vatTotal     += $item->total_ttc - $item->total_ht;
        }

        $quote->update([
            'subtotal_ht'     => round($subtotalHt, 2),
            'vat_amount'      => round($vatTotal, 2),
            'discount_amount' => round($discountTotal, 2),
            'total_ttc'       => round($subtotalHt + $vatTotal, 2),
        ]);
    }
}
