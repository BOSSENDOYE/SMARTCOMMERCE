@extends('pdf.layout')

@section('content')

@php
  $statusLabels = [
    'draft'     => ['label' => 'Brouillon',  'css' => 'status-draft'],
    'sent'      => ['label' => 'Envoyée',    'css' => 'status-sent'],
    'partial'   => ['label' => 'Partiel',    'css' => 'status-partial'],
    'paid'      => ['label' => 'Payée',      'css' => 'status-paid'],
    'overdue'   => ['label' => 'En retard',  'css' => 'status-overdue'],
    'cancelled' => ['label' => 'Annulée',    'css' => 'status-cancelled'],
  ];
  $st = $statusLabels[$invoice->status] ?? ['label' => $invoice->status, 'css' => 'status-draft'];
  $balance = (float)$invoice->total_ttc - (float)$invoice->paid_amount;
@endphp

<!-- ── En-tête ─────────────────────────────────────────────────────────── -->
<div class="header">
  <div class="header-left">
    <div class="company-name">{{ $store->name }}</div>
    <div class="company-sub">
      @if($store->address){{ $store->address }}<br>@endif
      @if($store->phone)Tél : {{ $store->phone }}  @endif
      @if($store->email)Email : {{ $store->email }}<br>@endif
      @if($store->ninea)NINEA : {{ $store->ninea }}  @endif
      @if($store->rc)RC : {{ $store->rc }}@endif
    </div>
  </div>
  <div class="header-right">
    <div class="doc-type">Facture</div>
    <div class="doc-ref">N° {{ $invoice->reference }}</div>
    <span class="doc-status {{ $st['css'] }}">{{ $st['label'] }}</span>
  </div>
</div>

<!-- ── Parties ─────────────────────────────────────────────────────────── -->
<div class="parties">
  <div class="party-box">
    <div class="party-label">Émetteur</div>
    <div class="party-name">{{ $store->name }}</div>
    <div class="party-sub">
      {{ $store->address ?? '' }}<br>
      @if($store->phone)Tél : {{ $store->phone }}<br>@endif
      @if($store->email){{ $store->email }}@endif
    </div>
  </div>
  <div class="party-box">
    <div class="party-label">Destinataire</div>
    @if($invoice->client)
      <div class="party-name">{{ $invoice->client->name }}</div>
      <div class="party-sub">
        @if($invoice->client->address){{ $invoice->client->address }}<br>@endif
        @if($invoice->client->phone)Tél : {{ $invoice->client->phone }}<br>@endif
        @if($invoice->client->email){{ $invoice->client->email }}@endif
      </div>
    @else
      <div class="party-name" style="color:#9ca3af;">Client non précisé</div>
    @endif
  </div>
</div>

<!-- ── Méta ────────────────────────────────────────────────────────────── -->
<div class="meta-grid">
  <div class="meta-item">
    <div class="meta-label">Date d'émission</div>
    <div class="meta-value">{{ \Carbon\Carbon::parse($invoice->issue_date)->format('d/m/Y') }}</div>
  </div>
  @if($invoice->due_date)
  <div class="meta-item">
    <div class="meta-label">Date d'échéance</div>
    <div class="meta-value">{{ \Carbon\Carbon::parse($invoice->due_date)->format('d/m/Y') }}</div>
  </div>
  @endif
  <div class="meta-item">
    <div class="meta-label">Créé par</div>
    <div class="meta-value">{{ $invoice->createdBy->name ?? '—' }}</div>
  </div>
</div>

@if($invoice->object)
<div class="obj-row"><strong>Objet :</strong> {{ $invoice->object }}</div>
@endif

<!-- ── Lignes ───────────────────────────────────────────────────────────── -->
<table class="items">
  <thead>
    <tr>
      <th style="width:40%">Description</th>
      <th class="right" style="width:8%">Qté</th>
      <th style="width:8%">Unité</th>
      <th class="right" style="width:14%">Prix unit. HT</th>
      <th class="right" style="width:8%">Remise</th>
      <th class="right" style="width:8%">TVA</th>
      <th class="right" style="width:14%">Total TTC</th>
    </tr>
  </thead>
  <tbody>
    @foreach($invoice->items as $item)
    <tr>
      <td>{{ $item->description }}</td>
      <td class="right">{{ number_format($item->quantity, 2, ',', ' ') }}</td>
      <td>{{ $item->unit }}</td>
      <td class="right">{{ number_format($item->unit_price, 0, ',', ' ') }}</td>
      <td class="right">{{ $item->discount_percent ? $item->discount_percent.'%' : '—' }}</td>
      <td class="right">{{ $item->vat_rate }}%</td>
      <td class="right">{{ number_format($item->total_ttc, 0, ',', ' ') }}</td>
    </tr>
    @endforeach
  </tbody>
</table>

<!-- ── Totaux ──────────────────────────────────────────────────────────── -->
<div class="totals-wrap">
  <div class="totals-box">
    <div class="totals-row">
      <span class="label">Sous-total HT</span>
      <span class="val">{{ number_format($invoice->subtotal_ht, 0, ',', ' ') }} FCFA</span>
    </div>
    @if($invoice->discount_amount > 0)
    <div class="totals-row">
      <span class="label">Remises</span>
      <span class="val" style="color:#ef4444;">- {{ number_format($invoice->discount_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    @endif
    <div class="totals-row">
      <span class="label">TVA</span>
      <span class="val">{{ number_format($invoice->vat_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    <div class="totals-total">
      <span class="label">TOTAL TTC</span>
      <span class="val">{{ number_format($invoice->total_ttc, 0, ',', ' ') }} FCFA</span>
    </div>
  </div>
</div>

<!-- ── Paiements ───────────────────────────────────────────────────────── -->
@if($invoice->payments && count($invoice->payments) > 0)
<div class="payments-section">
  <div class="section-title">Paiements reçus</div>
  <table class="payments">
    @foreach($invoice->payments as $pmt)
    <tr>
      <td>{{ \Carbon\Carbon::parse($pmt->paid_at)->format('d/m/Y') }}</td>
      <td>{{ ['cash'=>'Espèces','mobile_money'=>'Mobile Money','bank_transfer'=>'Virement','check'=>'Chèque','other'=>'Autre'][$pmt->method] ?? $pmt->method }}</td>
      @if($pmt->reference)<td class="muted">Réf : {{ $pmt->reference }}</td>@else<td></td>@endif
      <td class="right" style="font-weight:700;color:#065f46;">{{ number_format($pmt->amount, 0, ',', ' ') }} FCFA</td>
    </tr>
    @endforeach
  </table>
  <div class="balance-row">
    <div class="balance-box {{ $balance <= 0 ? 'balance-paid' : 'balance-due' }}">
      @if($balance <= 0)
        Solde : PAYÉE INTÉGRALEMENT
      @else
        Reste à payer : {{ number_format($balance, 0, ',', ' ') }} FCFA
      @endif
    </div>
  </div>
</div>
@endif

<!-- ── Notes / Conditions ──────────────────────────────────────────────── -->
@if($invoice->notes || $invoice->terms)
<div class="notes-section">
  @if($invoice->notes)
    <div class="section-title">Notes</div>
    <div class="notes-text">{{ $invoice->notes }}</div>
  @endif
  @if($invoice->terms)
    <div class="section-title" style="margin-top:10px;">Conditions de paiement</div>
    <div class="notes-text">{{ $invoice->terms }}</div>
  @endif
</div>
@endif

<!-- ── Pied de page magasin ────────────────────────────────────────────── -->
@if($store->receipt_footer)
<div style="text-align:center; font-size:9px; color:#666; margin-top:10px; font-style:italic;">
  {{ $store->receipt_footer }}
</div>
@endif

@endsection
