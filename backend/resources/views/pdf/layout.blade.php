<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 10px; color: #1a1a2e; background: #fff; }

  /* Page */
  .page { padding: 30px 36px; min-height: 100%; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #002f59; padding-bottom: 18px; }
  .header-left .company-name { font-size: 18px; font-weight: 700; color: #002f59; }
  .header-left .company-sub  { font-size: 9px; color: #666; margin-top: 2px; line-height: 1.5; }
  .header-right { text-align: right; }
  .doc-type { font-size: 22px; font-weight: 700; color: #002f59; text-transform: uppercase; letter-spacing: 1px; }
  .doc-ref  { font-size: 11px; color: #555; margin-top: 4px; }
  .doc-status { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 9px; font-weight: 700; margin-top: 5px; }

  /* Status colors */
  .status-draft    { background: #f3f4f6; color: #6b7280; }
  .status-sent     { background: #dbeafe; color: #1d4ed8; }
  .status-paid     { background: #d1fae5; color: #065f46; }
  .status-partial  { background: #fef3c7; color: #92400e; }
  .status-overdue  { background: #fee2e2; color: #991b1b; }
  .status-cancelled{ background: #f3f4f6; color: #9ca3af; }
  .status-accepted { background: #d1fae5; color: #065f46; }

  /* Parties */
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .party-box { width: 46%; }
  .party-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px; }
  .party-name  { font-size: 12px; font-weight: 700; color: #111; }
  .party-sub   { font-size: 9px; color: #555; line-height: 1.6; margin-top: 2px; }

  /* Meta (dates, objet) */
  .meta-grid { display: flex; gap: 12px; margin-bottom: 20px; background: #f8fafc; border-radius: 6px; padding: 10px 14px; }
  .meta-item { flex: 1; }
  .meta-item .meta-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; }
  .meta-item .meta-value { font-size: 10px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }

  /* Object */
  .obj-row { margin-bottom: 16px; font-size: 10px; }
  .obj-row strong { color: #002f59; }

  /* Table */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.items thead th { background: #002f59; color: #fff; padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  table.items thead th.right { text-align: right; }
  table.items tbody tr:nth-child(even) { background: #f8fafc; }
  table.items tbody td { padding: 7px 10px; font-size: 9.5px; color: #333; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.items tbody td.right { text-align: right; }
  table.items tbody td.muted { color: #9ca3af; font-size: 8.5px; }

  /* Totaux */
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { width: 240px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 9.5px; border-bottom: 1px solid #f0f0f0; }
  .totals-row .label { color: #555; }
  .totals-row .val   { font-weight: 600; color: #111; }
  .totals-total { display: flex; justify-content: space-between; padding: 8px 10px; background: #002f59; color: #fff; border-radius: 4px; margin-top: 6px; }
  .totals-total .label { font-size: 10px; font-weight: 700; }
  .totals-total .val   { font-size: 12px; font-weight: 700; }

  /* Paiements */
  .payments-section { margin-bottom: 18px; }
  .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #002f59; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table.payments { width: 100%; border-collapse: collapse; }
  table.payments td { padding: 5px 8px; font-size: 9px; border-bottom: 1px solid #f0f0f0; }
  table.payments td.right { text-align: right; }

  /* Balance */
  .balance-row { display: flex; justify-content: flex-end; margin-top: 6px; }
  .balance-box { padding: 6px 12px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .balance-paid  { background: #d1fae5; color: #065f46; }
  .balance-due   { background: #fee2e2; color: #991b1b; }

  /* Notes / Conditions */
  .notes-section { margin-bottom: 14px; }
  .notes-text { font-size: 9px; color: #555; line-height: 1.6; background: #f8fafc; border-left: 3px solid #002f59; padding: 8px 10px; border-radius: 0 4px 4px 0; }

  /* Footer */
  .footer { border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 20px; text-align: center; font-size: 8px; color: #9ca3af; }

  /* Report specific */
  table.report { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.report thead th { background: #002f59; color: #fff; padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; }
  table.report thead th.right { text-align: right; }
  table.report tbody tr:nth-child(even) { background: #f8fafc; }
  table.report tbody td { padding: 6px 10px; font-size: 9.5px; color: #333; border-bottom: 1px solid #e5e7eb; }
  table.report tbody td.right { text-align: right; }
  table.report tfoot td { padding: 7px 10px; font-weight: 700; font-size: 10px; background: #f1f5f9; border-top: 2px solid #002f59; }
  table.report tfoot td.right { text-align: right; }

  .kpi-grid { display: flex; gap: 12px; margin-bottom: 20px; }
  .kpi-box { flex: 1; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
  .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
  .kpi-value { font-size: 14px; font-weight: 700; color: #002f59; }
  .kpi-sub   { font-size: 8px; color: #9ca3af; margin-top: 2px; }
</style>
</head>
<body>
<div class="page">
  @yield('content')
  <div class="footer">
    {{ $store->name ?? '' }} @if(!empty($store->address)) — {{ $store->address }} @endif
    @if(!empty($store->phone)) — {{ $store->phone }} @endif
    @if(!empty($store->email)) — {{ $store->email }} @endif
    @if(!empty($store->ninea)) | NINEA : {{ $store->ninea }} @endif
    @if(!empty($store->rc)) | RC : {{ $store->rc }} @endif
    <br>Document généré le {{ now()->format('d/m/Y à H:i') }}
  </div>
</div>
</body>
</html>
