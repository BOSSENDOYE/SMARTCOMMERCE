{{-- Bon de dotation : ce que le livreur emporte, à sa charge (prix livreur) --}}
@extends('pdf.ticket')

@section('content')
  <table class="kv">
    <tr><td class="k">Livreur</td><td class="bold">{{ $round->courier->name }}</td></tr>
    @if($round->courier->phone)<tr><td class="k">Téléphone</td><td>{{ $round->courier->phone }}</td></tr>@endif
    @if($round->courier->zone)<tr><td class="k">Zone</td><td>{{ $round->courier->zone }}</td></tr>@endif
    <tr><td class="k">Tournée du</td><td>{{ $round->round_date->format('d/m/Y') }}</td></tr>
  </table>
  <div class="sep"></div>

  <table class="lines">
    <thead><tr><th>Produit</th><th class="right">Qté</th><th class="right">P.U.</th><th class="right">Montant</th></tr></thead>
    <tbody>
      @foreach($items as $item)
        <tr>
          <td>{{ $item->product->name }}</td>
          <td class="right bold">{{ number_format($item->qty_out, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($item->unit_price, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($item->qty_out * $item->unit_price, 0, ',', ' ') }}</td>
        </tr>
      @endforeach
    </tbody>
  </table>
  <div class="sep"></div>

  <table class="totals">
    <tr><td>Articles confiés</td><td class="right bold">{{ number_format($items->sum('qty_out'), 0, ',', ' ') }}</td></tr>
    <tr class="big"><td>Valeur à rendre</td><td class="right">{{ number_format($value, 0, ',', ' ') }} F</td></tr>
  </table>

  @if($history->isNotEmpty())
    <div class="sep"></div>
    <div class="bold" style="margin-bottom:2px">Remises</div>
    <table class="lines">
      @foreach($history as $h)
        <tr>
          <td>{{ $h->created_at->format('H:i') }} · {{ $h->product->name }}</td>
          <td class="right">{{ $h->destination_round_id === $round->id ? '+' : '−' }}{{ number_format($h->qty, 0, ',', ' ') }}</td>
        </tr>
      @endforeach
    </table>
  @endif

  <div class="notes">Le livreur rend compte en fin de tournée de ses ventes (au prix livreur) et rapporte ses invendus.</div>

  <table class="sign"><tr><td>Le livreur</td><td class="gap"></td><td>Le responsable</td></tr></table>
@endsection
