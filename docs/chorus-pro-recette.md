# Guide de recette Chorus Pro — Sandbox avant production

> Issue #95 — Intégration Chorus Pro / PISTE  
> Statut : A valider avant go-live production

---

## 1. Environnement sandbox Chorus Pro

L'API Chorus Pro est exposée via le **portail PISTE** (Portail Interministériel pour les Services, les Technologies et les Échanges) de la Direction Générale des Finances Publiques.

| Paramètre | Valeur |
|---|---|
| URL sandbox PISTE | `https://sandbox-api.piste.gouv.fr/` |
| URL production PISTE | `https://api.piste.gouv.fr/` |
| Documentation officielle | https://developer.aife.economie.gouv.fr/ |
| Portail PISTE | https://piste.gouv.fr/ |

---

## 2. Inscription à PISTE — Étapes

### 2.1 Création du compte PISTE

1. Aller sur https://piste.gouv.fr/ et cliquer sur **« S'inscrire »**
2. Renseigner les informations de l'organisation (SIRET, raison sociale, adresse)
3. Valider l'email reçu dans la boîte de réception
4. Se connecter et accéder au **Dashboard développeur**

### 2.2 Création d'une application (credentials OAuth2)

1. Dans le dashboard PISTE, aller dans **« Mes applications »** → **« Créer une application »**
2. Nom de l'application : `FacturEasy-Sandbox` (à renommer `FacturEasy-Production` pour la prod)
3. Type d'application : **« Application serveur »** (Client Credentials Flow — pas de consentement utilisateur)
4. Environnement : sélectionner **« Bac à sable (Sandbox) »**
5. Souscrire à l'API **« Chorus Pro »** dans le catalogue des API
6. Valider — PISTE génère un `client_id` et un `client_secret`

> **Important :** noter immédiatement le `client_secret`, il ne sera plus affiché en clair.

### 2.3 Habilitation Chorus Pro

1. Se connecter sur le **portail Chorus Pro** : https://chorus-pro.gouv.fr/
2. Dans **« Paramétrage »** → **« Gestionnaire de compte »**, activer l'accès API pour le compte structure
3. Associer le `client_id` PISTE à la structure Chorus Pro (onglet **« Accès API »**)
4. Demander les rôles nécessaires : `DEPOSER_FACTURE`, `CONSULTER_FACTURE`, `VALIDER_FACTURE`

### 2.4 Test de l'authentification OAuth2

```bash
curl -X POST https://sandbox-api.piste.gouv.fr/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CHORUS_PRO_CLIENT_ID}" \
  -d "client_secret=${CHORUS_PRO_CLIENT_SECRET}" \
  -d "scope=openid"
```

Réponse attendue : `200 OK` avec un `access_token` JWT valide.

---

## 3. Variables d'environnement

Ajouter les variables suivantes dans Render (backend) pour l'environnement sandbox puis production.

### 3.1 Fichier `.env.example` (extrait)

```dotenv
# Chorus Pro / PISTE
CHORUS_PRO_API_URL=https://sandbox-api.piste.gouv.fr/
CHORUS_PRO_CLIENT_ID=your_client_id_from_piste
CHORUS_PRO_CLIENT_SECRET=your_client_secret_from_piste
CHORUS_PRO_ENV=sandbox
# Valeurs possibles : sandbox | production
```

### 3.2 Tableau des variables

| Variable | Description | Exemple sandbox | Obligatoire |
|---|---|---|---|
| `CHORUS_PRO_API_URL` | URL de base de l'API PISTE | `https://sandbox-api.piste.gouv.fr/` | Oui |
| `CHORUS_PRO_CLIENT_ID` | Client ID OAuth2 PISTE | `abc123-xxxx-yyyy` | Oui |
| `CHORUS_PRO_CLIENT_SECRET` | Client secret OAuth2 PISTE | `secret_xxxxx` | Oui |
| `CHORUS_PRO_ENV` | Indicateur d'environnement actif | `sandbox` | Oui |

### 3.3 Ajout dans Render (Dashboard)

1. Dashboard Render → Service `factureasy-api` → **Environment**
2. Ajouter chaque variable via **« Add Environment Variable »**
3. Cliquer **« Save Changes »** → le service redémarre automatiquement

---

## 4. Les 5 scénarios de test obligatoires

Tous les scénarios doivent être exécutés et validés avant le passage en production.

---

### Scénario 1 — Émission facture Factur-X → réception OK

**Objectif :** vérifier qu'une facture B2B au format Factur-X (PDF/A-3 embarquant le XML EN 16931) est acceptée et prise en compte par Chorus Pro sandbox.

**Prérequis :**
- Fichier `facture_test.pdf` au format Factur-X (Profile MINIMUM ou EN 16931)
- Destinataire = structure publique de test fournie par Chorus Pro sandbox

**Étapes :**
1. Générer le fichier Factur-X via la route backend `POST /api/factures/:id/export-facturx`
2. Déposer via l'API : `POST /cpro/factures/v1/deposer/flux`
3. Récupérer le `numeroFluxDepot` dans la réponse
4. Interroger le statut : `GET /cpro/factures/v1/consulter/flux/{numeroFluxDepot}`

**Résultat attendu :**
- Statut HTTP `200`
- Champ `statut` = `INTEGREE` ou `EN_COURS_DE_TRAITEMENT`
- Aucune erreur de validation de format

**Critère de succès :** la facture apparaît dans l'interface Chorus Pro sandbox avec le statut "Intégrée".

---

### Scénario 2 — Émission facture avec erreur de format → rejet avec code erreur

**Objectif :** vérifier que les erreurs de format sont correctement remontées et que FacturEasy affiche le code d'erreur Chorus Pro à l'utilisateur.

**Étapes :**
1. Soumettre intentionnellement une facture avec un champ obligatoire manquant (ex : `numeroSIRET` vide)
2. Appeler `POST /cpro/factures/v1/deposer/flux`
3. Capturer la réponse d'erreur

**Résultat attendu :**
- Statut HTTP `400` ou `200` avec `codeRetour` non nul
- Champ `libelleRetour` décrivant l'erreur (ex : `"SIRET destinataire invalide"`)
- Le backend FacturEasy lève une erreur structurée et l'enregistre en base

**Critère de succès :** le message d'erreur Chorus Pro est retranscrit mot pour mot dans l'interface utilisateur sans crash.

---

### Scénario 3 — Facture en attente de validation client

**Objectif :** simuler le cycle de validation côté acheteur public (facture déposée mais non encore validée).

**Étapes :**
1. Déposer une facture valide pour une structure de test configurée en mode "validation manuelle"
2. Ne pas valider côté acheteur
3. Interroger le statut toutes les 30 secondes pendant 2 minutes : `GET /cpro/factures/v1/consulter/flux/{id}`

**Résultat attendu :**
- Statut = `EN_ATTENTE_VALIDATION` ou `A_VALIDER`
- Le dashboard FacturEasy affiche le bon statut avec date de dépôt
- Un badge "En attente" est visible sur la facture

**Critère de succès :** le polling de statut fonctionne sans erreur et le statut intermédiaire est bien affiché.

---

### Scénario 4 — Cycle complet B2C e-reporting → transmission DGFiP sandbox

**Objectif :** valider la transmission des données de e-reporting (transactions B2C et B2B hors périmètre Chorus) vers la sandbox DGFiP via PISTE.

**Prérequis :**
- Activer le module e-reporting dans l'application PISTE
- Utiliser l'API `e-reporting` endpoint : `POST /cpro/transverses/v1/soumettre/lot/ereporting`

**Étapes :**
1. Générer un lot de transactions B2C (format XML conforme au schéma DGFiP)
2. Soumettre le lot via l'API e-reporting
3. Récupérer l'`identifiantLot`
4. Interroger le statut : `GET /cpro/transverses/v1/consulter/lot/ereporting/{identifiantLot}`

**Résultat attendu :**
- Lot accepté avec statut `INTEGRE`
- Accusé de réception enregistré en base FacturEasy (`chorus_ereporting_receipts`)
- Tableau de bord "E-reporting" mis à jour

**Critère de succès :** le cycle complet s'exécute en moins de 5 minutes en sandbox, statut final `INTEGRE`.

---

### Scénario 5 — Rechargement après rejet (correction + re-soumission)

**Objectif :** valider le workflow de correction suite à un rejet Chorus Pro.

**Étapes :**
1. Soumettre une facture comportant une erreur corrigeable (ex : mauvais code TVA)
2. Observer le rejet avec code erreur
3. Corriger la facture dans FacturEasy (via `PUT /api/factures/:id`)
4. Re-soumettre la facture corrigée vers Chorus Pro
5. Vérifier la nouvelle soumission

**Résultat attendu :**
- La facture corrigée obtient un nouveau `numeroFluxDepot` distinct
- L'historique FacturEasy conserve la trace de la tentative initiale + rejet + correction
- Statut final = `INTEGREE`

**Critère de succès :** l'interface permet le workflow correction/re-soumission sans rechargement manuel de page.

---

## 5. Checklist "Prêt pour la production"

Cocher chaque point avant de basculer `CHORUS_PRO_ENV=production`.

- [ ] **1. Authentification OAuth2** — le token sandbox est obtenu correctement et rafraîchi avant expiration
- [ ] **2. Scénario 1 validé** — émission Factur-X → réception OK sans erreur
- [ ] **3. Scénario 2 validé** — gestion des rejets avec code erreur affiché à l'utilisateur
- [ ] **4. Scénario 3 validé** — polling de statut "En attente" fonctionnel
- [ ] **5. Scénario 4 validé** — e-reporting B2C transmis et intégré en sandbox DGFiP
- [ ] **6. Scénario 5 validé** — cycle correction + re-soumission sans perte de données
- [ ] **7. Logs et traçabilité** — toutes les réponses Chorus Pro (succès et erreurs) sont enregistrées en base PostgreSQL avec `created_at` et `chorus_flux_id`
- [ ] **8. Gestion des timeouts** — les appels API Chorus Pro ont un timeout configuré (recommandé : 30s) et un retry exponentiel (max 3 tentatives)
- [ ] **9. Credentials production** — `CHORUS_PRO_CLIENT_ID` et `CHORUS_PRO_CLIENT_SECRET` production obtenus via PISTE, distincts des credentials sandbox
- [ ] **10. Habilitation structure production** — la structure est habilitée sur le portail Chorus Pro production avec les bons rôles (`DEPOSER_FACTURE`, `CONSULTER_FACTURE`)

---

## 6. Basculer de sandbox à production

Le passage en production ne nécessite de changer **qu'une seule paire de variables** dans Render :

```dotenv
# Avant (sandbox)
CHORUS_PRO_API_URL=https://sandbox-api.piste.gouv.fr/
CHORUS_PRO_ENV=sandbox

# Après (production)
CHORUS_PRO_API_URL=https://api.piste.gouv.fr/
CHORUS_PRO_ENV=production
```

Et mettre à jour les credentials production :

```dotenv
CHORUS_PRO_CLIENT_ID=<client_id_production_PISTE>
CHORUS_PRO_CLIENT_SECRET=<client_secret_production_PISTE>
```

**Procédure Render :**
1. Dashboard Render → Service `factureasy-api` → **Environment**
2. Modifier `CHORUS_PRO_API_URL`, `CHORUS_PRO_ENV`, `CHORUS_PRO_CLIENT_ID`, `CHORUS_PRO_CLIENT_SECRET`
3. **Save Changes** → le service redémarre avec les nouvelles valeurs
4. Vérifier dans les logs Render que le premier appel OAuth2 retourne un token production valide

> **Aucun code à modifier** — toute la configuration est externalisée dans les variables d'environnement.

---

*Document maintenu par l'équipe technique FacturEasy — dernière mise à jour : mai 2026*
