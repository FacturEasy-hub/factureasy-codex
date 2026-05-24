# GUIDE INFRA — RCLONE + BACKBLAZE B2 & OUVERTURE MICRO-ENTREPRENEUR

---

## PARTIE 1 — BACKUP POSTGRESQL VERS BACKBLAZE B2 VIA RCLONE

### Contexte

Le script de backup `backup.sh` (infra/backup.sh) chiffre la base PostgreSQL et l'envoie vers un stockage externe. Ce guide détaille le setup complet avec Backblaze B2 (prix : 0,006 $/Go/mois — le plus compétitif du marché, 10x moins cher que S3).

---

### Étape 1 — Créer un compte Backblaze B2

1. Aller sur https://www.backblaze.com/b2/sign-up.html
2. Créer un compte (gratuit jusqu'à 10 Go)
3. Aller dans **Buckets** → **Create a Bucket**
   - Bucket name : `factureasy-backups`
   - Files in bucket are : **Private**
   - Default Encryption : **Enable** (SSE-B2)
   - Object Lock : **Disable** (sauf si vous voulez une rétention immuable)
4. Aller dans **App Keys** → **Add a New Application Key**
   - Name of Key : `factureasy-rclone`
   - Allow access to Bucket : `factureasy-backups`
   - Type of Access : **Read and Write**
   - Cocher : **Allow List All Bucket Names**
   - → Copier immédiatement `keyID` et `applicationKey` (ils ne sont affichés qu'une fois)

---

### Étape 2 — Installer rclone sur le serveur

```bash
# Sur Ubuntu/Debian (Railway ou VPS)
curl https://rclone.org/install.sh | sudo bash

# Vérification
rclone version
```

---

### Étape 3 — Configurer rclone pour Backblaze B2

```bash
rclone config
```

Répondre aux questions :
```
n) New remote
name> b2-factureasy
Storage> b2                    # Backblaze B2
account> VOTRE_KEY_ID          # Le keyID copié à l'étape 1
key> VOTRE_APPLICATION_KEY     # L'applicationKey copiée à l'étape 1
# Laisser les autres options par défaut (Entrée)
y) Yes, this is OK
q) Quit config
```

Tester la connexion :
```bash
rclone ls b2-factureasy:factureasy-backups
# Doit retourner une liste vide (ou des fichiers si déjà présents)
```

---

### Étape 4 — Variable d'environnement RCLONE_REMOTE

Dans le fichier `.env` du backend (et dans les secrets Railway) :

```env
RCLONE_REMOTE=b2-factureasy:factureasy-backups
```

Le script `infra/backup.sh` utilise cette variable :
```bash
rclone copy "$FINAL_FILE" "$RCLONE_REMOTE/" --b2-chunk-size 10M
```

---

### Étape 5 — Chiffrement GPG symétrique (AES-256)

Le script utilise un chiffrement **symétrique** AES-256 via une passphrase — simple, sans infrastructure de clés publiques, adapté à un usage solo.

Générer une passphrase forte (32 caractères minimum) :
```bash
openssl rand -base64 32
# Exemple de sortie : "K7vP3mQ9Lx2nRs8Yw1Zt6Ub4Jh5Fd0="
```

Variable d'environnement requise dans `.env` et les secrets Railway :
```env
GPG_PASSPHRASE=<votre_passphrase_générée_ci-dessus>
```

Le script produit des fichiers `factureasy_YYYYMMDD_HHMMSS.sql.gz.gpg` (dump compressé + chiffré AES-256).

**Important :** stocker la passphrase dans un gestionnaire de mots de passe sécurisé (Bitwarden, 1Password) — c'est la seule façon de déchiffrer les backups. Sans elle, les données sont irrécupérables.

---

### Étape 6 — Tester le backup complet

```bash
chmod +x infra/backup.sh
./infra/backup.sh

# Vérifier que le fichier apparaît dans B2
rclone ls b2-factureasy:factureasy-backups
```

---

### Étape 7 — Planifier via cron (ou Railway Cron Job)

```bash
# Crontab sur VPS — backup quotidien à 3h du matin
crontab -e
0 3 * * * /path/to/factureasy/infra/backup.sh >> /var/log/factureasy-backup.log 2>&1
```

Ou sur Railway : créer un Cron Job pointant vers un endpoint `/admin/backup` protégé.

---

### Procédure de restauration

```bash
# 1. Télécharger le backup chiffré depuis B2
rclone copy b2-factureasy:factureasy-backups/factureasy_YYYYMMDD_HHMMSS.sql.gz.gpg .

# 2. Déchiffrer (saisir la GPG_PASSPHRASE stockée dans votre gestionnaire de mots de passe)
gpg --decrypt factureasy_YYYYMMDD_HHMMSS.sql.gz.gpg | gunzip > factureasy_restored.sql

# 3. Restaurer
psql $DATABASE_URL < factureasy_restored.sql
```

---

## PARTIE 2 — OUVERTURE MICRO-ENTREPRENEUR

### Checklist complète (ordre chronologique)

#### A. Avant de démarrer (J-7)

- [ ] Choisir la dénomination commerciale : **FacturEasy** (vérifier disponibilité sur inpi.fr)
- [ ] Vérifier la disponibilité du nom de domaine factureasy.fr (déjà enregistré ?)
- [ ] Ouvrir un compte bancaire dédié à l'activité professionnelle
  - Recommandé : **Qonto** (9 €/mois, API, intégration comptable) ou **Shine** (7 €/mois)
  - Obligatoire pour séparer les flux pro/perso — recommandé même si non obligatoire pour micro-entrepreneur
- [ ] Préparer les documents : pièce d'identité, justificatif de domicile de moins de 3 mois

#### B. Immatriculation (J0)

1. Aller sur **https://formalites.entreprises.fr** (guichet unique INPI officiel depuis janvier 2023)
2. Cliquer sur **Créer une entreprise**
3. Choisir le statut : **Micro-entrepreneur (auto-entrepreneur)**
4. Activité principale : **Programmation informatique** (code APE : 6201Z)
   - Activité secondaire possible : **Formation professionnelle** (8559B) si formation facturée
5. Renseigner :
   - Nom/Prénom (l'entreprise individuelle porte le nom du fondateur)
   - Adresse du siège (domicile personnel autorisé)
   - Date de début d'activité : choisir le 1er du mois suivant pour simplifier
6. Régime fiscal : **Versement libératoire** si revenus N-2 inférieurs au plafond (avantageux fiscalement)
7. Régime social : **SSI (Sécurité Sociale des Indépendants)** — automatique pour micro-entrepreneur
8. Valider et signer électroniquement
9. Délai : SIRET reçu par email sous **1 à 5 jours ouvrés**

#### C. Après l'immatriculation (J+1 à J+30)

- [ ] Recevoir le certificat d'immatriculation avec le SIRET
- [ ] Mettre à jour les mentions légales du site avec le SIRET
- [ ] Mettre à jour les CGV avec le SIRET
- [ ] S'inscrire sur **impots.gouv.fr** → Espace professionnel → Déclarer votre micro-entreprise
- [ ] Ouvrir l'accès à **Chorus Pro** (portail.chorus-pro.gouv.fr) avec le SIRET
  - Nécessaire pour tester l'API avec un vrai SIRET
  - Créer un compte entreprise sur le portail
- [ ] Souscrire une Responsabilité Civile Professionnelle (RCP)
  - Recommandé : Hiscox, AXA Pro, ou Wakam — budget ~200 €/an
- [ ] Paramétrer les déclarations mensuelles ou trimestrielles sur autoentrepreneur.urssaf.fr

#### D. Taux de cotisations micro-entrepreneur (2026)

| Catégorie | Taux cotisations sociales | + Versement libératoire IR |
|---|---|---|
| Prestation de services (SaaS) | 21,2 % | 1,7 % |
| Formation professionnelle | 21,2 % | 1,7 % |
| **Total effectif** | **~22,9 %** | sur le CA brut |

**Plafonds CA annuel micro-entrepreneur (2026) :**
- Prestations de services : 77 700 € HT/an
- Au-delà : passage obligatoire en EURL/SASU

#### E. Facturation en tant que micro-entrepreneur

Les factures FacturEasy doivent mentionner :
```
[Nom Prénom] — Micro-entrepreneur
SIRET : [14 chiffres]
Mention TVA : "TVA non applicable, art. 293 B du CGI"
(tant que le CA ne dépasse pas le seuil de franchise en base)
```

**Seuil franchise TVA (2026) :**
- 36 800 € de CA : franchise en base TVA (pas de TVA collectée)
- 39 100 € : dépassement transitoire (TVA due dès le 1er janvier suivant)
- Au-delà : assujettissement à la TVA dès le dépassement

---

### Ressources officielles

- Guichet unique : https://formalites.entreprises.fr
- URSSAF auto-entrepreneur : https://www.autoentrepreneur.urssaf.fr
- Chorus Pro : https://portail.chorus-pro.gouv.fr
- INPI (marques) : https://data.inpi.fr
- CNIL (RGPD) : https://www.cnil.fr
- Service-public.fr micro-entrepreneur : https://www.service-public.fr/professionnels-entreprises/vosdroits/F23264

---

*Dernière mise à jour : mai 2026 — Vérifier les plafonds et taux sur autoentrepreneur.urssaf.fr avant toute déclaration.*
