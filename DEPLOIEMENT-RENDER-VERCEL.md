# Déploiement Render + Vercel

## Render backend

- Repo: `https://github.com/FacturEasy-hub/factureasy-codex.git`
- Root Directory: `backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`

Variables Render:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=long-secret-prod
ADMIN_SECRET=long-secret-admin-prod
ALLOWED_ORIGINS=https://ton-site.vercel.app
CHORUS_CLIENT_ID=
CHORUS_CLIENT_SECRET=
```

Après premier deploy:

```txt
GET https://ton-backend.onrender.com/init-db
Authorization: Bearer <token admin>
```

Le token admin vient de:

```txt
POST https://ton-backend.onrender.com/auth/admin
Body: {"secret":"ADMIN_SECRET"}
```

## Vercel frontend

- Repo: `https://github.com/FacturEasy-hub/factureasy-codex.git`
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

Variable Vercel:

```env
VITE_API_URL=https://ton-backend.onrender.com
```

## Backoffice

URL:

```txt
https://ton-backend.onrender.com/backoffice/
```
