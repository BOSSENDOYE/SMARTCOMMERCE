<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre compte est prêt</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #1f2937; }
  .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #059669, #10b981); padding: 32px; text-align: center; }
  .header h1 { color: #fff; font-size: 22px; font-weight: 700; }
  .header p { color: #a7f3d0; font-size: 13px; margin-top: 6px; }
  .body { padding: 32px; }
  .success-badge { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
  .credentials { background: #1f2937; border-radius: 10px; padding: 24px; margin: 24px 0; }
  .credentials h3 { color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
  .cred-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #374151; }
  .cred-row:last-child { border-bottom: none; }
  .cred-label { color: #9ca3af; font-size: 13px; }
  .cred-value { color: #f9fafb; font-size: 13px; font-weight: 700; font-family: monospace; }
  .btn { display: block; background: #059669; color: #fff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 8px; font-weight: 700; font-size: 15px; margin: 24px 0; }
  .warning { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #92400e; margin-top: 16px; }
  .footer { background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>✅ Votre compte est activé !</h1>
    <p>SmartCommerce — Plateforme Senbaobab</p>
  </div>
  <div class="body">
    <p style="font-size:15px;margin-bottom:16px">Bonjour <strong>{{ $contactName }}</strong>,</p>

    <div class="success-badge">
      🎉 Votre demande pour <strong>{{ $companyName }}</strong> a été approuvée.<br>
      Votre espace SmartCommerce est maintenant disponible.
    </div>

    <div class="credentials">
      <h3>🔐 Vos identifiants de connexion</h3>
      <div class="cred-row">
        <span class="cred-label">URL de connexion</span>
        <span class="cred-value">{{ $appUrl }}/login</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Email</span>
        <span class="cred-value">{{ $email }}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Mot de passe</span>
        <span class="cred-value">{{ $password }}</span>
      </div>
    </div>

    <a href="{{ $appUrl }}/login" class="btn">
      Accéder à mon espace SmartCommerce →
    </a>

    <div class="warning">
      ⚠️ <strong>Important :</strong> Changez votre mot de passe dès votre première connexion.<br>
      Conservez ces informations en lieu sûr.
    </div>

    <p style="margin-top:24px;font-size:13px;color:#6b7280">
      Pour toute question, contactez notre support à <a href="mailto:contact@senbaobab.com" style="color:#059669">contact@senbaobab.com</a>
    </p>
  </div>
  <div class="footer">
    SmartCommerce · Plateforme Senbaobab · no-reply@senbaobab.com<br>
    Cet email est automatique, ne pas répondre.
  </div>
</div>
</body>
</html>
