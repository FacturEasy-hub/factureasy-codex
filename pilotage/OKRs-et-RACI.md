# FacturEasy — Pilotage projet : OKRs & RACI
*Version 2.0 — Mai 2026 · Modèle solo founder, 5h/semaine en croisière*

---

## OKRs Q3 2026 (juillet → septembre) — Focus lancement

### Objectif 1 — Lancer et acquérir les 10 premiers clients payants

| Résultat clé | Cible | Mesure | Fréquence de suivi |
|---|---|---|---|
| KR1 : Clients actifs (abonnement Solo ou Pro) | 10 avant le 1er sept. 2026 | Dashboard Stripe | Hebdomadaire |
| KR2 : NPS (questionnaire J+30 post-inscription) | > 40 | Formulaire Typeform | Mensuelle |
| KR3 : Taux d'activation (1ère facture émise dans les 7 jours) | > 60% | Analytics produit | Hebdomadaire |

**Commentaire O1 :** Le taux d'activation est l'indicateur le plus critique en phase de lancement. Un utilisateur qui crée sa première facture dans les 7 jours a 3x plus de chances de convertir en payant. Toute friction sur ce parcours est à corriger en priorité.

---

### Objectif 2 — Automatiser l'acquisition à zéro effort humain

| Résultat clé | Cible | Mesure | Fréquence de suivi |
|---|---|---|---|
| KR1 : Séquence email 6 emails opérationnelle sur Brevo | 100% des nouveaux inscrits reçoivent la séquence complète | Test manuel + rapport Brevo | À la mise en production |
| KR2 : Google Ads active avec ROAS > 2 | ROAS mensuel > 2 | Google Ads Manager | Mensuelle |
| KR3 : CAC moyen | < 40€ | (Budget Ads + outils) / Nouveaux clients | Mensuelle |

**Commentaire O2 :** Le CAC cible est 35€. La limite d'alerte est 40€. Au-delà de 60€, couper les Ads et concentrer les efforts sur le SEO organique pendant 30 jours.

---

## OKRs Q4 2026 (octobre → décembre) — Consolidation et montée en charge

### Objectif 3 — Atteindre un MRR stable et croissant

| Résultat clé | Cible | Mesure | Fréquence de suivi |
|---|---|---|---|
| KR1 : MRR fin décembre 2026 | > 1 300€ | Dashboard Stripe | Hebdomadaire |
| KR2 : Clients actifs fin décembre 2026 | > 35 | CRM / Stripe | Hebdomadaire |
| KR3 : Churn mensuel | < 5% | MRR Churn = MRR perdu / MRR début de mois | Mensuelle |
| KR4 : Ventes Kit Autonomie | ≥ 5 unités sur le trimestre | Stripe one-time | Mensuelle |

---

### Objectif 4 — Réduire le temps de support à < 1h/semaine

| Résultat clé | Cible | Mesure | Fréquence de suivi |
|---|---|---|---|
| KR1 : FAQ et base de connaissance en ligne | ≥ 20 articles publiés | Nombre d'articles sur factureasy.fr/aide | Fin Q4 |
| KR2 : Taux de résolution en self-service | > 70% des tickets | (Tickets résolus sans réponse humaine) / Total tickets | Mensuelle |
| KR3 : Temps fondateur support/semaine | < 1h | Suivi personnel (timer) | Hebdomadaire |

---

## OKRs 2027 (vision annuelle) — Orientation

| Objectif | Cible |
|---|---|
| MRR fin 2027 | > 7 400€ (200 clients) |
| Churn mensuel | < 3% |
| CAC | < 45€ |
| Temps fondateur hebdomadaire | 5h/semaine maximum |
| Kit Autonomie — ventes cumulées | > 100 unités |
| NPS global | > 50 |

---

## Budget temps hebdomadaire (5h/semaine — phase croisière M4+)

| Créneau | Activité | Durée | Outil / Livrable |
|---|---|---|---|
| Lundi matin | Monitoring métriques + support urgent | 1h | Dashboard Stripe, boîte email |
| Mercredi | Contenu SEO / LinkedIn | 1h | Article de blog ou post LinkedIn |
| Jeudi | Maintenance produit (bugs, améliorations mineures) | 1h | GitHub Issues |
| Vendredi matin | Révision Google Ads + analyse analytics | 1h | Google Ads Manager, GA4 |
| Vendredi après-midi | Développement fonctionnalité (backlog) | 1h | GitHub, Railway |

**Note :** Les sessions de Support Premium (99€/h, sur demande client) s'ajoutent à ce budget mais sont rémunérées — elles ne comptent pas comme du temps "coût". Limiter à 4h/semaine max pour ne pas réintroduire une dépendance au temps humain.

**Phase build M1-M3 :** 30h/semaine. Cet investissement initial est le seul moment où le fondateur travaille à plein temps sur le projet.

---

## Matrice RACI

*R = Responsable (fait le travail) · A = Approbateur (décide) · C = Consulté · I = Informé*

*Organisation : solo founder. Toutes les décisions et exécutions sont portées par le Fondateur. Les outils et automations (Brevo, Google Ads, Stripe) sont les "exécutants" des processus répétitifs.*

| Tâche | Fondateur | Stripe/Brevo/Ads | Client | Tiers (avocat, compta) |
|---|---|---|---|---|
| Décision stratégique (prix, pivot, roadmap) | **R/A** | — | I | — |
| Développement backend et frontend | **R/A** | — | — | — |
| Déploiement production | **R/A** | — | — | — |
| Signature contrats clients (CGV acceptées en ligne) | **A** | — | **R** | — |
| Facturation mensuelle (abonnements) | I | **R** (Stripe auto) | I | — |
| Onboarding email (séquence 6 emails) | **A** (paramétrage) | **R** (Brevo auto) | I | — |
| Acquisition payante (Google Ads) | **A** (paramétrage) | **R** (Ads auto) | — | — |
| Publication contenu SEO / LinkedIn | **R/A** | — | — | — |
| Support email standard | **R** | — | C | — |
| Sessions Support Premium (99€/h) | **R/A** | — | C | — |
| Validation juridique CGV / contrats | **R** (application) | — | — | **A** (avocat) |
| Déclaration URSSAF / comptabilité | **R/A** | — | — | C (compta si besoin) |
| Monitoring infrastructure (uptime, erreurs) | **R** | — | — | — |
| Mise à jour Kit Autonomie (vidéos, PDFs) | **R/A** | — | — | — |

---

## Revue hebdomadaire (solo — 15 min chaque lundi)

**Trois questions :**
1. Qu'est-ce qui a avancé la semaine passée ? (MRR, clients, bugs corrigés)
2. Quel est le blocage ou l'alerte principale ? (churn en hausse, CAC qui dérive, bug critique)
3. Quelle est la seule chose à faire cette semaine qui aura le plus d'impact ?

**Format de suivi :** noter dans un fichier `pilotage/journal-hebdo.md` — 5 lignes maximum, date + 3 réponses.

---

## Point mensuel (fin de chaque mois, 45 min)

**Agenda type :**
1. Lecture des KPIs (MRR, ARR, nouveaux clients, churn, CAC, NPS)
2. Vérification des OKRs en cours — avancement en %
3. Décision go/no-go sur un investissement (budget Ads, nouvelle fonctionnalité, outil)
4. Une action corrective si un KR est en retard de > 20%
5. Mise à jour du backlog produit selon les retours clients du mois

---

## Jalons de décision formels

| Date | Jalon | Question | Action si NON |
|---|---|---|---|
| 1er sept. 2026 | Lancement officiel | Le produit est-il déployé et testable ? | Décaler le lancement de 2 semaines, pas plus |
| 1er oct. 2026 | Validation traction | A-t-on 10 clients actifs ? | Analyser le taux d'activation, A/B test onboarding |
| 1er déc. 2026 | Validation acquisition | Le CAC est-il < 50€ ? | Couper Google Ads, SEO only pendant 60 jours |
| 1er mars 2027 | Validation churn | Le churn est-il < 4% ? | Lancer enquête churners, révision du produit |
| 1er juin 2027 | Jalon croissance | MRR > 4 000€ ? | Évaluer le besoin d'un canal d'acquisition supplémentaire |
| 1er janv. 2028 | Décision structurelle | CA annualisé > 80 000€ ? | Basculer en SASU si encore micro-entrepreneur |

---

## Registre des risques

| Risque | Probabilité | Impact | Mitigation | Indicateur d'alerte |
|---|---|---|---|---|
| Taux d'activation < 30% | Moyenne | Élevé | Réviser séquence email + simplifier onboarding | < 3 clients payants à M4+2 semaines |
| Churn > 6% pendant 2 mois consécutifs | Faible | Élevé | Questionnaire churner, amélioration produit prioritaire | Churn > 5% un mois |
| API Chorus Pro instable | Faible | Élevé | Mode dégradé local, retry automatique, monitoring Sentry | > 3 erreurs API/jour |
| Concurrent PDP baisse ses prix < 20€/mois | Moyenne | Moyen | Défendre sur la simplicité et le Kit Autonomie, pas sur le prix | Alerte Google sur concurrents |
| Fondateur en surcharge (support déborde) | Faible | Moyen | Cap Support Premium à 4h/sem, liste d'attente | > 10 tickets/semaine non résolus |
| Dépassement seuil franchise TVA | Certaine (si succès) | Faible | Anticiper la bascule SASU, provisionner 20% du CA | CA cumulé > 30 000€ |
