# Integration Chorus Pro PISTE

## Perimetre

Chorus Pro est le canal B2G pour les factures envoyees aux entites publiques. Il ne remplace pas l'e-reporting B2C/export ni la facture electronique B2B privee. FacturEasy prepare et suit ce canal, sans se presenter comme PDP/PA.

## Prerequis PISTE

- Compte PISTE.
- Client ID et Secret Key.
- Consentement aux API Factures, Structures, Utilisateurs et Transverses.
- Compte technique Chorus Pro.
- Header `cpro-account` encode en base64 au format `TECH_xxx@cpro.fr:password`.

## Variables d'environnement

```env
CHORUS_ENV=sandbox
CHORUS_API_BASE_URL=https://sandbox-api.piste.gouv.fr/cpro
CHORUS_OAUTH_BASE_URL=https://sandbox-oauth.piste.gouv.fr
CHORUS_CLIENT_ID=
CHORUS_CLIENT_SECRET=
CHORUS_CPRO_ACCOUNT_BASE64=
CHORUS_TIMEOUT_MS=20000
CHORUS_MOCK=false
```

En production, utiliser `CHORUS_ENV=production`. Si les URLs ne sont pas definies, le service utilise `https://api.piste.gouv.fr/cpro` et `https://oauth.piste.gouv.fr`.

## Sandbox vs Production

Sandbox sert aux tests PISTE/Chorus. Production ne doit etre activee qu'apres validation du compte technique, des habilitations API et d'un depot facture public controle.

## Flux depot PDF

1. Rechercher la structure destinataire par SIRET.
2. Verifier la structure et ses services.
3. Preparer une transmission locale.
4. Uploader le PDF.
5. Soumettre la facture PDF.
6. Lire et stocker `codeRetour`, `libelle`, identifiants Chorus et erreurs.

## Mode mock

`CHORUS_MOCK=true` interdit tout appel externe. Les recherches structure, services, upload et depot retournent des donnees fictives marquees mock.

## Routes principales

- `GET /api/chorus/config/status`
- `GET /api/chorus/health`
- `POST /api/chorus/structures/search`
- `POST /api/chorus/structures/:idStructure/services`
- `POST /api/chorus/invoices/:invoiceId/prepare`
- `POST /api/chorus/invoices/:invoiceId/submit-pdf`
- `POST /api/chorus/invoices/:invoiceId/submit-api`
- `GET /api/chorus/invoices/:invoiceId/status`
- `GET /api/chorus/transmissions`

## Limites actuelles

- Les chemins exacts PISTE des operations metier sont isoles dans `CHORUS_ENDPOINTS` et doivent etre verifies avec la documentation officielle avant production.
- `submit-api` retourne 501 tant que le mapping complet facture FacturEasy vers payload Chorus n'est pas certifie.
- Le PDF doit etre fourni en `pdfBase64` tant que la generation PDF backend n'est pas branchee.

## Depannage

- `MISSING_OAUTH` : `CHORUS_CLIENT_ID` ou `CHORUS_CLIENT_SECRET` absent.
- `MISSING_CPRO_ACCOUNT` : `CHORUS_CPRO_ACCOUNT_BASE64` absent.
- 401 : verifier les identifiants PISTE.
- 403 : verifier le compte technique et les droits Chorus.
- Structure introuvable : verifier SIRET public et habilitation Structures.

## Checklist production

- Variables Render configurees.
- `CHORUS_MOCK=false`.
- Compte technique actif.
- APIs consenties dans PISTE.
- Premier test `/api/chorus/health` OK.
- Test structure publique OK.
- Depot PDF test accepte.
