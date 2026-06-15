@extends('pdf.layout')

@section('content')

@php
  $statusLabels = [
    'draft'     => ['label' => 'Brouillon', 'css' => 'status-draft'],
    'sent'      => ['label' => 'Envoyé',    'css' => 'status-sent'],
    'accepted'  => ['label' => 'Accepté',   'css' => 'status-accepted'],
    'invoiced'  => ['label' => 'Facturé',   'css' => 'status-paid'],
    'cancelled' => ['label' => 'Annulé',    'css' => 'status-cancelled'],
  ];
  $st = $statusLabels[$quote->status] ?? ['label' => $quote->status, 'css' => 'status-draft'];
  $isExpired = $quote->valid_until && now()->gt($quote->valid_until) && !in_array($quote->status, ['accepted','invoiced','cancelled']);
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
    <div class="doc-type">Devis</div>
    <div class="doc-ref">N° {{ $quote->reference }}</div>
    <span class="doc-status {{ $isExpired ? 'status-overdue' : $st['css'] }}">
      {{ $isExpired ? 'Expiré' : $st['label'] }}
    </span>
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
    <div class="party-label">Client</div>
    @if($quote->client)
      <div class="party-name">{{ $quote->client->name }}</div>
      <div class="party-sub">
        @if($quote->client->address){{ $quote->client->address }}<br>@endif
        @if($quote->client->phone)Tél : {{ $quote->client->phone }}<br>@endif
        @if($quote->client->email){{ $quote->client->email }}@endif
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
    <div class="meta-value">{{ \Carbon\Carbon::parse($quote->issue_date)->format('d/m/Y') }}</div>
  </div>
  @if($quote->valid_until)
  <div class="meta-item">
    <div class="meta-label">Valide jusqu'au</div>
    <div class="meta-value" style="{{ $isExpired ? 'color:#ef4444;' : '' }}">
      {{ \Carbon\Carbon::parse($quote->valid_until)->format('d/m/Y') }}
    </div>
  </div>
  @endif
  <div class="meta-item">
    <div class="meta-label">Créé par</div>
    <div class="meta-value">{{ $quote->createdBy->name ?? '—' }}</div>
  </div>
</div>

@if($quote->object)
<div class="obj-row"><strong>Objet :</strong> {{ $quote->object }}</div>
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
    @foreach($quote->items as $item)
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
      <span class="val">{{ number_format($quote->subtotal_ht, 0, ',', ' ') }} FCFA</span>
    </div>
    @if($quote->discount_amount > 0)
    <div class="totals-row">
      <span class="label">Remises</span>
      <span class="val" style="color:#ef4444;">- {{ number_format($quote->discount_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    @endif
    <div class="totals-row">
      <span class="label">TVA</span>
      <span class="val">{{ number_format($quote->vat_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    <div class="totals-total">
      <span class="label">TOTAL TTC</span>
      <span class="val">{{ number_format($quote->total_ttc, 0, ',', ' ') }} FCFA</span>
    </div>
  </div>
</div>

<!-- ── Validité / Conditions ──────────────────────────────────────────── -->
@if($quote->notes || $quote->terms)
<div class="notes-section">
  @if($quote->notes)
    <div class="section-title">Notes</div>
    <div class="notes-text">{{ $quote->notes }}</div>
  @endif
  @if($quote->terms)
    <div class="section-title" style="margin-top:10px;">Conditions</div>
    <div class="notes-text">{{ $quote->terms }}</div>
  @endif
</div>
@endif

<div class="notes-section">
  <div class="notes-text" style="text-align:center; font-style:italic;">
    Ce devis est valable @if($quote->valid_until)jusqu'au {{ \Carbon\Carbon::parse($quote->valid_until)->format('d/m/Y') }}@else 30 jours à compter de sa date d'émission@endif.
    Pour l'accepter, veuillez nous retourner ce document signé et cacheté.
  </div>
</div>

@if($store->receipt_footer)
<div style="text-align:center; font-size:9px; color:#666; margin-top:10px; font-style:italic;">
  {{ $store->receipt_footer }}
</div>
@endif

@endsection
