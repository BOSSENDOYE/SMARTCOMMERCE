<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupplierController extends Controller
{
    /** IDs de tous les magasins de la même organisation que l'utilisateur courant */
    private function orgStoreIds(Request $request)
    {
        return Store::where('organization_id', $request->user()->organization_id)->pluck('id');
    }

    private function orgScope(Request $request)
    {
        $orgStoreIds = $this->orgStoreIds($request);
        return fn($q) => $q->whereNull('store_id')->orWhereIn('store_id', $orgStoreIds);
    }

    public function stats(Request $request)
    {
        $orgStoreIds = $this->orgStoreIds($request);
        $base = Supplier::where(fn($q) => $q->whereNull('store_id')->orWhereIn('store_id', $orgStoreIds));

        return response()->json([
            'total'             => (clone $base)->count(),
            'active'            => (clone $base)->where('is_active', true)->count(),
            'total_balance_due' => (clone $base)->sum('balance_due'),
            'avg_delivery_days' => round((clone $base)->avg('delivery_days_avg') ?? 0),
        ]);
    }

    public function index(Request $request)
    {
        return response()->json(
            Supplier::where($this->orgScope($request))
                ->withCount(['purchaseOrders', 'invoices'])
                ->when($request->search, fn($q) => $q->where('company_name', 'ilike', "%{$request->search}%")
                    ->orWhere('contact_name', 'ilike', "%{$request->search}%"))
                ->when($request->filter === 'active', fn($q) => $q->where('is_active', true))
                ->when($request->filter === 'inactive', fn($q) => $q->where('is_active', false))
                ->orderBy('company_name')
                ->paginate($request->per_page ?? 30)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'company_name'      => 'required|string|max:200',
            'ninea'             => 'nullable|string|max:30',
            'rc'                => 'nullable|string|max:30',
            'address'           => 'nullable|string',
            'phone'             => 'nullable|string|max:30',
            'email'             => 'nullable|email',
            'contact_name'      => 'nullable|string|max:100',
            'payment_terms'     => 'nullable|in:immediate,30_days,45_days,60_days,90_days',
            'delivery_days_avg' => 'nullable|integer|min:0',
            'notes'             => 'nullable|string',
        ]);

        $supplier = Supplier::create(array_merge($data, ['store_id' => $request->user()->store_id]));
        return response()->json($supplier, 201);
    }

    public function show(Supplier $supplier)
    {
        return response()->json(
            $supplier->loadCount(['purchaseOrders', 'invoices'])
        );
    }

    public function update(Request $request, Supplier $supplier)
    {
        $data = $request->validate([
            'company_name'      => 'sometimes|string|max:200',
            'ninea'             => 'nullable|string|max:30',
            'rc'                => 'nullable|string|max:30',
            'address'           => 'nullable|string',
            'phone'             => 'nullable|string|max:30',
            'email'             => 'nullable|email',
            'contact_name'      => 'nullable|string|max:100',
            'payment_terms'     => 'nullable|in:immediate,30_days,45_days,60_days,90_days',
            'delivery_days_avg' => 'nullable|integer|min:0',
            'notes'             => 'nullable|string',
            'is_active'         => 'sometimes|boolean',
        ]);
        $supplier->update($data);
        return response()->json($supplier);
    }

    public function destroy(Supplier $supplier)
    {
        if ($supplier->purchaseOrders()->exists()) {
            return response()->json(['message' => 'Impossible de supprimer un fournisseur ayant des commandes.'], 422);
        }
        $supplier->delete();
        return response()->json(null, 204);
    }

    // ---------- Purchase Orders ----------

    public function getOrders(Request $request, Supplier $supplier)
    {
        return response()->json(
            PurchaseOrder::where('supplier_id', $supplier->id)
                ->where('store_id', $request->user()->store_id)
                ->when($request->status, fn($q) => $q->where('status', $request->status))
                ->withCount('items')
                ->latest()
                ->paginate($request->per_page ?? 15)
        );
    }

    // ---------- Invoices ----------

    public function getInvoices(Request $request, Supplier $supplier)
    {
        return response()->json(
            SupplierInvoice::where('supplier_id', $supplier->id)
                ->where('store_id', $request->user()->store_id)
                ->when($request->payment_status, fn($q) => $q->where('payment_status', $request->payment_status))
                ->latest('invoice_date')
                ->paginate($request->per_page ?? 15)
        );
    }

    public function addInvoice(Request $request, Supplier $supplier)
    {
        $data = $request->validate([
            'reference'    => 'required|string|max:100',
            'amount_ht'    => 'required|numeric|min:0',
            'vat_amount'   => 'nullable|numeric|min:0',
            'amount_ttc'   => 'required|numeric|min:0',
            'invoice_date' => 'required|date',
            'due_date'     => 'nullable|date|after_or_equal:invoice_date',
        ]);

        $invoice = SupplierInvoice::create(array_merge($data, [
            'supplier_id'    => $supplier->id,
            'store_id'       => $request->user()->store_id,
            'vat_amount'     => $data['vat_amount'] ?? ($data['amount_ttc'] - $data['amount_ht']),
            'amount_paid'    => 0,
            'payment_status' => 'unpaid',
        ]));

        // Update supplier balance_due
        $supplier->increment('balance_due', $invoice->amount_ttc);

        return response()->json($invoice, 201);
    }

    public function payInvoice(Request $request, Supplier $supplier, SupplierInvoice $invoice)
    {
        if ($invoice->supplier_id !== $supplier->id) {
            return response()->json(['message' => 'Facture introuvable.'], 404);
        }
        if ($invoice->payment_status === 'paid') {
            return response()->json(['message' => 'Facture déjà réglée.'], 422);
        }

        $data = $request->validate([
            'amount'         => 'required|numeric|min:0.01',
            'payment_method' => 'required|in:cash,bank_transfer,check,wave,orange_money',
            'reference'      => 'nullable|string|max:100',
            'notes'          => 'nullable|string',
        ]);

        DB::transaction(function () use ($data, $invoice, $supplier, $request) {
            SupplierPayment::create([
                'invoice_id'     => $invoice->id,
                'user_id'        => $request->user()->id,
                'amount'         => $data['amount'],
                'payment_method' => $data['payment_method'],
                'reference'      => $data['reference'] ?? null,
                'notes'          => $data['notes'] ?? null,
                'paid_at'        => now(),
            ]);

            $newPaid = (float) $invoice->amount_paid + (float) $data['amount'];
            $status  = $newPaid >= (float) $invoice->amount_ttc ? 'paid' : 'partial';

            $invoice->update([
                'amount_paid'    => $newPaid,
                'payment_status' => $status,
            ]);

            // Decrement supplier balance_due (capped at 0)
            $newBalance = max(0, (float) $supplier->balance_due - (float) $data['amount']);
            $supplier->update(['balance_due' => $newBalance]);
        });

        return response()->json($invoice->fresh());
    }

    // ---------- Products ----------

    public function getProducts(Supplier $supplier)
    {
        return response()->json(
            $supplier->products()
                ->with('unit:id,abbreviation')
                ->withPivot(['supplier_ref', 'negotiated_price_ht', 'is_preferred'])
                ->get()
        );
    }

    public function linkProduct(Request $request, Supplier $supplier)
    {
        $data = $request->validate([
            'product_id'          => 'required|exists:products,id',
            'supplier_ref'        => 'nullable|string|max:50',
            'negotiated_price_ht' => 'nullable|numeric|min:0',
            'is_preferred'        => 'nullable|boolean',
        ]);

        $supplier->products()->syncWithoutDetaching([
            $data['product_id'] => [
                'supplier_ref'        => $data['supplier_ref'] ?? null,
                'negotiated_price_ht' => $data['negotiated_price_ht'] ?? null,
                'is_preferred'        => $data['is_preferred'] ?? false,
            ],
        ]);

        return response()->json(
            $supplier->products()
                ->withPivot(['supplier_ref', 'negotiated_price_ht', 'is_preferred'])
                ->get()
        );
    }

    public function unlinkProduct(Supplier $supplier, Product $product)
    {
        $supplier->products()->detach($product->id);
        return response()->json(['message' => 'Produit retiré du fournisseur.']);
    }
}
