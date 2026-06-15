@extends('pdf.layout')

@section('content')
<style>
  .eq-badge { display:inline-block; padding:3px 10px; border-radius:10px; font-size:9px; font-weight:700; }
  .eq-ok  { background:#d1fae5; color:#065f46; }
  .eq-err { background:#fee2e2; color:#991b1b; }

  .res-kpi { padding:10px 14px; border-radius:6px; margin-bottom:16px; }
  .res-kpi.benefit { background:#f0fdf4; border-left:4px solid #16a34a; }
  .res-kpi.deficit { background:#fef2f2; border-left:4px solid #dc2626; }
  .res-kpi .res-label { font-size:8px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; }
  .res-kpi .res-value { font-size:18px; font-weight:700; margin-top:2px; }
  .res-kpi.benefit .res-value { color:#16a34a; }
  .res-kpi.deficit .res-value { color:#dc2626; }
  .res-kpi .res-sub { font-size:8px; color:#9ca3af; margin-top:1px; font-weight:700; }

  /* Two-column layout using table */
  table.bilan-cols { width:100%; border-collapse:collapse; table-layout:fixed; }
  table.bilan-cols > tbody > tr > td { vertical-align:top; width:50%; }
  table.bilan-cols > tbody > tr > td:first-child { padding-right:8px; }
  table.bilan-cols > tbody > tr > td:last-child  { padding-left:8px; }

  .col-hdr { padding:8px 12px; font-size:11px; font-weight:700; color:#fff; letter-spacing:0.5px; }
  .col-hdr.actif  { background:#2563eb; }
  .col-hdr.passif { background:#059669; }

  table.section-tbl { width:100%; border-collapse:collapse; }
  .sec-title { background:#f1f5f9; padding:5px 10px; font-size:8px; font-weight:700; text-transform:uppercase; color:#475569; letter-spacing:0.4px; }
  table.section-tbl td { padding:5px 10px; font-size:9px; color:#374151; border-bottom:1px solid #f3f4f6; }
  table.section-tbl td.code { color:#9ca3af; font-size:8px; width:46px; }
  table.section-tbl td.amt  { text-align:right; font-weight:600; white-space:nowrap; }
  .sub-row td { background:#f8fafc; font-weight:700; font-size:9px; border-top:1px solid #e2e8f0; padding:5px 10px; }
  .sub-row td.amt { text-align:right; }

  .col-total { padding:8px 12px; font-size:10px; font-weight:700; color:#fff; }
  .col-total.actif  { background:#2563eb; }
  .col-total.passif { background:#059669; }
  .col-total .t-right { float:right; }
</style>

<!-- Header -->
<div class="header">
  <div class="header-left">
    <div class="company-name">{{ $store->name }}</div>
    <div class="company-sub">
      @if($store->address){{ $store->address }}<br>@endif
      @if($store->phone)Tél : {{ $store->phone }}@endif
    </div>
  </div>
  <div class="header-right">
    <div class="doc-type" style="font-size:16px;">Bilan SYSCOHADA</div>
    <div class="doc-ref">Arrêté au {{ $to }}</div>
    <div style="margin-top:6px;">
      <span class="eq-badge {{ $equilibre ? 'eq-ok' : 'eq-err' }}">
        {{ $equilibre ? 'Bilan équilibré' : 'Déséquilibre détecté' }}
      </span>
    </div>
  </div>
</div>

<!-- Résultat KPI -->
<div class="res-kpi {{ $resultat >= 0 ? 'benefit' : 'deficit' }}">
  <div class="res-label">Résultat de l'exercice</div>
  <div class="res-value">{{ ($resultat >= 0 ? '+' : '') . number_format(abs($resultat), 0, ',', ' ') }} FCFA</div>
  <div class="res-sub">{{ $resultat >= 0 ? 'BÉNÉFICE' : 'DÉFICIT' }}</div>
</div>

<!-- Two-column Actif / Passif -->
<table class="bilan-cols">
<tbody>
<tr>
  <!-- ── ACTIF ── -->
  <td>
    <div class="col-hdr actif">ACTIF</div>
    <table class="section-tbl">

      @if($immobilise->count() > 0)
      <tr><td colspan="3" class="sec-title">Actif immobilisé (Cl. 2)</td></tr>
      @foreach($immobilise as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format($r->solde, 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($immobilise->sum('solde'), 0, ',', ' ') }} F</td>
      </tr>
      @endif

      @if($stocks->count() > 0)
      <tr><td colspan="3" class="sec-title">Stocks (Cl. 3)</td></tr>
      @foreach($stocks as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format($r->solde, 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($stocks->sum('solde'), 0, ',', ' ') }} F</td>
      </tr>
      @endif

      @if($creances->count() > 0)
      <tr><td colspan="3" class="sec-title">Créances (Cl. 4)</td></tr>
      @foreach($creances as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format($r->solde, 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($creances->sum('solde'), 0, ',', ' ') }} F</td>
      </tr>
      @endif

      @if($tresorerie->count() > 0)
      <tr><td colspan="3" class="sec-title">Trésorerie (Cl. 5)</td></tr>
      @foreach($tresorerie as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format($r->solde, 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($tresorerie->sum('solde'), 0, ',', ' ') }} F</td>
      </tr>
      @endif

      @if($perte_actif > 0)
      <tr>
        <td class="code">—</td>
        <td><em>Perte de l'exercice</em></td>
        <td class="amt">{{ number_format($perte_actif, 0, ',', ' ') }} F</td>
      </tr>
      @endif

    </table>
    <div class="col-total actif">
      TOTAL ACTIF
      <span class="t-right">{{ number_format($total_actif, 0, ',', ' ') }} FCFA</span>
    </div>
  </td>

  <!-- ── PASSIF ── -->
  <td>
    <div class="col-hdr passif">PASSIF</div>
    <table class="section-tbl">

      @if($capitaux->count() > 0 || $benefice > 0)
      <tr><td colspan="3" class="sec-title">Capitaux propres (Cl. 1)</td></tr>
      @foreach($capitaux as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format(abs($r->solde), 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      @if($benefice > 0)
      <tr>
        <td class="code">—</td>
        <td><em>Résultat de l'exercice (bénéfice)</em></td>
        <td class="amt">{{ number_format($benefice, 0, ',', ' ') }} F</td>
      </tr>
      @endif
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($total_capitaux, 0, ',', ' ') }} F</td>
      </tr>
      @endif

      @if($dettes->count() > 0)
      <tr><td colspan="3" class="sec-title">Dettes (Cl. 4)</td></tr>
      @foreach($dettes as $r)
      <tr>
        <td class="code">{{ $r->code }}</td>
        <td>{{ $r->name }}</td>
        <td class="amt">{{ number_format(abs($r->solde), 0, ',', ' ') }} F</td>
      </tr>
      @endforeach
      <tr class="sub-row">
        <td class="code"></td><td>Sous-total</td>
        <td class="amt">{{ number_format($total_dettes, 0, ',', ' ') }} F</td>
      </tr>
      @endif

    </table>
    <div class="col-total passif">
      TOTAL PASSIF
      <span class="t-right">{{ number_format($total_passif, 0, ',', ' ') }} FCFA</span>
    </div>
  </td>
</tr>
</tbody>
</table>

@endsection
