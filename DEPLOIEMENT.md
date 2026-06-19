# Guide de déploiement — Baobab SmartCommerce

| Composant | Domaine | Répertoire cPanel |
|-----------|---------|-------------------|
| API Laravel | `apibaobab.lamadoneadn.com` | `/public_html/apibaobab/` |
| Frontend React | `baobab.lamadoneadn.com` | `/public_html/baobab/` |

---

## 1. Base de données (cPanel → MySQL Databases)

1. Créer une base : `lamadone_smartcommerce` (ou au choix)
2. Créer un utilisateur MySQL + mot de passe fort
3. Lui accorder **tous les privilèges** sur la base
4. Noter : hôte, base, utilisateur, mot de passe

---

## 2. Backend — API Laravel

### 2.1 Fichiers à uploader (FTP/FileManager)

Uploader le dossier **`backend/`** COMPLET dans `/public_html/apibaobab/`  
*(sauf `.git/`, `node_modules/`, `tests/`, `*.test.*`)*

Structure finale sur le serveur :
```
/public_html/apibaobab/
  ├── .htaccess          ← redirige vers public/ ✓
  ├── .env               ← à créer (voir 2.2)
  ├── app/
  ├── bootstrap/
  ├── config/
  ├── database/
  ├── public/
  │   ├── index.php
  │   └── .htaccess
  ├── resources/
  ├── routes/
  ├── storage/
  └── vendor/
```

### 2.2 Créer le fichier `.env` sur le serveur

Copier `.env.production` → `.env` et remplir les valeurs :

```env
APP_NAME="Baobab SmartCommerce"
APP_ENV=production
APP_KEY=                    # ← générer ci-dessous
APP_DEBUG=false
APP_URL=https://apibaobab.lamadoneadn.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=lamadone_smartcommerce
DB_USERNAME=lamadone_dbuser
DB_PASSWORD=MOT_DE_PASSE_ICI

SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=none

CACHE_STORE=file
QUEUE_CONNECTION=sync

SANCTUM_STATEFUL_DOMAINS=baobab.lamadoneadn.com
```

### 2.3 Commandes via Terminal cPanel (ou SSH)

```bash
cd /public_html/apibaobab

# 1. Générer la clé applicative
php artisan key:generate

# 2. Lancer les migrations
php artisan migrate --force

# 3. Lien symbolique storage
php artisan storage:link

# 4. Vider les caches
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 5. Permissions
chmod -R 755 storage bootstrap/cache
chmod -R 644 storage/logs
```

### 2.4 Vérifier que l'API répond

Ouvrir dans le navigateur :
```
https://apibaobab.lamadoneadn.com/api/v1/auth/login
```
→ Doit retourner une erreur JSON (405 Method Not Allowed ou 422), pas une page 500.

---

## 3. Frontend — React / Vite

### 3.1 Build de production (local)

```bash
cd frontend
npx vite build
```
Le dossier `frontend/dist/` est généré.

### 3.2 Fichiers à uploader

Uploader le contenu de **`frontend/dist/`** dans `/public_html/baobab/`

```
/public_html/baobab/
  ├── .htaccess              ← SPA routing ✓
  ├── index.html
  ├── manifest.webmanifest   ← PWA
  ├── sw.js                  ← Service Worker PWA
  ├── icon-192.png
  ├── icon-512.png
  └── assets/
      ├── index-[hash].js
      └── index-[hash].css
```

### 3.3 Vérifier

Ouvrir `https://baobab.lamadoneadn.com` → page de login Baobab.

---

## 4. HTTPS (SSL)

Dans cPanel → **SSL/TLS** → **AutoSSL** (Let's Encrypt gratuit) :
- Activer pour `apibaobab.lamadoneadn.com`
- Activer pour `baobab.lamadoneadn.com`

> L'SSL est **obligatoire** pour la PWA (install Chrome) et pour les cookies sécurisés.

---

## 5. Checklist finale

- [ ] Base de données créée et identifiants dans `.env`
- [ ] `php artisan key:generate` exécuté
- [ ] `php artisan migrate --force` sans erreur
- [ ] `php artisan storage:link` exécuté
- [ ] SSL actif sur les 2 sous-domaines
- [ ] `https://apibaobab.lamadoneadn.com/api/v1/auth/login` répond en JSON
- [ ] `https://baobab.lamadoneadn.com` charge la page de login
- [ ] Connexion avec un compte test fonctionnelle
- [ ] Chrome affiche la bannière d'installation PWA

---

## 6. Mises à jour futures

### Backend
```bash
# FTP : uploader les fichiers modifiés
cd /public_html/apibaobab
php artisan migrate --force
php artisan config:cache
php artisan route:cache
```

### Frontend
```bash
# Local
cd frontend && npx vite build
# FTP : uploader le contenu de dist/ (écraser l'existant)
```
