# Déploiement FacturEasy — Guide Railway

## Étape 1 — Prérequis (5 min)
- Compte Railway : https://railway.app (gratuit pour commencer)
- Repo GitHub : créer un repo `factureasy-backend` et pousser le dossier `/backend`
- Domaine : vérifier la dispo de factureasy.fr sur OVH ou Gandi (~10€/an)

## Étape 2 — Déployer le backend (10 min)

1. Sur Railway → "New Project" → "Deploy from GitHub repo"
2. Sélectionner `factureasy-backend`
3. Railway détecte automatiquement Node.js et lance `npm start`
4. Aller dans "Variables" → ajouter :
   ```
   PORT=3001
   CHORUS_CLIENT_ID=<votre_client_id>
   CHORUS_CLIENT_SECRET=<votre_client_secret>
   ```

## Étape 3 — Base de données PostgreSQL (5 min)

1. Dans Railway → "New" → "Database" → "Add PostgreSQL"
2. Railway génère automatiquement `DATABASE_URL` et l'injecte dans votre service
3. Une fois déployé, appeler : `GET https://votre-app.railway.app/init-db`
   → Crée les tables automatiquement

## Étape 4 — Domaine personnalisé (10 min)

1. Dans Railway → Settings → Domains → "Add Custom Domain"
2. Entrer : `api.factureasy.fr`
3. Railway donne un enregistrement CNAME → l'ajouter chez votre registrar (OVH/Gandi)
4. SSL automatique (Let's Encrypt) en ~5 minutes

## Étape 5 — Landing page (5 min)

Option A — Vercel (recommandé pour le HTML statique) :
1. Créer repo `factureasy-landing` avec le dossier `/landing`
2. Vercel → "Import" → déploiement en 30 secondes
3. Domaine : `factureasy.fr` (apex) → rediriger vers Vercel

Option B — Netlify Drop :
1. Glisser-déposer le dossier `/landing` sur app.netlify.com
2. Domaine personnalisé en 2 clics

## Étape 6 — Variables d'environnement frontend

Dans `/landing/index.html`, mettre à jour l'URL du formulaire :
```js
// Remplacer l'action du formulaire par votre endpoint Railway
fetch('https://api.factureasy.fr/leads', { method: 'POST', body: formData })
```

## Récapitulatif des coûts mensuels (MVP)

| Service | Coût |
|---|---|
| Railway (backend + PostgreSQL) | ~5€/mois |
| Vercel (landing) | 0€ |
| Domaine factureasy.fr | ~0.80€/mois |
| **Total infrastructure** | **~6€/mois** |

## Checklist avant mise en ligne

- [ ] Variables d'env Railway configurées
- [ ] `/init-db` appelé → tables créées
- [ ] Test POST `/factures` avec données de test
- [ ] Domaine factureasy.fr pointant vers Vercel
- [ ] Domaine api.factureasy.fr pointant vers Railway
- [ ] SSL actif sur les deux domaines
- [ ] Formulaire landing connecté à une boîte email (Brevo ou Mailchimp)
