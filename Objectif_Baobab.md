# 🌳 Objectif Baobab — Détrôner Odoo

> Stratégie produit & roadmap pour faire de Baobab (SmartCommerce) la référence ERP en Afrique francophone.

---

## 1. Analyse de la situation

### ✅ Ce que Baobab a déjà de bien

- Multi-magasins / multi-organisation
- POS + Vente comptoir
- Restaurant (tables, KDS, menu, plats)
- **Mobile Money natif** (Wave, Orange Money, Free Money) — avantage décisif sur Odoo en Afrique
- Connexion par PIN — parfait pour personnel non technique
- Gestion des rôles & droits granulaire
- Stocks, achats, inventaire, pertes, transferts inter-magasins
- Promotions, fidélité clients
- Comptabilité de base

---

## 2. Les faiblesses d'Odoo à exploiter

| Problème Odoo | Avantage Baobab |
|---|---|
| Complexe à installer et configurer | SaaS prêt en 5 minutes |
| Coûteux (Enterprise) | Prix adapté au marché africain |
| Lent sur connexion faible | PWA offline — fonctionne sans internet |
| Pas adapté à l'Afrique | Mobile Money natif, FCFA, conformité OHADA |
| Interface trop technique | UX simple pour caissiers et gérants |
| Support en anglais | Support francophone local |

---

## 3. Ce qui manque — Roadmap par priorité

---

### 🔴 Priorité 1 — Sans ça, on ne peut pas rivaliser

#### 1.1 Mode Hors-Ligne (PWA Offline)
Le point le plus critique pour l'Afrique. La connexion coupe → le commerce s'arrête. Odoo ne fonctionne pas hors-ligne.

- Service Worker + IndexedDB pour le POS
- File d'attente de synchronisation automatique au retour de connexion
- Indicateur visuel de statut réseau
- Stack recommandée : `vite-plugin-pwa` + `Workbox` + `Dexie.js`

#### 1.2 Comptabilité Complète (Double Entrée OHADA)
Odoo doit sa domination en grande partie à sa comptabilité. Il nous faut :

- Plan comptable SYSCOHADA révisé
- Journal des écritures (achats, ventes, banque, caisse)
- Grand livre & Balance générale
- Bilan & Compte de résultat
- Déclarations TVA / fiscales
- Lettrage des écritures & rapprochement bancaire
- Export vers expert-comptable (FEC, Excel)

#### 1.3 Facturation & Devis Professionnels
- Devis → Bon de commande → Facture → Reçu de paiement
- Factures récurrentes (abonnements)
- Relances automatiques par email/SMS
- PDF normalisé avec logo, mentions légales, QR code
- Numérotation fiscale conforme

#### 1.4 CRM Basique
- Pipeline commercial (Prospect → Qualifié → Gagné/Perdu)
- Suivi des opportunités
- Historique client complet (achats, contacts, notes)
- Rappels et tâches de suivi

---

### 🟡 Priorité 2 — Pour se différencier vraiment

#### 2.1 Application Mobile (Flutter)
- Inventaire mobile avec scan QR/barcode via caméra
- Validation des bons de commande en déplacement
- Tableau de bord temps réel pour le gérant
- Prise de commande restaurant sur tablette
- Synchronisation avec le backend Baobab

#### 2.2 Notifications Intelligentes
- SMS via API locale (Orange, Twilio) pour reçus clients
- WhatsApp Business API pour envoyer factures et relances
- Alertes stock critique par SMS/email
- Rapport journalier automatique pour le gérant

#### 2.3 eCommerce Intégré
- Catalogue produits publics (site vitrine)
- Commandes en ligne → stock synchronisé automatiquement
- Gestion des livraisons / retrait en magasin
- Paiement en ligne via Mobile Money

#### 2.4 Multi-devise & Taux de Change
- GNF, XOF, XAF, MAD, DZD, MRU, etc.
- Taux de change configurables ou automatiques
- Facturation en devise étrangère avec conversion

#### 2.5 Impression Thermique Avancée
- Tickets 80mm, 58mm (imprimantes ESC/POS)
- Reçus personnalisables (logo, message de pied)
- Impression réseau (WiFi, Bluetooth, USB)
- Factures A4 PDF avec template personnalisé par magasin

---

### 🟢 Priorité 3 — Pour convaincre les grandes entreprises

#### 3.1 Ressources Humaines & Paie
- Fiche employé, contrats, documents
- Calcul de la paie (salaire brut → net)
- Gestion CNSS, IPM, IR selon pays
- Bulletins de salaire PDF
- Suivi des congés & absences
- Pointage (présences)

#### 3.2 Gestion de Production
- Nomenclatures (Bill of Materials)
- Ordres de fabrication
- Suivi des coûts de production
- Traçabilité matières premières → produits finis

#### 3.3 API Publique & Webhooks
- API REST documentée (Swagger/OpenAPI)
- Webhooks pour intégrations tierces
- Connecteurs : DHL, Jumia, Glovo, agrégateurs bancaires
- SDK JavaScript/Python pour développeurs partenaires

#### 3.4 Marketplace d'Extensions
- Modules tiers développés par la communauté
- Programme partenaires intégrateurs certifiés
- App Store Baobab avec abonnement par module

---

## 4. Stratégie Go-To-Market

### Principe fondamental

> **Ne pas viser Odoo globalement.**
> **Viser Odoo sur un vertical précis, dans une région précise. Gagner là, puis étendre.**

### Phase 1 — Dominer le Retail & Restaurant en Afrique francophone
**Horizon : 0–12 mois**

- [ ] Finaliser comptabilité OHADA
- [ ] PWA Offline pour le POS
- [ ] Application mobile inventaire (Flutter)
- [ ] Impression thermique 80mm
- [ ] 3 clients références (1 supermarché, 1 restaurant, 1 dépôt grossiste)
- [ ] Landing page + demo en ligne
- [ ] Support client francophone réactif

### Phase 2 — Élargir le spectre ERP
**Horizon : 12–24 mois**

- [ ] CRM + Facturation avancée
- [ ] Module RH & Paie OHADA
- [ ] eCommerce intégré
- [ ] Notifications SMS / WhatsApp
- [ ] Expansion : Sénégal → Côte d'Ivoire → Mali → Cameroun → Maroc

### Phase 3 — Compétition directe avec Odoo
**Horizon : 24–48 mois**

- [ ] ERP complet (production, projets, achats avancés)
- [ ] API publique + Webhooks
- [ ] Marketplace d'extensions
- [ ] Programme partenaires intégrateurs
- [ ] Certification OHADA officielle
- [ ] Hébergement souverain (datacenter Afrique)

---

## 5. Avantages concurrentiels non-copiables

Ces éléments doivent devenir l'ADN de Baobab :

1. **Mobile Money en natif** — pas un plugin, une intégration profonde
2. **Offline-first** — conçu dès le départ pour fonctionner sans internet
3. **OHADA-first** — plan comptable, paie, fiscalité locale par défaut
4. **Prix accessible** — modèle SaaS tiered adapté aux PME africaines
5. **UX pour non-techniciens** — caissier formé en 30 minutes, pas en 3 jours
6. **Support local** — en français, accessible par WhatsApp

---

## 6. Stack technique recommandée (évolution)

| Couche | Actuel | Recommandé pour scaler |
|---|---|---|
| Backend | Laravel 11 | Laravel 11 + Queues (Horizon) |
| Frontend | React + Vite | React + PWA (vite-plugin-pwa) |
| Mobile | — | Flutter (env déjà configuré) |
| Base de données | MySQL | MySQL + Redis (cache) |
| Files d'attente | — | Laravel Horizon + Redis |
| Stockage fichiers | Local | S3 / Cloudflare R2 |
| Email | — | Mailgun / Amazon SES |
| SMS | — | Orange SMS API / Twilio |
| Déploiement | — | Docker + VPS OVH / Contabo |
| Monitoring | — | Sentry (erreurs) + Uptime Robot |

---

## 7. Prochaines étapes concrètes dans le code

Actions immédiates à fort impact :

1. **Comptabilité OHADA** — compléter `/accounting` avec balance, bilan, compte de résultat
2. **PWA Offline POS** — `vite-plugin-pwa` + Workbox + IndexedDB
3. **Impression thermique** — intégration ESC/POS pour imprimantes 80mm
4. **Module RH minimal** — employés + fiche de paie (ouvre les portes des PME)
5. **Facturation PDF** — devis + factures avec template personnalisable

---

## 8. Message de positionnement

> **Baobab, c'est Odoo fait pour l'Afrique.**
> Simple à utiliser, adapté à vos réalités, accessible à votre budget.
> Mobile Money. Hors-ligne. OHADA. Francophone.

---

*Document stratégique — Projet Baobab / SmartCommerce*
*Généré le 2026-06-14*
