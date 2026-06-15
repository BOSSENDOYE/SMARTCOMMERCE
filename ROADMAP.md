# SmartCommerce — Tâches restantes

> Dernière mise à jour : 14 juin 2026
> État global du projet : **~85% complété**

---

## 🔴 Priorité haute

### Export PDF ✅
- [x] Génération PDF des factures client (barryvdh/laravel-dompdf)
- [x] Génération PDF des devis (quotes)
- [x] Export PDF des rapports (ventes produit, caissier, catégorie, stock, fournisseurs, crédit clients)
- [x] Bouton "Télécharger PDF" dans InvoicesPage (liste + panneau détail)
- [x] Bouton "Télécharger PDF" dans ReportsPage (par onglet)
- [x] Templates Blade professionnels (layout, invoice, quote, report)
- [x] Fonction `downloadPdf()` réutilisable dans `lib/format.ts`
- [ ] Export PDF du bilan comptable et compte de résultat (AccountingPage)

### Envoi Email / SMS
- [ ] Intégration mailer Laravel (SMTP / Mailgun / SendGrid)
- [ ] Envoi de la facture par email depuis InvoicesPage
- [ ] Envoi des relances automatiques (1ère, 2e, finale) par email
- [ ] Notifications SMS pour commandes restaurant (confirmation réservation)
- [ ] Template d'email configurable dans PrintTemplatesPage

### Intégration paiements mobiles
- [ ] API Wave Money (Sénégal) — initiation et confirmation de paiement
- [ ] API Orange Money — initiation et confirmation de paiement
- [ ] Webhook de confirmation de paiement (côté backend)
- [ ] Statut en temps réel dans le POS après scan QR

### Authentification 2FA
- [ ] Génération OTP (TOTP via Google Authenticator)
- [ ] Activation/désactivation 2FA dans ProfilePage
- [ ] Vérification OTP au login
- [ ] Codes de secours (backup codes)

---

## 🟡 Priorité moyenne

### Export Excel / CSV
- [ ] Export Excel des ventes (SalesPage)
- [ ] Export Excel du stock (StockPage)
- [ ] Export Excel des achats (PurchasesPage)
- [ ] Export Excel des clients (ClientsPage)
- [ ] Export CSV du journal comptable
- [ ] Export CSV des leads CRM

### Dashboard avancé
- [ ] Comparaison CA mois en cours vs mois précédent
- [ ] Comparaison CA année en cours vs année précédente
- [ ] Prévisions de ventes (tendance 30 jours)
- [ ] Widget "Factures en retard" avec montant total
- [ ] Widget "Stock critique" cliquable (lien vers StockPage filtrée)
- [ ] KPI marge brute en temps réel

### Notifications in-app
- [ ] Système de notifications (badge cloche dans AppLayout)
- [ ] Alerte stock critique (seuil configurable par produit)
- [ ] Alerte produits expirant dans les 7 jours
- [ ] Alerte factures en retard (overdue)
- [ ] Notification à la réception d'un transfert inter-magasin
- [ ] Centre de notifications avec historique

### Plan d'étage restaurant (drag & drop)
- [ ] Repositionnement des tables par drag & drop
- [ ] Redimensionnement des tables
- [ ] Sauvegarde des positions en base (colonne `x, y, width, height`)
- [ ] Mode édition / mode service (toggle)

### Rapports avancés
- [ ] Rapport de rentabilité par produit (CA - coût d'achat)
- [ ] Rapport de performance par vendeur/caissier (avec objectifs)
- [ ] Rapport de fidélité clients (points gagnés/utilisés par période)
- [ ] Rapport CRM (taux de conversion leads, pipeline par commercial)
- [ ] Rapport de dépenses par catégorie (camembert)
- [ ] Filtrage multi-magasin dans tous les rapports (super admin)

---

## 🟢 Priorité basse

### Tests automatisés
- [ ] Tests unitaires PHP (PHPUnit) — modèles Eloquent
- [ ] Tests d'intégration API (Feature tests Laravel)
- [ ] Tests frontend (Vitest / Jest) — composants critiques (POS, panier)
- [ ] Tests E2E (Playwright ou Cypress) — parcours vente POS

### Documentation API
- [ ] Génération Swagger / OpenAPI depuis les routes Laravel
- [ ] Documentation des endpoints dans Postman Collection
- [ ] Guide d'installation et déploiement (README)

### Sécurité & Audit
- [ ] Journal d'audit accessible dans l'interface (AuditLogsPage)
- [ ] Expiration des sessions inactives (configurable)
- [ ] Blocage de compte après X tentatives de connexion échouées
- [ ] Politique de mot de passe configurable (longueur, complexité)

### UX / Interface
- [ ] Mode kiosque POS (plein écran sans sidebar)
- [ ] Raccourcis clavier POS (F1 = recherche, F2 = valider, Escape = annuler)
- [ ] Vue mobile optimisée pour ServeurPage (restaurant)
- [ ] Impression étiquettes produits (code-barres) depuis ProductsPage
- [ ] Aperçu avant impression des tickets / factures

### Multilangue (i18n)
- [ ] Mise en place de la librairie i18n (react-i18next)
- [ ] Extraction des chaînes françaises vers fichiers de traduction
- [ ] Traduction anglaise complète
- [ ] Sélecteur de langue dans PreferencesPage
- [ ] Traduction arabe (RTL) — optionnel

### Intégrations externes
- [ ] Intégration balance connectée (poids variable en temps réel au POS)
- [ ] Intégration lecteur code-barres USB/Bluetooth (WebHID API)
- [ ] API livraison (Wax Delivery, DHL) — suivi commandes
- [ ] Marketplace : connecteur WooCommerce / Shopify (sync stock)

---

## ✅ Déjà complété (pour référence)

- [x] POS avec offline sync et impression thermique ESC/POS
- [x] Ventes multi-canal (POS, comptoir, takeaway, livraison)
- [x] Catalogue produits avec multi-contenances, prix A/B/C, multi-barcodes
- [x] Stock multi-magasin avec lots et dates d'expiration
- [x] Achats & fournisseurs avec workflow complet et import BL
- [x] Clients avec crédit, fidélité et portefeuille électronique
- [x] CRM avec pipeline kanban et activités multicanal
- [x] Facturation (factures + devis) avec paiements partiels et relances
- [x] Comptabilité SYSCOHADA (journal, grand livre, bilan, compte de résultat)
- [x] Restaurant : floor plan, KDS, recettes, réservations
- [x] Dépenses avec catégories et écritures comptables automatiques
- [x] Transferts inter-magasins avec workflow complet
- [x] Promotions et pertes
- [x] RBAC (Spatie) avec rôles et permissions granulaires
- [x] Multi-magasin et multi-organisation (multitenancy)
- [x] Modales de confirmation personnalisées (remplacement window.confirm)
- [x] Préférences d'affichage (mode sombre/clair + couleur principale)
- [x] Permissions dédiées pour CRM, Facturation et Dépenses
