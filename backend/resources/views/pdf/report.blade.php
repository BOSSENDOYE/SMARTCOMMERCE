@extends('pdf.layout')

@section('content')

<!-- ── En-tête ─────────────────────────────────────────────────────────── -->
<div class="header">
  <div class="header-left">
    <div class="company-name">{{ $store->name }}</div>
    <div class="company-sub">
      @if($store->address){{ $store->address }}<br>@endif
      @if($store->phone)Tél : {{ $store->phone }}@endif
    </div>
  </div>
  <div class="header-right">
    <div class="doc-type" style="font-size:16px;">{{ $title }}</div>
    @if($subtitle ?? null)
    <div class="doc-ref">{{ $subtitle }}</div>
    @endif
    <div class="doc-ref" style="margin-top:4px;">Période : {{ $period['from'] }} → {{ $period['to'] }}</div>
  </div>
</div>

<!-- ── KPIs ────────────────────────────────────────────────────────────── -->
@if(!empty($kpis))
<div class="kpi-grid">
  @foreach($kpis as $kpi)
  <div class="kpi-box">
    <div class="kpi-label">{{ $kpi['label'] }}</div>
    <div class="kpi-value">{{ $kpi['value'] }}</div>
    @if(isset($kpi['sub']))<div class="kpi-sub">{{ $kpi['sub'] }}</div>@endif
  </div>
  @endforeach
</div>
@endif

<!-- ── Tableau ─────────────────────────────────────────────────────────── -->
@if(!empty($rows))
<table class="report">
  <thead>
    <tr>
      @foreach($columns as $col)
        <th class="{{ ($col['align'] ?? 'left') === 'right' ? 'right' : '' }}">{{ $col['label'] }}</th>
      @endforeach
    </tr>
  </thead>
  <tbody>
    @foreach($rows as $row)
    <tr>
      @foreach($columns as $col)
        <td class="{{ ($col['align'] ?? 'left') === 'right' ? 'right' : '' }}">
          {{ $row[$col['key']] ?? '—' }}
        </td>
      @endforeach
    </tr>
    @endforeach
  </tbody>
  @if(!empty($totals))
  <tfoot>
    <tr>
      @foreach($columns as $col)
        <td class="{{ ($col['align'] ?? 'left') === 'right' ? 'right' : '' }}">
          {{ $totals[$col['key']] ?? '' }}
        </td>
      @endforeach
    </tr>
  </tfoot>
  @endif
</table>
@else
  <p style="text-align:center; color:#9ca3af; margin: 30px 0;">Aucune donnée pour la période sélectionnée.</p>
@endif

@endsection
