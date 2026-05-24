# Gestion des secrets FacturEasy

> Issue #100 — Sécurité / Secrets management  
> Révision : trimestrielle

---

## 1. Inventaire des secrets

| Nom de la variable | Où elle est utilisée | Service | Criticité | Rotation recommandée |
|---|---|---|---|---|
| `JWT_SECRET` | Signature et vérification des tokens d'authentification utilisateurs | Backend (Render) | Critique | 6 mois |
| `ADMIN_SECRET` | Accès aux routes d'administration (`/api/admin/*`) | Backend (Render) | Critique | 3 mois |
| `DATABASE_URL` | Connexion PostgreSQL Neon (string complète avec mot de passe) | Backend (Render) | Critique | 6 mois ou sur compromission |
| `STRIPE_SECRET_KEY` | Création de PaymentIntents, gestion des abonnements | Backend (Render) | Critique | Sur compromission ou rotation annuelle |
| `STRIPE_WEBHOOK_SECRET` | Vérification de la signature des webhooks Stripe (`whsec_...`) | Backend (Render) | Élevée | A chaque renouvellement du webhook Stripe |
| `RESEND_API_KEY` | Envoi des emails transactionnels (factures, relances, onboarding) | Backend (Render) | Élevée | 12 mois |
| `CHORUS_PRO_CLIENT_SECRET` | Authentification OAuth2 PISTE pour l'API Chorus Pro | Backend (Render) | Critique | 12 mois ou sur rotation PISTE |

---

## 2. Procédure de rotation d'un secret sans downtime

La procédure suit le principe du **double secret** : le nouveau secret est activé avant que l'ancien soit révoqué, garantissant zéro interruption de service.

### Exemple : rotation de `JWT_SECRET`

**Étape 1 — Générer le nouveau secret**

```bash
# Générer un secret cryptographiquement sûr (64 octets = 128 hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Étape 2 — Préparer le code pour accepter deux secrets simultanément** *(si besoin pour JWT)*

Pendant la fenêtre de rotation, le backend peut vérifier avec l'ancien ET le nouveau secret :

```js
// middleware/auth.js — pendant la rotation uniquement
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Fallback sur l'ancien secret pendant la migration
    return jwt.verify(token, process.env.JWT_SECRET_OLD);
  }
}
```

**Étape 3 — Déployer le nouveau secret dans Render**

1. Dashboard Render → Service `factureasy-api` → **Environment**
2. Ajouter `JWT_SECRET_OLD` = ancienne valeur de `JWT_SECRET`
3. Modifier `JWT_SECRET` = nouvelle valeur générée à l'étape 1
4. Cliquer **Save Changes** → Render redémarre le service (downtime < 5s, géré par Render)

**Étape 4 — Vérifier le bon fonctionnement**

```bash
# Tester l'authentification avec un compte de test
curl -X POST https://factureasy-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'
```

**Étape 5 — Supprimer l'ancien secret**

Après 24h sans erreur d'authentification dans les logs :
1. Supprimer la variable `JWT_SECRET_OLD` de Render
2. Retirer le fallback du code si ajouté à l'étape 2
3. Déployer

**Étape 6 — Documenter**

Mettre à jour le tableau de l'inventaire (section 1) avec la date de rotation.

---

## 3. Détection de fuites — Gitleaks dans GitHub Actions

[Gitleaks](https://github.com/gitleaks/gitleaks) scanne chaque commit et PR pour détecter des secrets accidentellement commités.

### Configuration `.github/workflows/gitleaks.yml`

```yaml
name: Gitleaks — Détection de secrets

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  gitleaks:
    name: Scan de secrets (Gitleaks)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Historique complet pour scanner tous les commits

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # Optionnel (plan pro)
```

### Fichier `.gitleaks.toml` (à la racine du repo)

```toml
[extend]
# Utiliser les règles officielles Gitleaks par défaut
useDefault = true

[[rules]]
# Règle personnalisée : détecter les tokens PISTE
id = "piste-api-token"
description = "PISTE API token détecté"
regex = '''piste[_\-]?(api[_\-]?)?token\s*=\s*['\"]([a-zA-Z0-9\-_]{20,})['\"]'''
tags = ["api", "piste", "chorus-pro"]

[allowlist]
# Exclure les fichiers de test et les valeurs placeholder
paths = [
  '''.env.example''',
  '''backend/tests/''',
]
regexes = [
  '''ci-test-secret-not-for-prod''',
  '''your_client_secret_from_piste''',
]
```

### Action en cas de détection

1. Gitleaks fait échouer le check CI → la PR est bloquée
2. Révoquer **immédiatement** le secret dans le service concerné
3. Générer un nouveau secret (procédure section 2)
4. Nettoyer l'historique Git si nécessaire : `git filter-repo` ou contacter GitHub Support

---

## 4. Chiffrement at-rest — Neon PostgreSQL

### Confirmation du chiffrement

Neon PostgreSQL chiffre toutes les données au repos par défaut avec **AES-256**, sans configuration supplémentaire requise.

**Comment le confirmer :**

1. Se connecter au dashboard Neon : https://console.neon.tech/
2. Dans le projet FacturEasy → **Settings** → onglet **Security**
3. La mention "Encryption at rest: AES-256" doit être visible

Depuis psql, on peut également vérifier que la connexion est chiffrée en transit :

```sql
-- Vérifier que SSL est actif sur la connexion
SHOW ssl;
-- Résultat attendu : on

SELECT pg_ssl.ssl, pg_ssl.version
FROM pg_stat_ssl
JOIN pg_stat_activity ON pg_stat_ssl.pid = pg_stat_activity.pid
WHERE pg_stat_activity.application_name = 'psql';
```

**Points de chiffrement couverts par Neon :**

| Couche | Mécanisme | Géré par |
|---|---|---|
| Données au repos (disques) | AES-256 | Neon (automatique) |
| Données en transit | TLS 1.3 (SSL obligatoire) | Neon + application |
| Backups | Chiffrement identique au stockage principal | Neon (automatique) |

> Le chiffrement at-rest Neon est activé par défaut sur tous les plans (y compris Free Tier). Aucune action requise.

---

## 5. Checklist audit sécurité trimestriel

A effectuer tous les 3 mois. Cocher chaque point et noter la date de vérification.

- [ ] **1. Rotation des secrets critiques** — Vérifier que `JWT_SECRET` et `ADMIN_SECRET` ont été rotés dans les 6 derniers mois (voir tableau section 1)
- [ ] **2. Revue des accès Render** — Dashboard Render → Team → vérifier que seuls les membres actifs ont accès au service `factureasy-api` et peuvent voir les variables d'environnement
- [ ] **3. Revue des accès GitHub** — Settings → Collaborators → supprimer les anciens membres ou les prestataires dont la mission est terminée
- [ ] **4. Vérification des clés Stripe** — Dashboard Stripe → Developers → API keys → s'assurer que la clé `sk_live_*` n'est pas exposée dans les logs Render ni dans Sentry
- [ ] **5. Scan Gitleaks sur l'historique complet** — lancer `gitleaks detect --source . --log-opts="--all"` en local et vérifier l'absence de secrets dans l'historique Git
- [ ] **6. Vérification des webhooks actifs** — Dashboard Stripe → Webhooks → s'assurer que seul l'endpoint production FacturEasy est actif (supprimer les endpoints de test obsolètes)
- [ ] **7. Audit des logs d'accès** — Render → Logs → vérifier l'absence de secrets dans les logs applicatifs (chercher les patterns `sk_live`, `whsec_`, `postgresql://`)
- [ ] **8. Test de restauration backup** — Vérifier qu'un backup Neon récent peut être restauré sur une instance de test (procédure dans `infra/backup-postgres.sh`)

---

## 6. Scrubbing Sentry — Masquer les données sensibles

Sentry peut accidentellement capturer des données sensibles dans les traces d'erreur (headers, query params, body). La configuration suivante les masque.

### Configuration dans `backend/server.js`

```js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',

  // Scrubbing : liste des clés dont la valeur sera remplacée par [Filtered]
  // Sentry masque automatiquement les clés de cette liste dans tous les événements
  sendDefaultPii: false,  // Ne jamais envoyer PII par défaut

  beforeSend(event) {
    // Supprimer les headers sensibles
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
    }

    // Masquer les champs sensibles dans le body de la requête
    if (event.request?.data) {
      const sensitiveFields = [
        'password',
        'token',
        'secret',
        'client_secret',
        'jwt',
        'stripe_key',
        'database_url',
        'iban',
        'carte',
        'cvv',
      ];
      sensitiveFields.forEach((field) => {
        if (event.request.data[field]) {
          event.request.data[field] = '[Filtered]';
        }
      });
    }

    // Supprimer les variables d'environnement du contexte extra
    if (event.extra) {
      delete event.extra.env;
    }

    return event;
  },

  // Ignorer les routes de health check pour ne pas polluer Sentry
  ignoreErrors: [
    'HealthCheckError',
  ],
});

// Middleware Sentry RequestHandler — doit être le 1er middleware Express
app.use(Sentry.Handlers.requestHandler({
  // Ne pas capturer les cookies ni le body en entier
  request: ['method', 'url', 'query_string', 'headers'],
  // Exclure les headers sensibles
  ip: false,    // Ne pas logger l'IP utilisateur
  user: false,  // Ne pas logger les données utilisateur dans le contexte
}));
```

### Variables d'environnement Sentry

```dotenv
SENTRY_DSN=https://xxxx@oXXX.ingest.sentry.io/YYYY
```

### Vérification du scrubbing

Après déploiement, provoquer une erreur de test et vérifier dans le dashboard Sentry que :
- Les headers `Authorization` et `Cookie` sont absents
- Les champs `password`, `token`, `secret` sont remplacés par `[Filtered]`
- L'URL `DATABASE_URL` n'apparaît nulle part dans la trace

---

*Document maintenu par l'équipe technique FacturEasy — dernière mise à jour : mai 2026*
