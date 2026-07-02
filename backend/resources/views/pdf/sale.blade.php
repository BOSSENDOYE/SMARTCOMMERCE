@extends('pdf.layout')

@section('content')

@php
  $payLabels = [
    'cash'            => 'Espèces',
    'card'            => 'Carte bancaire',
    'wave'            => 'Wave',
    'orange_money'    => 'Orange Money',
    'free_money'      => 'Free Money',
    'credit'          => 'Crédit client',
    'account'         => 'Compte client',
    'account_deposit' => 'Dépôt compte',
    'check'           => 'Chèque',
    'voucher'         => "Bon d'achat",
    'loyalty_points'  => 'Points fidélité',
  ];
@endphp

<!-- ── En-tête ─────────────────────────────────────────────────────────── -->
<div class="header">
  <div class="header-left">
    <div class="company-name">{{ $store->name }}</div>
    <div class="company-sub">
      @if($store->address){{ $store->address }}<br>@endif
      @if($store->phone)Tél : {{ $store->phone }}&nbsp;&nbsp;@endif
      @if($store->email){{ $store->email }}<br>@endif
      @if($store->ninea)NINEA : {{ $store->ninea }}&nbsp;&nbsp;@endif
      @if($store->rc ?? null)RC : {{ $store->rc }}@endif
    </div>
  </div>
  <div class="header-right">
    <div class="doc-type">Reçu de vente</div>
    <div class="doc-ref">N° {{ $sale->reference }}</div>
    <span class="doc-status status-paid">Complétée</span>
  </div>
</div>

<!-- ── Parties ─────────────────────────────────────────────────────────── -->
<div class="parties">
  <div class="party-box">
    <div class="party-label">Vendeur</div>
    <div class="party-name">{{ $store->name }}</div>
    <div class="party-sub">
      {{ $store->address ?? '' }}<br>
      @if($store->phone)Tél : {{ $store->phone }}<br>@endif
      @if($store->email ?? null){{ $store->email }}@endif
    </div>
  </div>
  <div class="party-box">
    <div class="party-label">Client</div>
    @if($sale->client)
      <div class="party-name">{{ $sale->client->name }}</div>
      <div class="party-sub">
        @if($sale->client->address ?? null){{ $sale->client->address }}<br>@endif
        @if($sale->client->phone)Tél : {{ $sale->client->phone }}<br>@endif
        @if($sale->client->email ?? null){{ $sale->client->email }}@endif
      </div>
    @else
      <div class="party-name" style="color:#9ca3af;">Client de passage</div>
    @endif
  </div>
</div>

<!-- ── Méta ────────────────────────────────────────────────────────────── -->
<div class="meta-grid">
  <div class="meta-item">
    <div class="meta-label">Date & heure</div>
    <div class="meta-value">{{ \Carbon\Carbon::parse($sale->created_at)->format('d/m/Y à H:i') }}</div>
  </div>
  @if($sale->user ?? null)
  <div class="meta-item">
    <div class="meta-label">Caissier</div>
    <div class="meta-value">{{ $sale->user->name }}</div>
  </div>
  @endif
  @if($sale->channel)
  <div class="meta-item">
    <div class="meta-label">Canal</div>
    <div class="meta-value">{{ ['pos'=>'Caisse','takeaway'=>'Emporter','delivery'=>'Livraison','online'=>'En ligne'][$sale->channel] ?? $sale->channel }}</div>
  </div>
  @endif
  @if($sale->ticket_number ?? null)
  <div class="meta-item">
    <div class="meta-label">N° Ticket</div>
    <div class="meta-value">{{ $sale->ticket_number }}</div>
  </div>
  @endif
</div>

<!-- ── Lignes ───────────────────────────────────────────────────────────── -->
<table class="items">
  <thead>
    <tr>
      <th style="width:42%">Désignation</th>
      <th class="right" style="width:9%">Qté</th>
      <th class="right" style="width:16%">Prix U. TTC</th>
      <th class="right" style="width:9%">Remise</th>
      <th class="right" style="width:10%">TVA</th>
      <th class="right" style="width:14%">Total TTC</th>
    </tr>
  </thead>
  <tbody>
    @foreach($sale->items as $item)
    @php
      $name = $item->product->name ?? $item->restaurantItem->name ?? '—';
      $qty  = (float)$item->qty;
    @endphp
    <tr>
      <td>{{ $name }}</td>
      <td class="right">{{ $qty == (int)$qty ? number_format($qty, 0) : number_format($qty, 3, ',', ' ') }}</td>
      <td class="right">{{ number_format($item->unit_price_ttc, 0, ',', ' ') }}</td>
      <td class="right">{{ $item->discount_pct > 0 ? $item->discount_pct.'%' : '—' }}</td>
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
      <span class="val">{{ number_format($sale->subtotal_ht, 0, ',', ' ') }} FCFA</span>
    </div>
    @if($sale->discount_amount > 0)
    <div class="totals-row">
      <span class="label">Remises</span>
      <span class="val" style="color:#ef4444;">- {{ number_format($sale->discount_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    @endif
    <div class="totals-row">
      <span class="label">TVA</span>
      <span class="val">{{ number_format($sale->vat_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    <div class="totals-total">
      <span class="label">TOTAL TTC</span>
      <span class="val">{{ number_format($sale->total_ttc, 0, ',', ' ') }} FCFA</span>
    </div>
  </div>
</div>

<!-- ── Paiements ───────────────────────────────────────────────────────── -->
@if($sale->payments && count($sale->payments) > 0)
<div class="payments-section">
  <div class="section-title">Mode(s) de règlement</div>
  <table class="payments">
    @foreach($sale->payments as $pmt)
    <tr>
      <td>{{ $payLabels[$pmt->payment_method] ?? $pmt->payment_method }}</td>
      <td class="right" style="font-weight:700;color:#065f46;">{{ number_format($pmt->amount, 0, ',', ' ') }} FCFA</td>
    </tr>
    @endforeach
    @if($sale->change_amount > 0)
    <tr style="border-top:1px dashed #ccc">
      <td style="color:#555;">Rendu monnaie</td>
      <td class="right" style="font-weight:700;">{{ number_format($sale->change_amount, 0, ',', ' ') }} FCFA</td>
    </tr>
    @endif
  </table>
</div>
@endif

<!-- ── Points de fidélité ───────────────────────────────────────────────── -->
@if($sale->loyalty_points_earned > 0)
<div style="margin-bottom:14px;padding:6px 12px;background:#fefce8;border:1px solid #fde047;border-radius:4px;font-size:9px;font-weight:700;color:#854d0e;text-align:center;">
  ★ {{ $sale->loyalty_points_earned }} points de fidélité gagnés
</div>
@endif

<!-- ── Pied de page magasin ────────────────────────────────────────────── -->
@if($store->receipt_footer ?? null)
<div style="text-align:center; font-size:9px; color:#666; margin-top:10px; font-style:italic;">
  {{ $store->receipt_footer }}
</div>
@endif

@endsection
