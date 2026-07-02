@extends('pdf.layout')

@section('content')

@php
  /* ── Raccourcis config ──────────────────────────────────────────────── */
  $cfg  = $tplConfig ?? [];
  $hdr  = $cfg['header']     ?? [];
  $body = $cfg['body']       ?? [];
  $cols = $body['columns']   ?? [];
  $ftr  = $cfg['footer']     ?? [];

  $showStoreName = $hdr['show_store_name'] ?? true;
  $showAddress   = $hdr['show_address']    ?? true;
  $showPhone     = $hdr['show_phone']      ?? true;
  $showEmail     = $hdr['show_email']      ?? false;
  $showNinea     = $hdr['show_ninea']      ?? true;
  $showRc        = $hdr['show_rc']         ?? false;
  $slogan        = $hdr['slogan']          ?? '';

  $showCashier = $body['show_cashier']         ?? true;
  $showClient  = $body['show_client']           ?? true;
  $showPayment = $body['show_payment_method']   ?? true;
  $showVat     = $body['show_vat_detail']       ?? true;

  $colRef       = $cols['ref']        ?? false;
  $colName      = $cols['name']       ?? true;
  $colQty       = $cols['qty']        ?? true;
  $colUnitPrice = $cols['unit_price'] ?? true;
  $colDiscount  = $cols['discount']   ?? true;
  $colTotal     = $cols['total']      ?? true;

  $footerMsg        = ($ftr['message'] ?? '') ?: ($store->receipt_footer ?? '');
  $showReturnPolicy = $ftr['show_return_policy'] ?? false;
  $returnPolicy     = $ftr['return_policy']      ?? '';

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

  /* Calcul dynamique des largeurs de colonnes */
  $activeCols = array_filter([
    $colRef       ? ['key'=>'ref',        'pct'=>11] : null,
    $colName      ? ['key'=>'name',       'pct'=>0]  : null,  // stretch
    $colQty       ? ['key'=>'qty',        'pct'=>9]  : null,
    $colUnitPrice ? ['key'=>'unit_price', 'pct'=>16] : null,
    $colDiscount  ? ['key'=>'discount',   'pct'=>9]  : null,
    $showVat      ? ['key'=>'vat',        'pct'=>10] : null,
    $colTotal     ? ['key'=>'total',      'pct'=>14] : null,
  ]);
  $fixed   = array_sum(array_column(array_filter($activeCols, fn($c) => $c['pct'] > 0), 'pct'));
  $nameCol = 100 - $fixed;
@endphp

<!-- ── En-tête ─────────────────────────────────────────────────────────── -->
<div class="header">
  <div class="header-left">
    @if($showStoreName)
    <div class="company-name">{{ $hdr['store_name_override'] ?? '' ?: $store->name }}</div>
    @endif
    <div class="company-sub">
      @if($showAddress && $store->address){{ $store->address }}<br>@endif
      @if($showPhone && $store->phone)Tél : {{ $store->phone }}&nbsp;&nbsp;@endif
      @if($showEmail && ($store->email ?? null)){{ $store->email }}<br>@endif
      @if($showNinea && ($store->ninea ?? null))NINEA : {{ $store->ninea }}&nbsp;&nbsp;@endif
      @if($showRc && ($store->rc ?? null))RC : {{ $store->rc }}@endif
    </div>
    @if($slogan)
    <div style="font-size:9px;color:#555;font-style:italic;margin-top:2px;">{{ $slogan }}</div>
    @endif
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
      @if($showAddress){{ $store->address ?? '' }}<br>@endif
      @if($showPhone && $store->phone)Tél : {{ $store->phone }}<br>@endif
      @if($showEmail && ($store->email ?? null)){{ $store->email }}@endif
    </div>
  </div>
  @if($showClient)
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
  @endif
</div>

<!-- ── Méta ────────────────────────────────────────────────────────────── -->
<div class="meta-grid">
  <div class="meta-item">
    <div class="meta-label">Date & heure</div>
    <div class="meta-value">{{ \Carbon\Carbon::parse($sale->created_at)->format('d/m/Y à H:i') }}</div>
  </div>
  @if($showCashier && ($sale->user ?? null))
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
      @if($colRef)<th style="width:11%">Réf</th>@endif
      @if($colName)<th style="width:{{ $nameCol }}%">Désignation</th>@endif
      @if($colQty)<th class="right" style="width:9%">Qté</th>@endif
      @if($colUnitPrice)<th class="right" style="width:16%">Prix U. TTC</th>@endif
      @if($colDiscount)<th class="right" style="width:9%">Remise</th>@endif
      @if($showVat)<th class="right" style="width:10%">TVA</th>@endif
      @if($colTotal)<th class="right" style="width:14%">Total TTC</th>@endif
    </tr>
  </thead>
  <tbody>
    @foreach($sale->items as $item)
    @php
      $name = $item->product->name ?? $item->restaurantItem->name ?? '—';
      $ref  = $item->product->internal_code ?? '—';
      $qty  = (float)$item->qty;
    @endphp
    <tr>
      @if($colRef)<td>{{ $ref }}</td>@endif
      @if($colName)<td>{{ $name }}</td>@endif
      @if($colQty)<td class="right">{{ $qty == (int)$qty ? number_format($qty, 0) : number_format($qty, 3, ',', ' ') }}</td>@endif
      @if($colUnitPrice)<td class="right">{{ number_format($item->unit_price_ttc, 0, ',', ' ') }}</td>@endif
      @if($colDiscount)<td class="right">{{ $item->discount_pct > 0 ? $item->discount_pct.'%' : '—' }}</td>@endif
      @if($showVat)<td class="right">{{ $item->vat_rate }}%</td>@endif
      @if($colTotal)<td class="right">{{ number_format($item->total_ttc, 0, ',', ' ') }}</td>@endif
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
    @if($showVat)
    <div class="totals-row">
      <span class="label">TVA</span>
      <span class="val">{{ number_format($sale->vat_amount, 0, ',', ' ') }} FCFA</span>
    </div>
    @endif
    <div class="totals-total">
      <span class="label">TOTAL TTC</span>
      <span class="val">{{ number_format($sale->total_ttc, 0, ',', ' ') }} FCFA</span>
    </div>
  </div>
</div>

<!-- ── Paiements ───────────────────────────────────────────────────────── -->
@if($showPayment && $sale->payments && count($sale->payments) > 0)
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

<!-- ── Message de pied de page ─────────────────────────────────────────── -->
@if($footerMsg)
<div style="text-align:center; font-size:9px; color:#666; margin-top:10px; font-style:italic;">
  {{ $footerMsg }}
</div>
@endif

<!-- ── Politique de retour ──────────────────────────────────────────────── -->
@if($showReturnPolicy && $returnPolicy)
<div style="text-align:center; font-size:8px; color:#888; margin-top:6px; padding:4px 8px; border:1px dashed #ccc; border-radius:4px;">
  {{ $returnPolicy }}
</div>
@endif

@endsection
