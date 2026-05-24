# Funnel d'acquisition Self-Service — FacturEasy
## 100% automatisé · Zéro appel commercial · Zéro accompagnement manuel

---

## Vue d'ensemble du funnel

```
Trafic organique / payant
        ↓
  Landing page (index-v2.html)
        ↓
  Formulaire d'inscription (email uniquement)
        ↓
  Essai gratuit 14 jours (app.factureasy.fr)
        ↓
  Séquence email automatisée — 6 emails (J+0 → J+15)
        ↓
  Conversion : Solo 14€ / Pro 34€ / Equipe 69€ / Business 149€
        ↓
  Rétention + upsell (email mensuel)
```

---

## Étape 1 — Sources de trafic

### Objectif
Amener des dirigeants de PME françaises sur la landing page avec un intent fort (conformité réforme 2026, Chorus Pro).

### Canaux recommandés (sans code custom)

#### SEO organique — priorité n°1
- **Outil :** [Semrush](https://semrush.com) ou [Ahrefs](https://ahrefs.com) pour identifier les mots-clés
- **Clusters prioritaires :**
  - "chorus pro PME" / "facturation électronique obligatoire 2026"
  - "comment envoyer facture chorus pro" / "erreur facture rejetée chorus pro"
  - "facturation électronique indépendant france"
- **Production de contenu :** 2 articles/semaine via [Notion AI](https://notion.so) + export vers blog (Ghost ou WordPress)
- **Metric cible :** 500 visiteurs organiques/mois à M+6, 2 000/mois à M+12

#### Google Ads (Search) — démarrage rapide
- **Outil :** Google Ads + [Optmyzr](https://optmyzr.com) pour optimisation automatique
- **Budget recommandé :** 500–1 000 €/mois pour test initial
- **Mots-clés cibles :** "chorus pro logiciel", "facturation électronique conformité 2026", "logiciel facture secteur public"
- **Metric cible :** CPC < 2 €, CPA essai gratuit < 15 €

#### LinkedIn Ads — cible dirigeants PME
- **Outil :** LinkedIn Campaign Manager
- **Ciblage :** Dirigeants / Gérants / DAF · Entreprises 1–50 salariés · France · secteurs BTP, conseil, formation, santé
- **Format :** Single Image Ad + Lead Gen Form (email pré-rempli LinkedIn)
- **Metric cible :** CPL < 20 €, taux de conversion formulaire > 15 %

#### Contenu YouTube / Shorts
- **Outil :** [Descript](https://descript.com) pour créer et éditer les vidéos rapidement
- **Formats :** Tutoriels "Comment envoyer une facture sur Chorus Pro en 5 minutes", Q&A réforme 2026
- **Metric cible :** 1 000 abonnés à M+6, 5 % de trafic qualifié vers landing

---

**Metric globale étape 1 :**
| Metric | Cible M+3 | Cible M+12 |
|---|---|---|
| Visiteurs uniques/mois | 300 | 3 000 |
| Source principale | Google Ads (60 %) | SEO (55 %) |
| Coût par visiteur | < 3 € | < 1 € |

---

## Étape 2 — Landing page → Inscription

### Objectif
Transformer le visiteur en inscrit (email) le plus vite possible. Frein zéro : pas de CB, pas de formulaire long.

### Mécanique
- **Formulaire :** champ email unique sur la landing + bouton "Démarrer l'essai gratuit"
- **Outil de capture :** [Brevo](https://brevo.com) (anciennement Sendinblue) — formulaire embarqué via script JS, connexion directe à la liste "Essais gratuits"
- **Confirmation :** page de succès immédiate ("Votre accès est en cours de création…") + email J+0 déclenché automatiquement
- **Double opt-in :** désactivé pour réduire la friction (opt-in simple RGPD avec case cochée)

### Optimisation landing
- **A/B test :** [VWO](https://vwo.com) ou [A/B Tasty](https://www.abtasty.com) sur le hero (sous-titre et CTA)
- **Heatmaps :** [Hotjar](https://hotjar.com) — identifier les zones de friction et de lecture
- **Metric cible :** taux de conversion visiteur → inscrit = **8–12 %**

---

**Metric étape 2 :**
| Metric | Cible |
|---|---|
| Taux de conversion landing | 8–12 % |
| Temps sur page avant inscription | < 90 secondes |
| Taux de rebond | < 55 % |

---

## Étape 3 — Essai gratuit → Activation

### Objectif
L'utilisateur crée sa première facture dans les 48h suivant l'inscription. C'est le signal d'activation le plus prédictif de la conversion.

### Mécanique in-app
- **Onboarding guidé :** checklist visuelle dans l'app ("Votre progression : 2/5 étapes complétées")
- **Vidéo de bienvenue :** embarquée dans le dashboard (2 min) — hébergée sur [Loom](https://loom.com) ou [Vimeo](https://vimeo.com)
- **Tooltips progressifs :** apparition contextuelle sur les éléments clés (bouton "Nouvelle facture", champ SIRET, bouton Chorus Pro)
- **Outil in-app messaging :** [Intercom](https://intercom.com) ou [Crisp](https://crisp.chat) (version économique) — messages automatiques déclenchés selon l'action (ou l'inaction) de l'utilisateur

### Séquence email d'activation (voir `email-onboarding-sequence.md`)
- J+0 : accès + vidéo
- J+1 : tutoriel première facture
- J+3 : email éducatif erreurs Chorus Pro
- J+7 : bilan semaine 1

### Metric cible étape 3
| Metric | Cible |
|---|---|
| Taux d'activation (1 facture créée dans les 7 jours) | > 40 % |
| Taux d'ouverture email J+0 | > 60 % |
| Taux de clic email J+1 | > 25 % |
| Taux de complétion onboarding in-app | > 35 % |

---

## Étape 4 — Conversion (J+14 → J+15)

### Objectif
Transformer l'essayeur en client payant. Deux emails de conversion (J+14 et J+15). L'offre Kit Autonomie est utilisée comme alternative à faible friction pour les non-prêts à s'abonner.

### Mécanique
- **Emails J+14 et J+15 :** voir `email-onboarding-sequence.md`
- **Page de conversion :** `/upgrade` avec 4 plans clairs (Solo 14€ / Pro 34€ / Équipe 69€ / Business 149€) — sans appel commercial, sans formulaire complexe
- **Paiement :** [Stripe](https://stripe.com) — intégration Checkout hébergée, CB + SEPA, facturation automatique
- **Offre J+15 :** Kit Autonomie offert si souscription dans les 24h (code promo auto via lien paramétré)

### Segmentation conversion
- **Activés (≥ 1 facture)** → proposition Solo ou Pro (mise en avant de la continuité d'activité)
- **Non activés (0 facture)** → proposition Kit Autonomie en priorité + Solo (angle "apprenez d'abord")
- **Équipes (multi-connexions détectées)** → proposition Pro mise en avant

### Metric cible étape 4
| Metric | Cible |
|---|---|
| Taux de conversion essai → payant (activés) | > 20 % |
| Taux de conversion essai → payant (non activés) | > 5 % |
| Taux de conversion Kit Autonomie (non convertis) | > 8 % |
| Taux d'ouverture email J+14 | > 45 % |
| Taux de clic email J+15 (offre Kit) | > 20 % |

---

## Étape 5 — Rétention et upsell

### Objectif
Réduire le churn, augmenter le LTV, convertir les Solo en Pro.

### Mécanique
- **Email mensuel "Bilan du mois"** : résumé automatique de l'activité (factures, TVA, trésorerie) envoyé le 1er de chaque mois via Brevo
- **Alerte réglementaire** : email automatique à chaque mise à jour Chorus Pro ou changement DGFiP (déclenché manuellement par l'admin)
- **Upsell Solo → Pro** : email à J+30 pour les utilisateurs Solo qui ont eu plus de 3 utilisateurs actifs détectés — présenter les avantages multi-utilisateurs
- **NPS automatique** : enquête [Typeform](https://typeform.com) envoyée à J+60 via email · score NPS suivi dans un tableau [Notion](https://notion.so) ou [Airtable](https://airtable.com)

### Metric cible étape 5
| Metric | Cible |
|---|---|
| Churn mensuel (abonnements) | < 5 % |
| LTV moyen (Pro) | > 18 mois |
| Taux upsell Solo → Pro à M+3 | > 15 % |
| NPS | > 40 |

---

## Étape 6 — Réactivation des essais non convertis

### Objectif
Récupérer les essayeurs qui n'ont pas converti à J+15 — sans appel, uniquement par automation.

### Séquence de réactivation (déclenchée à J+30 pour les non-convertis)

**Déclencheur :** utilisateur inscrit depuis 30 jours + statut = "non converti" + pas d'achat Kit

---

**Email R1 — J+30 — Rappel urgence réglementaire**

- **Objet A :** La réforme 2026 arrive — votre compte FacturEasy vous attend
- **Objet B :** {{ prénom }}, êtes-vous prêt pour le 1er septembre 2026 ?
- **Angle :** prise de conscience + urgence croissante · lien direct vers `/upgrade`
- **CTA :** "Reprendre mon essai — 0 € aujourd'hui"

---

**Email R2 — J+45 — Preuve sociale + offre**

- **Objet A :** Comment des PME comme la vôtre ont passé le cap Chorus Pro
- **Objet B :** {{ prénom }}, voici ce que vous avez manqué ce mois-ci
- **Angle :** 2 témoignages + stats (ex : "96 % de taux d'acceptation Chorus Pro") + renouvellement de l'offre Kit Autonomie
- **CTA :** "Essayer à nouveau gratuitement" ou "Obtenir le Pack Onboarding — 99 €"

---

**Email R3 — J+60 — Dernier contact + feedback**

- **Objet :** Une dernière question, {{ prénom }}
- **Angle :** Email court, humain, sans offre commerciale. Demande de retour sincère sur pourquoi la conversion n'a pas eu lieu
- **CTA :** Lien vers formulaire [Typeform](https://typeform.com) en 3 questions (bloquant ? prix ? pas le bon moment ?)
- **Objectif secondaire :** données quali pour améliorer le produit et le funnel

---

**Metric cible réactivation :**
| Metric | Cible |
|---|---|
| Taux d'ouverture séquence réactivation | > 35 % |
| Taux de conversion réactivation (sur les non-convertis) | > 5 % |
| Taux de réponse email R3 (feedback) | > 10 % |

---

## Stack outils recommandée (résumé)

| Étape | Outil | Coût estimé/mois |
|---|---|---|
| Email marketing & automation | [Brevo](https://brevo.com) | 0–34 € |
| Paiement & abonnements | [Stripe](https://stripe.com) | 1,4 % + 0,25 € / transaction |
| A/B test landing | [VWO](https://vwo.com) ou [A/B Tasty](https://www.abtasty.com) | 0–199 € |
| Heatmaps & sessions | [Hotjar](https://hotjar.com) | 0–32 € |
| Chat & in-app messaging | [Crisp](https://crisp.chat) | 0–25 € |
| Analytics | [Google Analytics 4](https://analytics.google.com) | 0 € |
| NPS & formulaires | [Typeform](https://typeform.com) | 0–25 € |
| Suivi CRM léger | [Notion](https://notion.so) ou [Airtable](https://airtable.com) | 0–20 € |
| Vidéos onboarding | [Loom](https://loom.com) | 0–12 € |
| SEO & mots-clés | [Semrush](https://semrush.com) | 119 € |
| **Total stack estimé** | | **< 500 €/mois** |

---

## Objectifs globaux du funnel — tableau de bord

| Metric | M+1 | M+3 | M+6 | M+12 |
|---|---|---|---|---|
| Visiteurs/mois | 200 | 800 | 2 000 | 5 000 |
| Inscrits essai/mois | 20 | 80 | 200 | 500 |
| Taux inscription (visite→essai) | 10 % | 10 % | 10 % | 10 % |
| Taux activation (essai→facture) | 30 % | 35 % | 40 % | 45 % |
| Taux conversion (essai→payant) | 12 % | 15 % | 18 % | 20 % |
| Nouveaux clients payants/mois | 2 | 12 | 36 | 100 |
| MRR estimé (mix Solo/Pro) | ~80 € | ~480 € | ~1 440 € | ~4 000 € |
| ARR estimé | ~960 € | ~5 760 € | ~17 280 € | ~48 000 € |

---

## Règles d'or du funnel self-service

1. **Un email = un objectif = un CTA.** Jamais deux appels à l'action dans le même email.
2. **Friction zéro à l'inscription.** Email uniquement. Pas de CB. Pas de formulaire company/poste.
3. **Le support est sur demande et payant** (Kit Autonomie). On ne répond pas aux questions non sollicitées en dehors du support payant.
4. **Tout ce qui peut être automatisé doit l'être.** Aucun humain dans la boucle sauf pour les feedbacks R3.
5. **Les metrics hebdomadaires priment.** Taux d'activation J+7 > taux de conversion J+14. Un utilisateur activé convertit 4x plus.
