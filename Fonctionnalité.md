# Modules et fonctionnalités de SmartCommerce

Ce document présente les fonctionnalités repérées dans le code de l’application.
Les écrans réellement accessibles dépendent du type de commerce, des permissions
du compte, des licences et de la configuration de l’organisation. La présence
d’un module dans cette liste ne signifie pas nécessairement qu’il est activé
sur chaque installation.

## 1. Application de gestion des commerces

### Tableau de bord

- Indicateurs et synthèse de l’activité du magasin.
- Rapports et données de ventes et de stock selon les droits du compte.
- Bilan journalier dédié à la boulangerie.

### Ventes et caisse

- Point de vente (POS) et interface POS mobile.
- Enregistrement et consultation des ventes comptoir.
- Gestion des sessions de caisse et de l’ouverture du tiroir selon permissions.
- Moyens de paiement et historique de vente.
- Gestion des clients, catégories de clients et encaissements de créances.
- Promotions et remises, avec permissions spécifiques pour les remises.
- Commandes clients avec acomptes, notamment pour la boulangerie.
- Facturation, rappels de facture et livraisons.

### Catalogue et stocks

- Catalogue produits : création, modification, catégories, prix et codes-barres.
- Import de produits et génération de modèles d’import.
- Gestion des fournisseurs et import de données fournisseurs.
- Bons de commande et achats.
- Consultation du stock, inventaires et feuilles d’inventaire.
- Ajustements de stock, pertes et transferts entre magasins.
- Gestion des unités et des produits vendus au poids.

### Production et boulangerie

- Création et gestion des recettes et de leurs ingrédients.
- Planification et enregistrement des productions.
- Suivi de la consommation des matières premières et des quantités produites.
- Répartition des produits entre points de vente et circuits de distribution.
- Gestion des produits invendus et bilan de production journalier.
- Fiches journalières d’activité.
- Gestion des livreurs, tournées et prix de vente associés aux livreurs.
- Commandes clients avec acompte.

Ces fonctions de boulangerie sont présentées lorsque le magasin est configuré
comme boulangerie (ou, pour certains écrans, comme commerce mixte) et que le
compte possède les permissions nécessaires.

### Restaurant

- Gestion du restaurant et des commandes en salle.
- Menu et articles de restaurant.
- Stations de préparation et fonctions de cuisine (KDS).
- Recettes liées aux articles, disponibilité et images.
- Réservations et fonctions de salle selon permissions.

### Gestion, rapports et comptabilité

- Rapports d’activité.
- CRM et suivi de pipeline.
- Dépenses.
- Comptabilité et gestion des comptes.
- Budgets et lettrage / rapprochement.
- Immobilisations.
- Analyses de marges et rapports de caisse selon permissions.

### Organisation, utilisateurs et réglages

- Gestion des utilisateurs et activation/désactivation de comptes.
- Rôles et permissions.
- Gestion des magasins, sections et organisations.
- Changement de magasin pour les utilisateurs qui y ont accès.
- Personnalisation de l’ordre, des groupes et des libellés du menu.
- Préférences utilisateur et profil.
- Paramètres de catégories clients.
- Paramètres d’e-mail.
- Modèles d’impression et paramètres de rappels de facture.
- Journaux d’audit.

### Support

- Création et suivi de tickets d’assistance.
- Consultation des échanges et réponses aux tickets.

## 2. Administration de la plateforme

Espace distinct de l’application commerçant, accessible aux administrateurs de
la plateforme.

- Tableau de bord administrateur.
- Consultation, approbation et refus des demandes d’inscription.
- Création d’organisations, de magasins, d’un compte gérant et d’un abonnement
  lors de l’approbation d’une demande.
- Gestion des organisations clientes (tenants), activation, suspension et
  prolongation de leur accès.
- Impersonation / accès à un tenant selon les droits administrateur.
- Gestion des utilisateurs des organisations.
- Gestion des plans et de leurs fonctionnalités.
- Suivi des licences et des abonnements.
- Factures de la plateforme et marquage de paiement.
- Gestion des comptes administrateurs de plateforme.
- Journaux d’audit de la plateforme.
- Statistiques et analyses de la plateforme.
- Gestion des tickets de support côté administrateur.
- Outils de sauvegarde et maintenance : paramètres, journaux, statistiques,
  exécution de sauvegarde, test et optimisation des index.

## 3. Inscription et demandes commerciales

- Formulaire public de demande d’inscription.
- Collecte des informations de l’entreprise, du contact, de l’activité et du
  plan souhaité.
- Notifications par e-mail au demandeur et à l’administration, si le service
  e-mail est configuré.
- Traitement de la demande par l’administration : approbation ou refus.
- Création du compte gérant et envoi des informations de bienvenue lors de
  l’approbation, sous réserve de la configuration e-mail.

## 4. Types de commerce configurés

Le système contient des configurations pour les activités suivantes :

- Grande surface.
- Restaurant.
- Dépôt / entrepôt.
- Commerce mixte.
- Boulangerie / pâtisserie.
- Café / snack.
- Boutique.
- Supérette.
- Pharmacie.

Le type de commerce ajuste notamment les mouvements de stock associés à
l’activité et le menu par défaut. Les licences et permissions peuvent aussi
limiter certains écrans.

## 5. Fonctions transverses

- Application web React avec API Laravel.
- Interface installable de type PWA et service worker.
- Fonctions de consultation ou de saisie hors ligne pour certains parcours,
  avec synchronisation des ventes en attente lorsque la connexion revient.
- Expérience adaptée aux écrans mobiles, dont une interface POS mobile.
- Authentification par e-mail et mot de passe ; connexion POS par PIN.
- Gestion des permissions et des rôles pour limiter l’accès aux actions.
- Export et documents PDF/impression sur les parcours qui le proposent.
- Séparation des données par organisation et magasin.
