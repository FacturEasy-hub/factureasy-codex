# POLITIQUE D'ARCHIVAGE ET DE CONSERVATION DES DONNÉES — FacturEasy

**Version 1.0 — En vigueur à compter du 19 mai 2026**

---

## 1. CADRE LÉGAL

La présente politique est établie en conformité avec les textes suivants :

- **Article L123-22 du Code de commerce** : obligation de conservation des documents comptables et des pièces justificatives (dont les factures) pendant une durée de **10 ans** à compter de la clôture de l'exercice.
- **Article 289 du Code général des impôts (CGI)** : les factures soumises à TVA doivent être conservées sous leur forme originale pendant **6 ans** au minimum, durée portée à 10 ans par le Code de commerce pour les documents comptables.
- **RGPD, Article 5(1)(e) — Principe de limitation de la conservation** : les données à caractère personnel ne peuvent être conservées sous une forme permettant l'identification des personnes concernées au-delà du temps nécessaire aux finalités pour lesquelles elles sont traitées.
- **Recommandations CNIL** relatives à la conservation des logs d'accès et de connexion.

---

## 2. DURÉES DE CONSERVATION PAR TYPE DE DOCUMENT

| Document | Durée de conservation | Base légale | Support technique |
|---|---|---|---|
| Factures émises | 10 ans à compter de la clôture de l'exercice | Article L123-22 Code de commerce | S3 immuable (Object Lock) + Neon PostgreSQL |
| Devis | 5 ans à compter de la date d'émission | Droit commercial (prescription de droit commun) | Neon PostgreSQL |
| Données personnelles clients (hors facturation) | 3 ans après la fin du contrat ou du dernier contact | RGPD Art. 5(1)(e) — finalité expirée | Neon PostgreSQL avec purge automatique |
| Logs de connexion et d'accès | 1 an glissant | Recommandation CNIL | Fichiers journaux rotatifs |
| Données comptables (exports FEC, récapitulatifs TVA) | 10 ans à compter de la clôture de l'exercice | Article L123-22 Code de commerce | S3 |

> **Note** : les factures électroniques contiennent nécessairement des données personnelles (nom, adresse des parties). Elles ne peuvent pas faire l'objet d'un effacement avant l'expiration de la durée légale de 10 ans, même à la demande de la personne concernée. Cette exception au droit à l'effacement est prévue par l'article 17(3)(b) du RGPD.

---

## 3. IMPLÉMENTATION TECHNIQUE

### 3.1 Stockage objet S3 (factures et données comptables)

- Les factures émises sont stockées sur un service de stockage objet compatible S3 (AWS S3 ou équivalent).
- Le **mode Object Lock COMPLIANCE** est activé avec une durée de rétention de **10 ans** : aucun utilisateur, y compris les administrateurs, ne peut supprimer ou modifier un objet avant expiration de la période de rétention.
- La réplication multi-zone (ou multi-région) est activée pour garantir la durabilité des fichiers.

### 3.2 Convention de nommage des fichiers

Les fichiers PDF de factures respectent la convention suivante :

```
factures/{siret}/{annee}/{numero_facture}.pdf
```

Exemples :
- `factures/12345678900014/2026/FA-2026-00042.pdf`
- `factures/98765432100023/2025/FA-2025-00001.pdf`

Cette convention permet une localisation immédiate de tout document lors d'un contrôle fiscal ou d'une demande d'accès.

### 3.3 Preuve d'intégrité — Hash SHA-256

À chaque génération d'une facture PDF, un condensat cryptographique **SHA-256** du fichier est calculé et stocké en base de données (colonne `pdf_hash` de la table `invoices`). Ce mécanisme permet :

- De détecter toute altération ultérieure du fichier ;
- De prouver l'authenticité du document en cas de contrôle DGFiP ;
- De répondre aux exigences de l'article 289 VII du CGI sur l'authenticité de l'origine, l'intégrité du contenu et la lisibilité de la facture.

### 3.4 Procédure de purge RGPD des données personnelles

À l'expiration du délai de 3 ans après la fin du contrat client, une procédure automatisée d'**anonymisation** est déclenchée sur les données personnelles non nécessaires à l'obligation légale de conservation :

- Les champs permettant l'identification du contact (prénom, nom du gérant, email direct, téléphone) sont anonymisés dans les enregistrements hors factures.
- Les **factures elles-mêmes ne sont pas supprimées** : seules les données redondantes dans d'autres tables sont anonymisées.
- Un journal de purge horodaté est conservé pour démonstration de conformité RGPD.

---

## 4. ACCÈS AUX ARCHIVES

### 4.1 Accès du Client

Le Client (ou ses utilisateurs habilités) peut accéder à l'intégralité de ses factures archivées à tout moment via son espace personnel sur la Plateforme FacturEasy, sans limitation de période. L'export en masse au format PDF ou CSV est disponible depuis l'interface.

### 4.2 Accès de la DGFiP (contrôle fiscal)

En cas de demande de l'administration fiscale (droit de communication, avis à tiers détenteur, contrôle fiscal), FacturEasy peut être requis de fournir les factures archivées. Le délai de réponse maximal est de **72 heures ouvrées** à compter de la réception de la réquisition. Les fichiers sont fournis au format PDF original accompagné du hash SHA-256 correspondant.

### 4.3 Accès de l'expert-comptable du Client

Le Client peut partager l'accès à ses archives avec son expert-comptable via la fonctionnalité de partage par lien sécurisé ou en invitant un utilisateur avec le rôle « Comptable » (lecture seule). L'expert-comptable peut exporter les données comptables (FEC, CSV) dans ce cadre.

### 4.4 Demande d'accès par un tiers autorisé

Toute demande d'accès aux archives par un tiers (mandataire judiciaire, liquidateur, avocat muni d'un mandat) doit être adressée à contact@factureasy.fr avec les justificatifs appropriés. La réponse est fournie dans un délai de **72 heures ouvrées**.

---

## 5. PROCÉDURE DE DESTRUCTION

### 5.1 Déclenchement

À l'expiration de la durée légale de conservation (10 ans pour les factures et données comptables), les fichiers concernés sont éligibles à la destruction.

### 5.2 Rapport de destruction

Avant toute destruction, un **rapport de destruction** est généré automatiquement. Ce rapport contient :

- La liste des fichiers détruits (identifiants, numéros de facture, exercice comptable concerné) ;
- La date et l'heure de la destruction ;
- La confirmation que la durée légale de conservation était expirée ;
- Le hash SHA-256 de chaque fichier détruit (preuve de ce qui existait).

### 5.3 Conservation du rapport

Le rapport de destruction est lui-même archivé pendant **1 an** après la date de destruction, puis détruit à son tour. Il est accessible sur demande à contact@factureasy.fr.

### 5.4 Destruction effective

La destruction est effectuée par suppression sécurisée des objets S3 après désactivation du verrou Object Lock (uniquement possible à expiration de la période de rétention COMPLIANCE). Aucun fichier ne peut être détruit avant l'expiration de la durée légale.

---

## 6. RESPONSABILITÉS

- **FacturEasy** est responsable de la mise en œuvre technique des procédures d'archivage décrites dans la présente politique.
- **Le Client** reste responsable de la conformité de ses obligations déclaratives et fiscales. FacturEasy fournit les outils d'archivage mais ne se substitue pas au conseiller fiscal ou à l'expert-comptable du Client.
- En cas de perte de données imputable à un sous-traitant technique (hébergeur S3, base de données), FacturEasy s'engage à notifier le Client dans les meilleurs délais et à mettre en œuvre les procédures de restauration depuis les sauvegardes disponibles.

---

## 7. CONTACT ET MISE À JOUR

Pour toute question relative à la présente politique : **dpo@factureasy.fr**

La présente politique peut être mise à jour pour refléter les évolutions légales ou techniques. La version en vigueur est toujours accessible sur https://factureasy.fr/politique-archivage.

---

*Document rédigé conformément au droit français en vigueur.*  
*Dernière mise à jour : mai 2026*
