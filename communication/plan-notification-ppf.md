# Plan de communication — Notification identifiant PPF FacturEasy

**Référence :** Issue #102  
**Objectif :** Notifier les clients et leurs fournisseurs de l'identifiant PPF de FacturEasy avant les échéances légales  
**Responsable :** Équipe Customer Success / Produit  
**Date de mise à jour :** Mai 2026  

---

## Section 1 — Contexte réglementaire

Dans le cadre de la réforme de la facturation électronique (décret 2022-1299), chaque entreprise assujettie à la TVA doit **communiquer son identifiant PPF (Portail Public de Facturation) à l'ensemble de ses partenaires commerciaux** — clients et fournisseurs — avant de pouvoir émettre ou recevoir des factures électroniques structurées.

**Pourquoi c'est critique :**
- Sans cet identifiant, vos fournisseurs ne peuvent pas vous adresser des factures conformes via leur PDP ou le PPF.
- Un fournisseur qui ne connaît pas votre identifiant PPF peut être contraint d'émettre ses factures en dehors du circuit légal, exposant les deux parties à un risque de non-conformité.
- La DGFiP recommande de communiquer cet identifiant **60 à 90 jours avant l'échéance d'entrée en vigueur** applicable à votre entreprise.

**Identifiant PPF FacturEasy :**
- Format : SIRET de l'entreprise cliente, enregistré auprès du PPF via FacturEasy comme PDP déclarée
- Accessible dans FacturEasy : Paramètres → Mon entreprise → Identifiant PPF
- À transmettre à : tous les fournisseurs actuels et futurs de l'entreprise

---

## Section 2 — Templates emails prêts à envoyer

---

### Email 1 — De FacturEasy vers le client

**Objet :** [Action requise] Votre identifiant PPF est prêt — transmettez-le à vos fournisseurs

**Expéditeur :** FacturEasy <notifications@factureasy.fr>  
**Destinataire :** Dirigeant / Responsable comptable du compte client  

---

Bonjour [Prénom],

Votre compte FacturEasy est désormais enregistré auprès du Portail Public de Facturation (PPF). Vous avez un **identifiant PPF officiel** que vos fournisseurs doivent connaître pour vous envoyer des factures électroniques conformes.

**Votre identifiant PPF :** `[SIRET_CLIENT]`

**Ce que vous devez faire :**

Pour respecter vos obligations légales, vous devez transmettre cet identifiant à **tous vos fournisseurs** avant le **[DATE_LIMITE]** (soit 60 jours avant votre échéance d'entrée en vigueur).

Pour vous faciliter la tâche, nous avons préparé un email prêt à copier-coller que vous pouvez envoyer directement à vos fournisseurs. Retrouvez-le dans votre espace FacturEasy, section "Notifications PPF", ou utilisez le modèle ci-dessous.

**Accéder à mon espace :** [BOUTON — Se connecter à FacturEasy]

---

Si vous avez des questions, notre équipe est disponible via le chat intégré ou à support@factureasy.fr.

Cordialement,  
L'équipe FacturEasy

*Ce message est envoyé automatiquement. La transmission de votre identifiant PPF à vos fournisseurs est une obligation légale dans le cadre de la réforme DGFiP (décret 2022-1299).*

---

### Email 2 — Du client vers ses fournisseurs (template à copier-coller)

**Objet :** Notre identifiant de facturation électronique — Action à réaliser avant le [DATE]

**Expéditeur :** [Client] <[email_client]>  
**Destinataire :** Service comptable / facturation du fournisseur  

---

Bonjour,

Dans le cadre de la réforme de la facturation électronique obligatoire en France (décret 2022-1299 — DGFiP), nous vous informons que notre entreprise est désormais raccordée à une Plateforme de Dématérialisation Partenaire (PDP) agréée.

**Nos informations de facturation électronique :**

- Raison sociale : [RAISON_SOCIALE_CLIENT]
- SIRET : [SIRET_CLIENT]
- Identifiant PPF / PDP : [SIRET_CLIENT]
- Plateforme utilisée : FacturEasy (PDP agréée DGFiP)

**Ce que cela signifie pour vous :**

À partir du **[DATE_OBLIGATION]**, toutes les factures que vous nous adressez devront être émises au format électronique structuré (UBL, CII ou Factur-X) via votre propre PDP ou le Portail Public de Facturation, en mentionnant notre identifiant ci-dessus.

Les factures papier ou PDF simples ne seront plus acceptées après cette date.

Nous vous remercions de bien vouloir :
1. Enregistrer notre identifiant PPF dans votre système de facturation
2. Vérifier que votre propre plateforme de facturation prend en charge le format électronique structuré
3. Nous contacter si vous avez besoin d'informations complémentaires

Pour toute question, n'hésitez pas à nous contacter à [EMAIL_COMPTABILITE_CLIENT] ou au [TELEPHONE_CLIENT].

Cordialement,

[Nom et prénom]  
[Titre]  
[Raison sociale]  
[Adresse]  
[Email] — [Téléphone]

---

### Email 3 — Relance J-30 si pas encore transmis

**Objet :** [Relance] Votre identifiant PPF n'a pas encore été transmis — il vous reste 30 jours

**Expéditeur :** FacturEasy <notifications@factureasy.fr>  
**Destinataire :** Dirigeant / Responsable comptable du compte client  
**Déclenchement :** Automatique si `ppf_notified_at IS NULL` et `DATE_LIMITE - NOW() <= 30 jours`  

---

Bonjour [Prénom],

Il y a 30 jours, nous vous avons informé que vous deviez transmettre votre identifiant PPF à vos fournisseurs. Nous n'avons pas encore enregistré de confirmation de votre part.

**Il vous reste 30 jours pour agir.**

Passé le **[DATE_LIMITE]**, vos fournisseurs ne pourront plus vous adresser de factures conformes, ce qui pourrait perturber votre comptabilité et votre déductibilité de TVA.

**Votre identifiant PPF :** `[SIRET_CLIENT]`

**Que faire maintenant ?**

1. Copiez le template email ci-dessous
2. Envoyez-le à tous vos fournisseurs actifs
3. Revenez dans FacturEasy et cliquez "Je l'ai fait" pour fermer cette alerte

[BOUTON — Accéder au template et marquer comme fait]

---

Si vous avez déjà transmis votre identifiant et souhaitez fermer cette notification, connectez-vous à FacturEasy et cliquez sur "Je l'ai fait" dans le bandeau de votre tableau de bord.

Cordialement,  
L'équipe FacturEasy — support@factureasy.fr

---

## Section 3 — Spec bandeau in-app (dashboard)

### Comportement général

Le bandeau s'affiche dans le dashboard de chaque entreprise cliente dont la colonne `ppf_notified_at` est `NULL` et dont la date limite de notification approche.

---

### Texte du bandeau

```
[ICONE ALERTE] Transmettez votre identifiant PPF à vos fournisseurs avant le [DATE_LIMITE]. 
Il vous reste [N] jours.  [En savoir plus]  [Je l'ai fait]
```

Variables dynamiques :
- `[DATE_LIMITE]` : calculée comme `deadline_e_invoice - 60 jours` pour l'entreprise
- `[N]` : nombre de jours entre aujourd'hui et `DATE_LIMITE`, recalculé à chaque chargement de page
- `[En savoir plus]` : lien vers la page d'aide aide.factureasy.fr/ppf-identifiant
- `[Je l'ai fait]` : bouton d'action → décrit ci-dessous

---

### Couleurs et états visuels

| Délai restant | Couleur du bandeau | Icône | Comportement |
|---|---|---|---|
| > 30 jours | Jaune (#F59E0B) | Avertissement | Affiché, dismissible |
| 1 à 30 jours | Orange (#EA580C) | Alerte | Affiché, dismissible |
| 0 jours ou dépassé | Rouge (#DC2626) | Danger | Affiché, NON dismissible |
| `ppf_notified_at` renseignée | — | — | Bandeau masqué |

---

### Action "Je l'ai fait"

Lorsque l'utilisateur clique sur "Je l'ai fait" :

1. Afficher une confirmation modale :
   > "Avez-vous bien transmis votre identifiant PPF `[SIRET]` à tous vos fournisseurs actifs ?"
   > [Oui, confirmer] [Annuler]

2. Si confirmé : écrire `ppf_notified_at = NOW()` dans la table `companies` (colonne à créer — voir spec DB ci-dessous)

3. Le bandeau disparaît immédiatement et ne réapparaît plus, sauf si un administrateur FacturEasy le réinitialise manuellement.

4. Envoyer un email de confirmation à l'utilisateur (optionnel — à décider en sprint).

---

### Spec base de données

**Table :** `companies`  
**Colonne à ajouter :** `ppf_notified_at`  

```sql
ALTER TABLE companies
ADD COLUMN ppf_notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN companies.ppf_notified_at IS
  'Date à laquelle le client a confirmé avoir transmis son identifiant PPF à ses fournisseurs. NULL = pas encore fait.';
```

**Index suggéré (pour les requêtes de monitoring) :**

```sql
CREATE INDEX idx_companies_ppf_notified_at
ON companies (ppf_notified_at)
WHERE ppf_notified_at IS NULL;
```

---

### Composant frontend (pseudo-code React)

```tsx
// PPFNotificationBanner.tsx

const PPFNotificationBanner = ({ company }) => {
  const daysLeft = differenceInDays(company.ppfDeadline, new Date());
  
  if (company.ppfNotifiedAt) return null;

  const color =
    daysLeft > 30 ? 'yellow' :
    daysLeft >= 1 ? 'orange' :
    'red';

  const isDismissible = daysLeft > 0;

  const handleConfirm = async () => {
    await api.post('/companies/ppf-notified');
    // Rafraîchir l'état du bandeau
  };

  return (
    <Banner color={color} dismissible={isDismissible}>
      <AlertIcon />
      Transmettez votre identifiant PPF à vos fournisseurs avant le{' '}
      <strong>{formatDate(company.ppfDeadline)}</strong>.{' '}
      Il vous reste <strong>{daysLeft} jour{daysLeft > 1 ? 's' : ''}</strong>.{' '}
      <Link href="/aide/ppf-identifiant">En savoir plus</Link>
      <Button onClick={() => openConfirmModal(handleConfirm)}>
        Je l'ai fait
      </Button>
    </Banner>
  );
};
```

---

## Section 4 — Calendrier de déploiement de la réforme DGFiP

### Grandes dates de la réforme e-facture / e-reporting

| Date | Événement |
|---|---|
| **Septembre 2026** | Obligation d'émettre des factures électroniques pour les grandes entreprises (ETI/GE). Obligation de réception pour toutes les entreprises assujetties à la TVA. Début de l'e-reporting pour toutes les entreprises. |
| **Septembre 2027** | Obligation d'émettre des factures électroniques étendue aux PME (entreprises de taille intermédiaire — 50 à 249 salariés, CA < 50M€). |
| **Septembre 2027** | Obligation d'émettre des factures électroniques étendue aux TPE et micro-entreprises assujetties à la TVA. |

> Note : Les dates ci-dessus correspondent au calendrier DGFiP tel que publié après le report de janvier 2024 (initialement prévu septembre 2024, puis reporté). Vérifier la dernière mise à jour officielle sur impots.gouv.fr avant toute communication client.

---

### Fenêtre de notification PPF recommandée par taille d'entreprise

| Taille d'entreprise | Échéance d'émission | Notification PPF à envoyer au plus tard |
|---|---|---|
| Grande entreprise / ETI (> 250 salariés) | Septembre 2026 | **Fin juin 2026** (J-90) |
| PME (50-249 salariés) | Septembre 2027 | **Fin juin 2027** (J-90) |
| TPE / micro-entreprise (< 50 salariés) | Septembre 2027 | **Fin juin 2027** (J-90) |

---

### Plan d'action FacturEasy par vague

**Vague 1 — Grandes entreprises (maintenant à juin 2026)**
- [ ] Activer le bandeau in-app pour les comptes clients GE/ETI
- [ ] Envoyer Email 1 à tous les comptes GE/ETI actifs
- [ ] Relance Email 3 à J-30 (fin juillet 2026) pour les non-confirmés
- [ ] Monitoring : tableau de bord Customer Success sur `ppf_notified_at`

**Vague 2 — PME et TPE (janvier à juin 2027)**
- [ ] Activer le bandeau in-app pour les comptes PME et TPE
- [ ] Campagne email dédiée avec messages adaptés à chaque segment
- [ ] Webinaire client "Préparer votre passage à l'e-facture" (mars 2027)
- [ ] Relances automatisées J-60, J-30, J-7

---

*Document produit par l'équipe FacturEasy — Mai 2026*  
*Référence réglementaire : Décret 2022-1299, Ordonnance 2021-1190, Article 289 bis CGI*
