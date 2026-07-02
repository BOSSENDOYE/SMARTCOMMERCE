<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Quote;
use App\Models\Sale;
use App\Models\Store;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PdfController extends Controller
{
    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function store(Request $request): Store
    {
        $storeId = $request->query('store_id', Auth::user()->store_id);
        return Store::findOrFail($storeId);
    }

    private function pdf(string $view, array $data, string $orientation = 'portrait')
    {
        $pdf = Pdf::loadView($view, $data)
            ->setPaper('a4', $orientation)
            ->setOption('defaultFont', 'DejaVu Sans')
            ->setOption('isHtml5ParserEnabled', true)
            ->setOption('isRemoteEnabled', false);

        return $pdf;
    }

    // ─── Facture ──────────────────────────────────────────────────────────────

    public function invoice(Request $request, Invoice $invoice)
    {
        $invoice->load(['client', 'items.product', 'payments.recordedBy', 'createdBy', 'store']);
        $invoice->balance = (float) $invoice->total_ttc - (float) $invoice->paid_amount;

        $store = $invoice->store ?? $this->store($request);
        $filename = 'Facture-' . $invoice->reference . '.pdf';

        return $this->pdf('pdf.invoice', compact('invoice', 'store'))
            ->download($filename);
    }

    // ─── Vente au comptoir ────────────────────────────────────────────────────

    public function sale(Request $request, Sale $sale)
    {
        $sale->load(['client', 'items.product', 'items.restaurantItem', 'payments', 'user', 'store']);

        $store    = $sale->store ?? $this->store($request);
        $filename = 'Recu-' . $sale->reference . '.pdf';

        return $this->pdf('pdf.sale', compact('sale', 'store'))
            ->download($filename);
    }

    // ─── Devis ────────────────────────────────────────────────────────────────

    public function quote(Request $request, Quote $quote)
    {
        $quote->load(['client', 'items.product', 'createdBy', 'store']);
        $quote->is_expired = $quote->valid_until
            && now()->gt($quote->valid_until)
            && !in_array($quote->status, ['accepted', 'invoiced', 'cancelled']);

        $store = $quote->store ?? $this->store($request);
        $filename = 'Devis-' . $quote->reference . '.pdf';

        return $this->pdf('pdf.quote', compact('quote', 'store'))
            ->download($filename);
    }

    // ─── Rapports ─────────────────────────────────────────────────────────────

    /** Ventes par produit */
    public function reportSalesByProduct(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from', now()->startOfMonth()->toDateString());
        $to    = $request->input('date_to', now()->toDateString());

        $rows = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->where('sales.store_id', $store->id)
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                'products.internal_code as code',
                'products.name',
                DB::raw('SUM(sale_items.qty) as total_qty'),
                DB::raw('SUM(sale_items.total_ttc) as total_ttc'),
                DB::raw('SUM(sale_items.margin_amount) as total_margin')
            )
            ->groupBy('products.id', 'products.internal_code', 'products.name')
            ->orderByDesc('total_ttc')
            ->limit(200)
            ->get()
            ->map(fn($r) => [
                'code'          => $r->code ?? '—',
                'name'          => $r->name,
                'total_qty'     => number_format($r->total_qty, 0, ',', ' '),
                'total_ttc'     => number_format($r->total_ttc, 0, ',', ' ') . ' FCFA',
                'total_margin'  => number_format($r->total_margin, 0, ',', ' ') . ' FCFA',
            ])->toArray();

        $totalTtc    = array_sum(array_map(fn($r) => (float) str_replace([' ', ' FCFA'], '', $r['total_ttc']), $rows));
        $totalMargin = array_sum(array_map(fn($r) => (float) str_replace([' ', ' FCFA'], '', $r['total_margin']), $rows));

        return $this->pdf('pdf.report', [
            'store'    => $store,
            'title'    => 'Ventes par Produit',
            'period'   => ['from' => $from, 'to' => $to],
            'kpis'     => [
                ['label' => 'Total TTC',   'value' => number_format($totalTtc, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Marge totale','value' => number_format($totalMargin, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Nb produits', 'value' => count($rows)],
            ],
            'columns'  => [
                ['key' => 'code',         'label' => 'Code',     'align' => 'left'],
                ['key' => 'name',         'label' => 'Produit',  'align' => 'left'],
                ['key' => 'total_qty',    'label' => 'Qté',      'align' => 'right'],
                ['key' => 'total_ttc',    'label' => 'CA TTC',   'align' => 'right'],
                ['key' => 'total_margin', 'label' => 'Marge',    'align' => 'right'],
            ],
            'rows'     => $rows,
            'totals'   => [
                'code' => '', 'name' => 'TOTAL', 'total_qty' => '',
                'total_ttc'    => number_format($totalTtc, 0, ',', ' ') . ' FCFA',
                'total_margin' => number_format($totalMargin, 0, ',', ' ') . ' FCFA',
            ],
        ], 'landscape')->download("rapport-ventes-produits-{$from}-{$to}.pdf");
    }

    /** Ventes par caissier */
    public function reportSalesByCashier(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from', now()->startOfMonth()->toDateString());
        $to    = $request->input('date_to', now()->toDateString());

        $rows = DB::table('sales')
            ->join('users', 'users.id', '=', 'sales.cashier_id')
            ->where('sales.store_id', $store->id)
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                'users.name',
                DB::raw('COUNT(*) as nb_sales'),
                DB::raw('SUM(sales.total_ttc) as total_ttc'),
                DB::raw('AVG(sales.total_ttc) as avg_basket')
            )
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('total_ttc')
            ->get()
            ->map(fn($r) => [
                'name'       => $r->name,
                'nb_sales'   => number_format($r->nb_sales, 0, ',', ' '),
                'total_ttc'  => number_format($r->total_ttc, 0, ',', ' ') . ' FCFA',
                'avg_basket' => number_format($r->avg_basket, 0, ',', ' ') . ' FCFA',
            ])->toArray();

        $totalTtc = DB::table('sales')
            ->where('store_id', $store->id)->where('status', 'completed')
            ->whereBetween(DB::raw("date(created_at)"), [$from, $to])
            ->sum('total_ttc');

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Ventes par Caissier',
            'period'  => ['from' => $from, 'to' => $to],
            'kpis'    => [
                ['label' => 'CA Total TTC', 'value' => number_format($totalTtc, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Nb caissiers', 'value' => count($rows)],
            ],
            'columns' => [
                ['key' => 'name',       'label' => 'Caissier',      'align' => 'left'],
                ['key' => 'nb_sales',   'label' => 'Nb ventes',     'align' => 'right'],
                ['key' => 'total_ttc',  'label' => 'CA TTC',        'align' => 'right'],
                ['key' => 'avg_basket', 'label' => 'Panier moyen',  'align' => 'right'],
            ],
            'rows'    => $rows,
            'totals'  => [
                'name' => 'TOTAL', 'nb_sales' => '',
                'total_ttc' => number_format($totalTtc, 0, ',', ' ') . ' FCFA',
                'avg_basket' => '',
            ],
        ])->download("rapport-ventes-caissiers-{$from}-{$to}.pdf");
    }

    /** Ventes par catégorie */
    public function reportSalesByCategory(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from', now()->startOfMonth()->toDateString());
        $to    = $request->input('date_to', now()->toDateString());

        $rows = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('sales.store_id', $store->id)
            ->where('sales.status', 'completed')
            ->whereBetween(DB::raw("date(sales.created_at)"), [$from, $to])
            ->select(
                DB::raw("COALESCE(categories.name, 'Sans catégorie') as category_name"),
                DB::raw('SUM(sale_items.qty) as total_qty'),
                DB::raw('SUM(sale_items.total_ttc) as total_ttc')
            )
            ->groupBy('categories.name')
            ->orderByDesc('total_ttc')
            ->get()
            ->map(fn($r) => [
                'category_name' => $r->category_name,
                'total_qty'     => number_format($r->total_qty, 0, ',', ' '),
                'total_ttc'     => number_format($r->total_ttc, 0, ',', ' ') . ' FCFA',
            ])->toArray();

        $totalTtc = array_sum(array_map(fn($r) => (float) str_replace([' ', ' FCFA'], '', $r['total_ttc']), $rows));

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Ventes par Catégorie',
            'period'  => ['from' => $from, 'to' => $to],
            'kpis'    => [
                ['label' => 'CA Total TTC',   'value' => number_format($totalTtc, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Nb catégories',  'value' => count($rows)],
            ],
            'columns' => [
                ['key' => 'category_name', 'label' => 'Catégorie', 'align' => 'left'],
                ['key' => 'total_qty',     'label' => 'Qté',       'align' => 'right'],
                ['key' => 'total_ttc',     'label' => 'CA TTC',    'align' => 'right'],
            ],
            'rows'    => $rows,
            'totals'  => [
                'category_name' => 'TOTAL', 'total_qty' => '',
                'total_ttc' => number_format($totalTtc, 0, ',', ' ') . ' FCFA',
            ],
        ])->download("rapport-ventes-categories-{$from}-{$to}.pdf");
    }

    /** Valorisation du stock */
    public function reportStockValuation(Request $request)
    {
        $store = $this->store($request);

        $rows = DB::table('stock_levels')
            ->join('products', 'products.id', '=', 'stock_levels.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('stock_levels.store_id', $store->id)
            ->where('stock_levels.qty_on_hand', '>', 0)
            ->select(
                'products.internal_code as code',
                'products.name',
                DB::raw("COALESCE(categories.name, 'Sans catégorie') as category_name"),
                'stock_levels.qty_on_hand',
                'stock_levels.avg_cost',
                'stock_levels.total_value'
            )
            ->orderByDesc('total_value')
            ->get()
            ->map(fn($r) => [
                'code'          => $r->code ?? '—',
                'name'          => $r->name,
                'category_name' => $r->category_name,
                'qty_on_hand'   => number_format($r->qty_on_hand, 2, ',', ' '),
                'avg_cost'      => number_format($r->avg_cost, 0, ',', ' ') . ' FCFA',
                'total_value'   => number_format($r->total_value, 0, ',', ' ') . ' FCFA',
            ])->toArray();

        $totalValue = DB::table('stock_levels')
            ->where('store_id', $store->id)
            ->where('qty_on_hand', '>', 0)
            ->sum('total_value');

        return $this->pdf('pdf.report', [
            'store'    => $store,
            'title'    => 'Valorisation du Stock',
            'subtitle' => 'Au ' . now()->format('d/m/Y'),
            'period'   => ['from' => now()->toDateString(), 'to' => now()->toDateString()],
            'kpis'     => [
                ['label' => 'Valeur totale stock', 'value' => number_format($totalValue, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Références en stock',  'value' => count($rows)],
            ],
            'columns'  => [
                ['key' => 'code',          'label' => 'Code',      'align' => 'left'],
                ['key' => 'name',          'label' => 'Produit',   'align' => 'left'],
                ['key' => 'category_name', 'label' => 'Catégorie', 'align' => 'left'],
                ['key' => 'qty_on_hand',   'label' => 'Stock',     'align' => 'right'],
                ['key' => 'avg_cost',      'label' => 'Coût moy.', 'align' => 'right'],
                ['key' => 'total_value',   'label' => 'Valeur',    'align' => 'right'],
            ],
            'rows'     => $rows,
            'totals'   => [
                'code' => '', 'name' => 'TOTAL', 'category_name' => '',
                'qty_on_hand' => '', 'avg_cost' => '',
                'total_value' => number_format($totalValue, 0, ',', ' ') . ' FCFA',
            ],
        ], 'landscape')->download("rapport-stock-" . now()->format('Y-m-d') . ".pdf");
    }

    /** Soldes fournisseurs */
    public function reportSupplierBalances(Request $request)
    {
        $store = $this->store($request);

        $rows = DB::table('suppliers')
            ->leftJoin('supplier_invoices', 'supplier_invoices.supplier_id', '=', 'suppliers.id')
            ->where(fn($q) => $q->whereNull('suppliers.store_id')->orWhere('suppliers.store_id', $store->id))
            ->select(
                'suppliers.company_name',
                'suppliers.phone',
                DB::raw('COALESCE(SUM(supplier_invoices.balance_due), 0) as total_balance')
            )
            ->groupBy('suppliers.id', 'suppliers.company_name', 'suppliers.phone')
            ->having('total_balance', '>', 0)
            ->orderByDesc('total_balance')
            ->get()
            ->map(fn($r) => [
                'company_name'  => $r->company_name,
                'phone'         => $r->phone ?? '—',
                'total_balance' => number_format($r->total_balance, 0, ',', ' ') . ' FCFA',
            ])->toArray();

        $totalBalance = array_sum(array_map(fn($r) => (float) str_replace([' ', ' FCFA'], '', $r['total_balance']), $rows));

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Soldes Fournisseurs',
            'subtitle' => 'Au ' . now()->format('d/m/Y'),
            'period'  => ['from' => now()->toDateString(), 'to' => now()->toDateString()],
            'kpis'    => [
                ['label' => 'Total dû fournisseurs', 'value' => number_format($totalBalance, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Fournisseurs avec solde', 'value' => count($rows)],
            ],
            'columns' => [
                ['key' => 'company_name',  'label' => 'Fournisseur',  'align' => 'left'],
                ['key' => 'phone',         'label' => 'Téléphone',    'align' => 'left'],
                ['key' => 'total_balance', 'label' => 'Solde dû',     'align' => 'right'],
            ],
            'rows'    => $rows,
            'totals'  => [
                'company_name' => 'TOTAL', 'phone' => '',
                'total_balance' => number_format($totalBalance, 0, ',', ' ') . ' FCFA',
            ],
        ])->download("rapport-soldes-fournisseurs-" . now()->format('Y-m-d') . ".pdf");
    }

    /** Crédit clients */
    public function reportClientCredit(Request $request)
    {
        $store = $this->store($request);

        $rows = DB::table('clients')
            ->where('store_id', $store->id)
            ->where('credit_balance', '>', 0)
            ->select('name', 'phone', 'credit_balance', 'credit_limit', 'loyalty_points')
            ->orderByDesc('credit_balance')
            ->get()
            ->map(fn($r) => [
                'name'           => $r->name,
                'phone'          => $r->phone ?? '—',
                'credit_balance' => number_format($r->credit_balance, 0, ',', ' ') . ' FCFA',
                'credit_limit'   => $r->credit_limit ? number_format($r->credit_limit, 0, ',', ' ') . ' FCFA' : '—',
                'loyalty_points' => number_format($r->loyalty_points, 0, ',', ' ') . ' pts',
            ])->toArray();

        $totalCredit = DB::table('clients')->where('store_id', $store->id)->sum('credit_balance');

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Crédit Clients',
            'subtitle' => 'Au ' . now()->format('d/m/Y'),
            'period'  => ['from' => now()->toDateString(), 'to' => now()->toDateString()],
            'kpis'    => [
                ['label' => 'Total crédit clients', 'value' => number_format($totalCredit, 0, ',', ' ') . ' FCFA'],
                ['label' => 'Clients avec crédit',   'value' => count($rows)],
            ],
            'columns' => [
                ['key' => 'name',           'label' => 'Client',       'align' => 'left'],
                ['key' => 'phone',          'label' => 'Téléphone',    'align' => 'left'],
                ['key' => 'credit_balance', 'label' => 'Crédit',       'align' => 'right'],
                ['key' => 'credit_limit',   'label' => 'Limite',       'align' => 'right'],
                ['key' => 'loyalty_points', 'label' => 'Points fidél.','align' => 'right'],
            ],
            'rows'    => $rows,
            'totals'  => [
                'name' => 'TOTAL', 'phone' => '',
                'credit_balance' => number_format($totalCredit, 0, ',', ' ') . ' FCFA',
                'credit_limit' => '', 'loyalty_points' => '',
            ],
        ])->download("rapport-credit-clients-" . now()->format('Y-m-d') . ".pdf");
    }

    // ─── États comptables ─────────────────────────────────────────────────────

    /** Journal des écritures */
    public function accountingJournal(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from', now()->startOfMonth()->toDateString());
        $to    = $request->input('date_to',   now()->toDateString());

        $typeLabels = [
            'vente' => 'Vente', 'achat' => 'Achat', 'paiement' => 'Paiement',
            'charge' => 'Charge', 'ajustement' => 'Ajustement', 'perte' => 'Perte', 'autre' => 'Autre',
        ];

        $entries = DB::table('journal_entries as e')
            ->where('e.store_id', $store->id)
            ->when($from, fn($q) => $q->whereDate('e.entry_date', '>=', $from))
            ->when($to,   fn($q) => $q->whereDate('e.entry_date', '<=', $to))
            ->orderBy('e.entry_date')
            ->orderBy('e.id')
            ->select(
                'e.reference', 'e.entry_date', 'e.description', 'e.type', 'e.status',
                DB::raw('(SELECT COALESCE(SUM(l.debit),0) FROM journal_entry_lines l WHERE l.journal_entry_id = e.id) as total_debit')
            )
            ->get();

        $totalDebit = $entries->sum('total_debit');
        $fmt        = fn($n) => number_format((float) $n, 0, ',', ' ') . ' FCFA';

        $rows = $entries->map(fn($e) => [
            'reference'   => $e->reference,
            'date'        => date('d/m/Y', strtotime($e->entry_date)),
            'description' => $e->description,
            'type'        => $typeLabels[$e->type] ?? $e->type,
            'status'      => $e->status === 'valide' ? 'Validé' : 'Brouillon',
            'total_debit' => $fmt($e->total_debit),
        ])->toArray();

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Journal des écritures',
            'period'  => ['from' => date('d/m/Y', strtotime($from)), 'to' => date('d/m/Y', strtotime($to))],
            'kpis'    => [
                ['label' => "Nombre d'écritures", 'value' => count($rows)],
                ['label' => 'Total débit',        'value' => $fmt($totalDebit)],
            ],
            'columns' => [
                ['key' => 'reference',   'label' => 'Référence'],
                ['key' => 'date',        'label' => 'Date'],
                ['key' => 'description', 'label' => 'Libellé'],
                ['key' => 'type',        'label' => 'Type'],
                ['key' => 'status',      'label' => 'Statut'],
                ['key' => 'total_debit', 'label' => 'Total débit', 'align' => 'right'],
            ],
            'rows'    => $rows,
            'totals'  => [
                'reference' => '', 'date' => '', 'description' => 'TOTAL',
                'type' => '', 'status' => '', 'total_debit' => $fmt($totalDebit),
            ],
        ])->download("Journal-{$from}-{$to}.pdf");
    }

    /** Balance des comptes */
    public function accountingBalance(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from');
        $to    = $request->input('date_to');

        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($store, $from, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $store->id)
                     ->where('e.status', 'valide')
                     ->when($from, fn($q) => $q->whereDate('e.entry_date', '>=', $from))
                     ->when($to,   fn($q) => $q->whereDate('e.entry_date', '<=', $to));
            })
            ->where('a.store_id', $store->id)
            ->where('a.is_active', true)
            ->select(
                'a.code', 'a.name', 'a.class',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit'),
                DB::raw('COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as solde')
            )
            ->groupBy('a.id', 'a.code', 'a.name', 'a.class')
            ->orderBy('a.code')
            ->get();

        $totalDebit  = $rows->sum('total_debit');
        $totalCredit = $rows->sum('total_credit');
        $fmt         = fn($n) => number_format((float) $n, 0, ',', ' ') . ' FCFA';

        $classLabels = [
            '1' => 'Cl.1 Ressources durables', '2' => 'Cl.2 Actif immobilisé',
            '3' => 'Cl.3 Stocks', '4' => 'Cl.4 Tiers',
            '5' => 'Cl.5 Trésorerie', '6' => 'Cl.6 Charges', '7' => 'Cl.7 Produits',
        ];

        $formatted = $rows->map(fn($r) => [
            'code'         => $r->code,
            'name'         => $r->name,
            'class'        => $classLabels[$r->class] ?? "Classe {$r->class}",
            'total_debit'  => $r->total_debit  > 0 ? $fmt($r->total_debit)  : '—',
            'total_credit' => $r->total_credit > 0 ? $fmt($r->total_credit) : '—',
            'solde'        => ($r->total_debit == 0 && $r->total_credit == 0)
                ? '—'
                : number_format(abs((float) $r->solde), 0, ',', ' ') . ' FCFA ' . ($r->solde >= 0 ? 'D' : 'C'),
        ])->toArray();

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Balance des comptes',
            'period'  => [
                'from' => $from ? date('d/m/Y', strtotime($from)) : '—',
                'to'   => $to   ? date('d/m/Y', strtotime($to))   : '—',
            ],
            'kpis'    => [
                ['label' => 'Total Débit',  'value' => $fmt($totalDebit)],
                ['label' => 'Total Crédit', 'value' => $fmt($totalCredit)],
            ],
            'columns' => [
                ['key' => 'code',         'label' => 'Code'],
                ['key' => 'name',         'label' => 'Intitulé'],
                ['key' => 'class',        'label' => 'Classe'],
                ['key' => 'total_debit',  'label' => 'Débit',  'align' => 'right'],
                ['key' => 'total_credit', 'label' => 'Crédit', 'align' => 'right'],
                ['key' => 'solde',        'label' => 'Solde',  'align' => 'right'],
            ],
            'rows'    => $formatted,
            'totals'  => [
                'code' => '', 'name' => 'TOTAL', 'class' => '',
                'total_debit'  => $fmt($totalDebit),
                'total_credit' => $fmt($totalCredit),
                'solde'        => '',
            ],
        ], 'landscape')->download("Balance-{$from}-{$to}.pdf");
    }

    /** Compte de résultat */
    public function accountingResultat(Request $request)
    {
        $store = $this->store($request);
        $from  = $request->input('date_from', now()->startOfYear()->toDateString());
        $to    = $request->input('date_to',   now()->toDateString());

        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($store, $from, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $store->id)
                     ->where('e.status', 'valide')
                     ->whereDate('e.entry_date', '>=', $from)
                     ->whereDate('e.entry_date', '<=', $to);
            })
            ->where('a.store_id', $store->id)
            ->where('a.is_active', true)
            ->whereIn('a.class', ['6', '7'])
            ->select(
                'a.code', 'a.name', 'a.class',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit')
            )
            ->groupBy('a.code', 'a.name', 'a.class')
            ->orderBy('a.code')
            ->get();

        $produits       = $rows->where('class', '7');
        $charges        = $rows->where('class', '6');
        $totalProduits  = $produits->sum('total_credit') - $produits->sum('total_debit');
        $totalCharges   = $charges->sum('total_debit')  - $charges->sum('total_credit');
        $resultat       = $totalProduits - $totalCharges;
        $fmt            = fn($n) => number_format((float) $n, 0, ',', ' ') . ' FCFA';

        $formatted = collect();
        foreach ($produits as $p) {
            $formatted->push([
                'section' => 'Produits (Cl. 7)',
                'code'    => $p->code,
                'name'    => $p->name,
                'montant' => $fmt($p->total_credit - $p->total_debit),
            ]);
        }
        foreach ($charges as $c) {
            $formatted->push([
                'section' => 'Charges (Cl. 6)',
                'code'    => $c->code,
                'name'    => $c->name,
                'montant' => $fmt($c->total_debit - $c->total_credit),
            ]);
        }

        return $this->pdf('pdf.report', [
            'store'   => $store,
            'title'   => 'Compte de résultat',
            'period'  => ['from' => date('d/m/Y', strtotime($from)), 'to' => date('d/m/Y', strtotime($to))],
            'kpis'    => [
                ['label' => 'Total produits', 'value' => $fmt($totalProduits)],
                ['label' => 'Total charges',  'value' => $fmt($totalCharges)],
                ['label' => 'Résultat net',   'value' => ($resultat >= 0 ? '+' : '') . $fmt(abs($resultat)), 'sub' => $resultat >= 0 ? 'BÉNÉFICE' : 'DÉFICIT'],
            ],
            'columns' => [
                ['key' => 'section', 'label' => 'Section'],
                ['key' => 'code',    'label' => 'Code'],
                ['key' => 'name',    'label' => 'Intitulé'],
                ['key' => 'montant', 'label' => 'Montant', 'align' => 'right'],
            ],
            'rows'    => $formatted->toArray(),
            'totals'  => [
                'section' => '', 'code' => '', 'name' => 'RÉSULTAT NET',
                'montant' => ($resultat >= 0 ? '+' : '-') . $fmt(abs($resultat)),
            ],
        ])->download("Resultat-{$from}-{$to}.pdf");
    }

    /** Bilan OHADA (SYSCOHADA) */
    public function accountingBilan(Request $request)
    {
        $store = $this->store($request);
        $to    = $request->input('date_to', now()->toDateString());

        $rows = DB::table('accounting_accounts as a')
            ->leftJoin('journal_entry_lines as l', 'l.account_id', '=', 'a.id')
            ->leftJoin('journal_entries as e', function ($join) use ($store, $to) {
                $join->on('e.id', '=', 'l.journal_entry_id')
                     ->where('e.store_id', $store->id)
                     ->where('e.status', 'valide')
                     ->whereDate('e.entry_date', '<=', $to);
            })
            ->where('a.store_id', $store->id)
            ->where('a.is_active', true)
            ->select(
                'a.id', 'a.code', 'a.name', 'a.class', 'a.nature',
                DB::raw('COALESCE(SUM(l.debit), 0)  as total_debit'),
                DB::raw('COALESCE(SUM(l.credit), 0) as total_credit'),
                DB::raw('COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) as solde')
            )
            ->groupBy('a.id', 'a.code', 'a.name', 'a.class', 'a.nature')
            ->orderBy('a.code')
            ->get();

        $totalProduits  = $rows->where('class', '7')->sum(fn($r) => $r->total_credit - $r->total_debit);
        $totalCharges   = $rows->where('class', '6')->sum(fn($r) => $r->total_debit  - $r->total_credit);
        $resultat       = $totalProduits - $totalCharges;

        $immobilise     = $rows->where('class', '2')->where('solde', '>', 0)->values();
        $stocks         = $rows->where('class', '3')->where('solde', '>', 0)->values();
        $creances       = $rows->where('class', '4')->where('nature', 'actif')->where('solde', '>', 0)->values();
        $tresorerie     = $rows->where('nature', 'tresorerie')->where('solde', '>', 0)->values();
        $perteActif     = $resultat < 0 ? abs($resultat) : 0;
        $totalActif     = $immobilise->sum('solde') + $stocks->sum('solde') + $creances->sum('solde') + $tresorerie->sum('solde') + $perteActif;

        $capitaux       = $rows->where('class', '1')->where('nature', 'passif')->values();
        $dettes         = $rows->where('class', '4')->where('nature', 'passif')->where('solde', '<', 0)->values();
        $benefice       = $resultat > 0 ? $resultat : 0;
        $totalCapitaux  = $capitaux->sum(fn($r) => abs((float) $r->solde)) + $benefice;
        $totalDettes    = $dettes->sum(fn($r) => abs((float) $r->solde));
        $totalPassif    = $totalCapitaux + $totalDettes;

        return $this->pdf('pdf.accounting_bilan', [
            'store'          => $store,
            'to'             => date('d/m/Y', strtotime($to)),
            'resultat'       => $resultat,
            'equilibre'      => abs($totalActif - $totalPassif) < 1,
            'immobilise'     => $immobilise,
            'stocks'         => $stocks,
            'creances'       => $creances,
            'tresorerie'     => $tresorerie,
            'perte_actif'    => $perteActif,
            'total_actif'    => $totalActif,
            'capitaux'       => $capitaux,
            'dettes'         => $dettes,
            'benefice'       => $benefice,
            'total_capitaux' => $totalCapitaux,
            'total_dettes'   => $totalDettes,
            'total_passif'   => $totalPassif,
        ], 'landscape')->download("Bilan-OHADA-{$to}.pdf");
    }
}
