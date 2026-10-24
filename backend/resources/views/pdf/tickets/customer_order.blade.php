{{-- Bon de commande client : à remettre au client, à présenter au retrait --}}
@extends('pdf.ticket')

@section('content')
  <table class="kv">
    <tr><td class="k">Client</td><td class="bold">{{ $order->customer_name }}</td></tr>
    @if($order->customer_phone)<tr><td class="k">Téléphone</td><td>{{ $order->customer_phone }}</td></tr>@endif
    <tr><td class="k">Commandé le</td><td>{{ $order->created_at->format('d/m/Y H:i') }}</td></tr>
  </table>
  <div class="alert">RETRAIT LE {{ $order->pickup_at->format('d/m/Y') }} À {{ $order->pickup_at->format('H:i') }}</div>
  <div class="sep"></div>

  <table class="lines">
    <thead><tr><th>Article</th><th class="right">Qté</th><th class="right">P.U.</th><th class="right">Total</th></tr></thead>
    <tbody>
      @foreach($order->items as $item)
        <tr>
          <td>{{ $item->product->name }}</td>
          <td class="right">{{ number_format($item->qty, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($item->unit_price_ttc, 0, ',', ' ') }}</td>
          <td class="right">{{ number_format($item->total_ttc, 0, ',', ' ') }}</td>
        </tr>
        @if($item->details)<tr><td colspan="4" class="detail">✎ {{ $item->details }}</td></tr>@endif
      @endforeach
    </tbody>
  </table>
  <div class="sep"></div>

  <table class="totals">
    <tr><td>Total</td><td class="right bold">{{ number_format($order->total_ttc, 0, ',', ' ') }} F</td></tr>
    @foreach($order->payments as $p)
      <tr>
        <td class="muted">{{ $p->amount < 0 ? 'Remboursement' : 'Acompte' }} {{ $p->paid_at->format('d/m') }} ({{ $methodLabels[$p->payment_method] ?? $p->payment_method }})</td>
        <td class="right">{{ number_format($p->amount, 0, ',', ' ') }} F</td>
      </tr>
    @endforeach
    <tr class="big"><td>{{ $order->status === 'delivered' ? 'Soldé' : 'Reste à payer' }}</td><td class="right">{{ number_format($order->balance, 0, ',', ' ') }} F</td></tr>
  </table>

  @if($order->status === 'cancelled')<div class="alert">COMMANDE ANNULÉE</div>@endif
  @if($order->notes)<div class="notes">Note : {{ $order->notes }}</div>@endif
  <div class="notes center" style="margin-top:8px">Merci de présenter ce bon lors du retrait.</div>
@endsection
