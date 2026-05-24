# Documentation API — FacturEasy
*Base URL : `https://api.factureasy.fr` · Version : 1.0 · Format : JSON*

---

## Authentification

Toutes les routes (sauf `/health` et `/init-db`) requièrent un token JWT dans l'en-tête :

```
Authorization: Bearer <token>
```

Le token est obtenu via la route `POST /auth/login` et expire après 7 jours.

---

## Routes

### Santé

#### `GET /health`
Vérifie que l'API est opérationnelle.

**Réponse 200 :**
```json
{ "ok": true, "ts": "2026-05-14T10:30:00.000Z" }
```

---

### Initialisation

#### `GET /init-db`
Crée les tables PostgreSQL si elles n'existent pas. À appeler une seule fois au déploiement.

**Réponse 200 :**
```json
{ "ok": true, "message": "Schéma initialisé" }
```

---

### Entreprises

#### `POST /entreprises`
Crée ou met à jour une entreprise.

**Corps de la requête :**
```json
{
  "siret": "12345678901234",
  "nom": "SAS Exemple",
  "email": "contact@exemple.fr"
}
```

**Réponse 200 :**
```json
{
  "id": 1,
  "siret": "12345678901234",
  "nom": "SAS Exemple",
  "email": "contact@exemple.fr",
  "created_at": "2026-05-14T10:00:00.000Z"
}
```

**Erreurs :**
- `400` — siret ou nom manquant

---

#### `GET /entreprises/:siret`
Récupère une entreprise par SIRET.

**Paramètre :** `:siret` — le SIRET à 14 chiffres

**Réponse 200 :**
```json
{ "id": 1, "siret": "12345678901234", "nom": "SAS Exemple", "email": "..." }
```

**Erreurs :**
- `404` — entreprise introuvable

---

### Factures

#### `GET /factures`
Récupère toutes les factures d'un émetteur.

**Paramètres de requête :**
| Paramètre | Type | Obligatoire | Description |
|---|---|---|---|
| `siret` | string | ✓ | SIRET de l'émetteur (14 chiffres) |
| `statut` | string | — | Filtre : `EMISE`, `EN_COURS`, `ACCEPTEE`, `REJETEE` |

**Réponse 200 :**
```json
[
  {
    "id": 1,
    "numero": "FE-1715686400000",
    "emetteur_siret": "12345678901234",
    "client_siret": "98765432109876",
    "client_nom": "Mairie de Lyon",
    "description": "Accompagnement conformité PPF",
    "montant_ht": 490.00,
    "tva": 20.00,
    "montant_ttc": 588.00,
    "statut": "EMISE",
    "chorus_id": "CHORUS-2026-001",
    "date_emission": "2026-05-14T10:00:00.000Z"
  }
]
```

**Erreurs :**
- `400` — paramètre siret manquant

---

#### `GET /factures/:id`
Récupère une facture par ID.

**Réponse 200 :** objet facture complet (voir ci-dessus)

**Erreurs :**
- `404` — facture introuvable

---

#### `POST /factures`
Émet une nouvelle facture via l'API Chorus Pro.

**Corps de la requête :**
```json
{
  "emetteur_siret": "12345678901234",
  "client_siret": "98765432109876",
  "client_nom": "Mairie de Lyon",
  "description": "Accompagnement conformité facturation électronique",
  "montant_ht": 490,
  "tva": 20,
  "numero_engagement": "ENG-2026-0042"
}
```

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `emetteur_siret` | string | ✓ | SIRET de votre entreprise |
| `client_siret` | string | ✓ | SIRET du destinataire |
| `client_nom` | string | ✓ | Nom du destinataire |
| `description` | string | — | Libellé de la prestation |
| `montant_ht` | number | ✓ | Montant hors taxe en euros |
| `tva` | number | — | Taux de TVA (défaut : 20) |
| `numero_engagement` | string | — | Obligatoire pour les marchés publics |

**Réponse 201 :** objet facture créé avec `chorus_id` et `statut: "EMISE"`

**Erreurs :**
- `400` — champs obligatoires manquants
- `502` — erreur de communication avec l'API Chorus Pro (détail dans `error.detail`)

---

#### `PATCH /factures/:id/statut`
Interroge Chorus Pro pour mettre à jour le statut d'une facture.

**Réponse 200 :** objet facture avec le `statut` mis à jour

**Erreurs :**
- `400` — facture sans `chorus_id` (non émise via l'API)
- `404` — facture introuvable
- `502` — erreur Chorus Pro

---

### Statistiques

#### `GET /stats/:siret`
Retourne les statistiques agrégées d'un émetteur.

**Réponse 200 :**
```json
{
  "total_factures": "12",
  "ca_ttc": "7056.00",
  "ca_ht": "5880.00",
  "en_attente": "3",
  "acceptees": "8",
  "rejetees": "1",
  "panier_moyen_ht": "490.00"
}
```

---

## Codes de statut Chorus Pro

| Code | Signification | Action recommandée |
|---|---|---|
| `EMISE` | Déposée, en attente de traitement | Attendre |
| `EN_COURS` | En cours de vérification par Chorus Pro | Attendre |
| `ACCEPTEE` | Validée par le destinataire | Attendre le paiement (30j) |
| `REJETEE` | Rejetée — voir le motif | Corriger et réémettre |

---

## Variables d'environnement requises

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL | `postgresql://user:pass@host/db` |
| `CHORUS_CLIENT_ID` | Client ID OAuth2 Chorus Pro | `xxxxxxxx-xxxx-xxxx` |
| `CHORUS_CLIENT_SECRET` | Client Secret OAuth2 Chorus Pro | `xxxxxxxxxxxxxxxx` |
| `JWT_SECRET` | Clé de signature des tokens JWT | Chaîne aléatoire longue |
| `SMTP_HOST` | Serveur SMTP pour les emails | `smtp.brevo.com` |
| `SMTP_USER` | Identifiant SMTP | `contact@factureasy.fr` |
| `SMTP_PASS` | Mot de passe SMTP | `xxxxxxxxxxxx` |
| `MAIL_FROM` | Expéditeur des emails | `FacturEasy <contact@factureasy.fr>` |
| `PORT` | Port d'écoute du serveur | `3001` |

---

## Exemples cURL

```bash
# Health check
curl https://api.factureasy.fr/health

# Liste des factures
curl "https://api.factureasy.fr/factures?siret=12345678901234" \
  -H "Authorization: Bearer <token>"

# Émettre une facture
curl -X POST https://api.factureasy.fr/factures \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "emetteur_siret": "12345678901234",
    "client_siret": "98765432109876",
    "client_nom": "Mairie de Lyon",
    "description": "Accompagnement PPF",
    "montant_ht": 490,
    "tva": 20
  }'

# Rafraîchir le statut d'une facture
curl -X PATCH https://api.factureasy.fr/factures/1/statut \
  -H "Authorization: Bearer <token>"
```
