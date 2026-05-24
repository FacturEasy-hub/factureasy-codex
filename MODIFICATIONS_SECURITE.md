# Modifications appliquées — sécurité, conformité et tests

## Backend
- Ajout de `backend/utils/security.js` : validation SIRET/email/mot de passe, hash PBKDF2, validation TVA/montants, contrôle des secrets forts.
- Authentification renforcée : le login nécessite maintenant SIRET + nom + email + mot de passe.
- Les mots de passe sont stockés sous forme de hash PBKDF2, jamais en clair.
- Les JWT incluent maintenant `issuer` et `audience`.
- `JWT_SECRET` et `ADMIN_SECRET` sont contrôlés au démarrage en production.
- Ajout d’en-têtes de sécurité minimum, même si Helmet n’est pas chargé.
- Ajout de `helmet` et `express-rate-limit` dans les dépendances backend.
- Protection IDOR renforcée sur `/entreprises/:siret`.
- Le rôle `comptable` est réellement bloqué en écriture sur `/factures`, `/finances`, `/stats`.
- Validation stricte de la création de facture : SIRET client, nom client, montant HT positif, taux TVA autorisés.
- Correction du conflit de routage : `/factures/recurrentes` ne peut plus être capturé par `/factures/:id`.
- Suppression du fichier `backend/.env` du paquet corrigé.

## Frontend
- Ajout des champs Email professionnel et Mot de passe à l’écran de connexion.
- Validation côté client : SIRET, nom, email, mot de passe >= 8 caractères.
- Envoi du mot de passe et de l’email vers `/auth/login`.

## Juridique
- Ajout d’un avertissement clair dans les mentions légales : champs à compléter avant publication.
- Mise à jour de la section sécurité RGPD pour refléter l’authentification par mot de passe haché.
- Ajout d’une checklist avant publication.
- Ajout dans les CGVU de clauses : responsabilité, limites du service, sécurité du compte, modification des CGVU.

## Tests réalisés dans cet environnement
- Vérification syntaxique Node.js de tous les fichiers backend `.js` : OK.
- Vérification syntaxique du script `stripe/setup.js` : OK.
- `npm test` backend : impossible ici, car Jest n’est pas installé dans l’archive extraite (`jest: not found`).
- Build frontend Vite : impossible ici, car les dépendances optionnelles Rollup Linux sont absentes du `node_modules` fourni (`@rollup/rollup-linux-x64-gnu` manquant). Il faudra lancer `npm install` puis `npm test` / `npm run build` sur ta machine ou CI.

## Commandes à lancer localement
```bash
cd backend
npm install
npm test

cd ../frontend
npm install
npm run build
```
