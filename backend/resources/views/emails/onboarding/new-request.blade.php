<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nouvelle demande d'onboarding</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #1f2937; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 32px; text-align: center; }
  .header h1 { color: #fff; font-size: 22px; font-weight: 700; }
  .header p { color: #bfdbfe; font-size: 13px; margin-top: 6px; }
  .body { padding: 32px; }
  .alert-badge { display: inline-flex; align-items: center; gap: 8px; background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .card h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 12px; }
  .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .field:last-child { border-bottom: none; }
  .field .label { color: #6b7280; }
  .field .value { font-weight: 600; color: #1f2937; text-align: right; }
  .btn { display: block; background: #1d4ed8; color: #fff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 8px; font-weight: 700; font-size: 15px; margin: 24px 0; }
  .footer { background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🔔 Nouvelle demande d'inscription</h1>
    <p>SmartCommerce — Plateforme Senbaobab</p>
  </div>
  <div class="body">
    <div class="alert-badge">
      ⚡ Action requise — Demande en attente de validation
    </div>

    <div class="card">
      <h3>Entreprise</h3>
      <div class="field"><span class="label">Nom</span><span class="value">{{ $req->company_name }}</span></div>
      <div class="field"><span class="label">Type d'activité</span><span class="value">{{ $req->activity_type }}</span></div>
      <div class="field"><span class="label">Ville</span><span class="value">{{ $req->city ?? '—' }}</span></div>
    </div>

    <div class="card">
      <h3>Contact</h3>
      <div class="field"><span class="label">Nom</span><span class="value">{{ $req->contact_name }}</span></div>
      <div class="field"><span class="label">Email</span><span class="value">{{ $req->email }}</span></div>
      <div class="field"><span class="label">Téléphone</span><span class="value">{{ $req->phone }}</span></div>
    </div>

    @if($req->plan_slug)
    <div class="card">
      <h3>Abonnement souhaité</h3>
      <div class="field"><span class="label">Plan</span><span class="value">{{ ucfirst($req->plan_slug) }}</span></div>
      @if($req->duration_months)
      <div class="field"><span class="label">Durée</span><span class="value">{{ $req->duration_months }} mois</span></div>
      @endif
    </div>
    @endif

    @if($req->notes)
    <div class="card">
      <h3>Notes</h3>
      <p style="font-size:14px;color:#374151;line-height:1.6">{{ $req->notes }}</p>
    </div>
    @endif

    <a href="{{ config('app.url') }}/superadmin/requests" class="btn">
      Traiter la demande dans le panneau SuperAdmin →
    </a>

    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Demande reçue le {{ $req->created_at->format('d/m/Y à H:i') }}
    </p>
  </div>
  <div class="footer">
    SmartCommerce · Plateforme Senbaobab · no-reply@senbaobab.com<br>
    Cet email est automatique, ne pas répondre.
  </div>
</div>
</body>
</html>
