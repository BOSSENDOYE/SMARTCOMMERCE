{{-- Reçu de clôture de tournée : vendu, rendu, versé, manquant --}}
@extends('pdf.ticket')

@section('content')
  <table class="kv">
    <tr><td class="k">Livreur</td><td class="bold">{{ $round->courier->name }}</td></tr>
    <tr><td class="k">Tournée du</td><td>{{ $round->round_date->format('d/m/Y') }}</td></tr>
    <tr><td class="k">Clôturée le</td><td>{{ $round->settled_at?->format('d/m/Y H:i') }}</td></tr>
    @if($round->sale)<tr><td class="k">Vente</td><td>{{ $round->sale->reference }}</td></tr>@endif
  </table>
  <div class="sep"></div>

  <table class="lines">
    <thead><tr><th>Produit</th><th class="right">Conf.</th><th class="right">Rendu</th><th class="right">Vendu</th><th class="right">Dû</th></tr></thead>
    <tbody>
      @foreach($round->items as $item)
        @php $sold = $item->qty_given - $item->qty_returned; @endphp
        <tr>
          <td>{{ $item->product->name }}</td>
          <td class="right">{{ number_format($item->qty_given, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($item->qty_returned, 0, ',', ' ') }}</td>
          <td class="right bold">{{ number_format($sold, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($sold * $item->unit_price, 0, ',', ' ') }}</td>
        </tr>
        <tr><td colspan="5" class="detail">{{ number_format($item->unit_price, 0, ',', ' ') }} F / unité</td></tr>
      @endforeach
    </tbody>
  </table>
  <div class="sep"></div>

  @php $gap = round($round->amount_due - $round->amount_paid, 2); @endphp
  <table class="totals">
    <tr><td>Montant dû</td><td class="right">{{ number_format($round->amount_due, 0, ',', ' ') }} F</td></tr>
    <tr><td>Versé{{ $methods ? ' (' . $methods . ')' : '' }}</td><td class="right">{{ number_format($round->amount_paid, 0, ',', ' ') }} F</td></tr>
    @if($extra > 0)<tr><td>Dont remboursement de manquant</td><td class="right">{{ number_format($extra, 0, ',', ' ') }} F</td></tr>@endif
    <tr class="big"><td>{{ $gap > 0 ? 'Manquant de la tournée' : 'Tournée soldée' }}</td><td class="right">{{ $gap > 0 ? number_format($gap, 0, ',', ' ') . ' F' : '✓' }}</td></tr>
  </table>

  @if($debt > 0)
    <div class="alert">Manquant cumulé du livreur : {{ number_format($debt, 0, ',', ' ') }} F</div>
  @endif
  @if($round->notes)<div class="notes">{{ $round->notes }}</div>@endif

  <table class="sign"><tr><td>Le livreur</td><td class="gap"></td><td>Le responsable</td></tr></table>
@endsection
