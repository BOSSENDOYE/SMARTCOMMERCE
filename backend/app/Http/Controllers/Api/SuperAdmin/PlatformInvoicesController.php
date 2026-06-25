<?php

namespace App\Http\Controllers\Api\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\PlatformInvoice;
use App\Models\PlatformAuditLog;
use Illuminate\Http\Request;

class PlatformInvoicesController extends Controller
{
    public function index(Request $request)
    {
        $invoices = PlatformInvoice::with('organization:id,name')
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate((int) ($request->per_page ?? 50));

        return response()->json($invoices->through(fn ($inv) => [
            'id'              => $inv->id,
            'invoice_number'  => $inv->invoice_number,
            'organization_id' => $inv->organization_id,
            'organization_name' => $inv->organization?->name,
            'plan_name'       => $inv->plan_name,
            'amount'          => $inv->amount,
            'billing_cycle'   => $inv->billing_cycle,
            'status'          => $inv->status,
            'period_start'    => $inv->period_start,
            'period_end'      => $inv->period_end,
            'paid_at'         => $inv->paid_at,
            'notes'           => $inv->notes,
            'created_at'      => $inv->created_at,
        ]));
    }

    public function markPaid(Request $request, PlatformInvoice $invoice)
    {
        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'Cette facture est déjà payée'], 422);
        }

        $invoice->update(['status' => 'paid', 'paid_at' => now()]);

        PlatformAuditLog::record(
            'invoice.paid',
            $request->user()->id,
            'PlatformInvoice',
            $invoice->id,
            ['invoice_number' => $invoice->invoice_number, 'amount' => $invoice->amount]
        );

        return response()->json(['message' => 'Facture marquée comme payée', 'paid_at' => $invoice->paid_at]);
    }
}
