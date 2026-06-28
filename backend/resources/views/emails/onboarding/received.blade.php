<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demande reçue</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #1f2937; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 32px; text-align: center; }
  .header h1 { color: #fff; font-size: 22px; font-weight: 700; }
  .header p { color: #bfdbfe; font-size: 13px; margin-top: 6px; }
  .body { padding: 32px; }
  .badge { display: inline-flex; align-items: center; gap: 8px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .card h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 12px; }
  .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .field:last-child { border-bottom: none; }
  .field .label { color: #6b7280; }
  .field .value { font-weight: 600; color: #1f2937; text-align: right; }
  .steps { counter-reset: step; }
  .step { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
  .step:last-child { border-bottom: none; }
  .step-num { width: 28px; height: 28px; background: #1d4ed8; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .step-text { font-size: 14px; color: #374151; padding-top: 4px; }
  .footer { background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>✅ Demande bien reçue !</h1>
    <p>SmartCommerce — Plateforme Senbaobab</p>
  </div>
  <div class="body">
    <p style="font-size:15px;margin-bottom:16px">Bonjour <strong>{{ $req->contact_name }}</strong>,</p>

    <div class="badge">
      📋 Votre demande d'inscription a été enregistrée avec succès
    </div>

    <div class="card">
      <h3>Récapitulatif de votre demande</h3>
      <div class="field"><span class="label">Entreprise</span><span class="value">{{ $req->company_name }}</span></div>
      <div class="field"><span class="label">Activité</span><span class="value">{{ $req->activity_type }}</span></div>
      <div class="field"><span class="label">Contact</span><span class="value">{{ $req->email }}</span></div>
      @if($req->plan_slug)
      <div class="field"><span class="label">Plan souhaité</span><span class="value">{{ ucfirst($req->plan_slug) }}</span></div>
      @endif
      <div class="field"><span class="label">Date de dépôt</span><span class="value">{{ $req->created_at->format('d/m/Y à H:i') }}</span></div>
    </div>

    <div class="card">
      <h3>Prochaines étapes</h3>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-text"><strong>Examen de votre dossier</strong> — Notre équipe examine votre demande sous 24 à 48h ouvrées.</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text"><strong>Activation de votre compte</strong> — Vous recevrez vos identifiants de connexion par email dès validation.</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text"><strong>Configuration</strong> — Connectez-vous et configurez votre magasin selon votre activité.</div>
        </div>
      </div>
    </div>

    <p style="font-size:13px;color:#6b7280;margin-top:8px">
      Pour toute question, contactez-nous à <a href="mailto:contact@senbaobab.com" style="color:#1d4ed8">contact@senbaobab.com</a>
    </p>
  </div>
  <div class="footer">
    SmartCommerce · Plateforme Senbaobab · no-reply@senbaobab.com<br>
    Cet email est automatique, ne pas répondre.
  </div>
</div>
</body>
</html>
