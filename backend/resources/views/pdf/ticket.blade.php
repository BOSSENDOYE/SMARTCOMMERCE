{{-- Gabarit ticket 80 mm (imprimante thermique ou classique). DomPDF : pas de flexbox, uniquement des tableaux. --}}
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<style>
  @page { margin: 8px 10px; }
  * { margin: 0; padding: 0; }
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 8.5px; color: #000; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .muted { color: #555; }
  .store { font-size: 11px; font-weight: 700; text-align: center; }
  .store-sub { font-size: 7.5px; text-align: center; color: #333; margin-top: 1px; }
  .title { font-size: 10.5px; font-weight: 700; text-align: center; letter-spacing: 1px; margin: 8px 0 2px; text-transform: uppercase; }
  .ref { text-align: center; font-size: 8px; margin-bottom: 6px; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 1px 0; vertical-align: top; }
  table.kv td.k { color: #444; width: 42%; }
  table.lines th { font-size: 7.5px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 2px 0; text-align: left; }
  table.lines th.right, table.lines td.right { text-align: right; }
  table.lines td { padding: 2px 0; vertical-align: top; }
  table.lines td.detail { font-size: 7.5px; color: #333; padding-top: 0; }
  table.totals td { padding: 1.5px 0; }
  table.totals tr.big td { font-size: 10px; font-weight: 700; border-top: 1px solid #000; padding-top: 3px; }
  .alert { border: 1px solid #000; padding: 3px 4px; margin-top: 5px; font-weight: 700; text-align: center; }
  .notes { margin-top: 4px; font-size: 7.5px; }
  table.sign { margin-top: 18px; }
  table.sign td { width: 50%; text-align: center; font-size: 7.5px; padding-top: 22px; border-top: 1px solid #000; }
  table.sign td.gap { width: 8%; border-top: none; }
  .footer { margin-top: 10px; text-align: center; font-size: 7px; color: #444; }
</style>
</head>
<body>
  <div class="store">{{ $store->name }}</div>
  @if($store->address || $store->phone)
    <div class="store-sub">{{ $store->address }}@if($store->address && $store->phone) · @endif{{ $store->phone }}</div>
  @endif

  <div class="title">{{ $title }}</div>
  <div class="ref">{{ $reference }}</div>
  <div class="sep"></div>

  @yield('content')

  <div class="footer">Imprimé le {{ now()->format('d/m/Y à H:i') }}@isset($printedBy) par {{ $printedBy }}@endisset</div>
</body>
</html>
