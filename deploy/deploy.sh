#!/bin/bash
# ─── Script de déploiement Baobab en production ───────────────────────────────
# Usage : bash deploy/deploy.sh
# Lancer depuis la racine du projet : SMARTCOMMERCE/

set -e  # Arrêter si une commande échoue

echo "🌳 Déploiement Baobab SmartCommerce..."
echo "======================================="

# ── 1. Backend Laravel ────────────────────────────────────────────────────────
echo ""
echo "📦 [1/5] Backend Laravel..."

cd backend

# Mettre à jour les dépendances
composer install --no-dev --optimize-autoloader

# Vider et optimiser les caches Laravel
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# Appliquer les migrations
php artisan migrate --force

# Vider le cache Spatie permissions
php artisan permission:cache-reset

# Permissions sur les dossiers storage
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

echo "✅ Backend prêt"

# ── 2. Frontend React (PWA) ───────────────────────────────────────────────────
echo ""
echo "⚛️  [2/5] Build frontend React PWA..."

cd ../frontend

# Installer les dépendances
npm ci

# Build de production (génère dist/ avec le service worker Workbox)
npm run build

echo "✅ Frontend buildé → dist/"

# ── 3. Vérifications ──────────────────────────────────────────────────────────
echo ""
echo "🔍 [3/5] Vérifications..."

# Vérifier que le service worker a bien été généré
if [ -f "dist/sw.js" ]; then
  echo "✅ Service Worker : dist/sw.js présent"
else
  echo "⚠️  Service Worker non trouvé dans dist/"
fi

# Vérifier le manifest
if [ -f "dist/manifest.webmanifest" ]; then
  echo "✅ Manifest PWA : dist/manifest.webmanifest présent"
else
  echo "⚠️  Manifest PWA non trouvé dans dist/"
fi

echo ""
echo "======================================="
echo "🌳 Déploiement terminé !"
echo ""
echo "📋 Prochaines étapes manuelles :"
echo "   1. Copier frontend/dist/ vers DocumentRoot Apache"
echo "   2. Vérifier que HTTPS est configuré (obligatoire pour PWA)"
echo "   3. Redémarrer Apache : sudo systemctl restart apache2"
echo "   4. Tester l'installation PWA depuis Chrome/Edge"
echo ""
echo "💡 Tester en local sans déployer :"
echo "   cd frontend && npm run preview"
echo "   → Ouvre http://localhost:4173"
