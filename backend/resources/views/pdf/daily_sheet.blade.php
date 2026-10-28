{{-- Fiche journalière A4 paysage, même présentation que la fiche papier. DomPDF : tableaux uniquement. --}}
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<style>
  @page { margin: 18px 20px; }
  * { margin: 0; padding: 0; }
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 8px; color: #000; }
  .title { font-size: 14px; font-weight: 700; text-align: center; border: 1.5px solid #000; padding: 5px; text-transform: uppercase; }
  .subtitle { text-align: center; font-size: 9px; margin: 4px 0 8px; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 2px 3px; }
  table.grid th { font-size: 7.5px; text-transform: uppercase; background: #eee; }
  table.grid th.shift { font-size: 9px; background: #ddd; }
  table.grid td.product { font-weight: 700; white-space: nowrap; }
  table.grid td.num { text-align: right; }
  table.grid td.gap { text-align: right; font-weight: 700; }
  table.grid td.flag { background: #f3c9c9; }
  table.grid tr.cat td { background: #f6f6f6; font-weight: 700; font-size: 7.5px; text-transform: uppercase; }
  table.grid tr.total td { font-weight: 700; background: #eee; }
  .shift-info { font-size: 7px; font-weight: 400; text-transform: none; }
  table.sign { width: 100%; margin-top: 14px; }
  table.sign td { width: 33%; text-align: center; font-size: 8px; padding-top: 26px; }
  table.sign span { border-top: 1px solid #000; padding: 0 30px; }
  .footer { margin-top: 6px; font-size: 7px; color: #444; text-align: right; }
</style>
</head>
<body>
  <div class="title">{{ $store->name }}</div>
  <div class="subtitle">
    FICHE JOURNALIÈRE du <b>{{ $date->translatedFormat('l d F Y') }}</b>
    @unless($blank) · Tolérance d'écart : {{ rtrim(rtrim(number_format($tolerance['pct'], 2, ',', ''), '0'), ',') }} % ou {{ rtrim(rtrim(number_format($tolerance['qty'], 2, ',', ''), '0'), ',') }} pièce(s) @endunless
  </div>

  @php $cols = $blank ? ['Ajouté', 'Reste', 'Total'] : ['Ajouté', 'Vendu', 'Reste', 'Écart', 'Total']; @endphp

  <table class="grid">
    <thead>
      <tr>
        <th rowspan="2" style="width:15%">Produits</th>
        <th rowspan="2" style="width:4%">Prix</th>
        @foreach($shifts as $s)
          <th class="shift" colspan="{{ count($cols) }}">
            {{ $s['label'] }}
            @if(!$blank && !empty($s['responsible']))
              <div class="shift-info">{{ $s['responsible'] }}{{ $s['hours'] ? ' · ' . $s['hours'] : '' }}</div>
            @endif
          </th>
        @endforeach
      </tr>
      <tr>
        @foreach($shifts as $s)
          @foreach($cols as $c)<th>{{ $c }}</th>@endforeach
        @endforeach
      </tr>
    </thead>
    <tbody>
      @php $currentCategory = null; @endphp
      @foreach($products as $p)
        @if($p['category'] !== $currentCategory)
          @php $currentCategory = $p['category']; @endphp
          <tr class="cat"><td colspan="{{ 2 + count($cols) * count($shifts) }}">{{ $currentCategory ?? 'Autres' }}</td></tr>
        @endif
        <tr>
          <td class="product">{{ $p['name'] }}</td>
          <td class="num">{{ number_format($p['price'], 0, ',', ' ') }}</td>
          @foreach($shifts as $s)
            @php $l = $s['lines'][$p['id']] ?? null; @endphp
            @if($blank)
              <td></td><td></td><td></td>
            @else
              <td class="num">{{ $l && $l['added'] ? number_format($l['added'], 0, ',', ' ') : '' }}</td>
              <td class="num">{{ $l && $l['sold'] ? number_format($l['sold'], 0, ',', ' ') : '' }}</td>
              <td class="num">{{ $l && $l['remaining'] !== null ? number_format($l['remaining'], 0, ',', ' ') : '' }}</td>
              <td class="gap {{ $l && $l['over_tolerance'] ? 'flag' : '' }}">{{ $l && $l['gap'] ? number_format($l['gap'], 0, ',', ' ') : '' }}</td>
              <td></td>
            @endif
          @endforeach
        </tr>
      @endforeach
      @unless($blank)
        <tr class="total">
          <td colspan="2">Totaux</td>
          @foreach($shifts as $s)
            <td class="num">{{ number_format($s['totals']['added'] ?? 0, 0, ',', ' ') }}</td>
            <td class="num">{{ number_format($s['totals']['sold'] ?? 0, 0, ',', ' ') }}</td>
            <td></td>
            <td class="num">{{ ($s['totals']['gap_value'] ?? 0) > 0 ? number_format($s['totals']['gap_value'], 0, ',', ' ') . ' F' : '' }}</td>
            <td></td>
          @endforeach
        </tr>
      @endunless
    </tbody>
  </table>

  <table class="sign">
    <tr>
      @foreach($shifts as $s)
        <td><span>Responsable {{ strtolower($s['label']) }}{{ !$blank && !empty($s['responsible']) ? ' : ' . $s['responsible'] : '' }}</span></td>
      @endforeach
    </tr>
  </table>

  <div class="footer">
    @unless($blank)Écart = attendu (départ + ajouté − vendu en caisse ± autres mouvements) − reste compté ; en rouge : au-delà de la tolérance. @endunless
    Imprimé le {{ now()->format('d/m/Y à H:i') }}
  </div>
</body>
</html>
