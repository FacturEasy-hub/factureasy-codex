/**
 * FacturEasy — Routes /rapports
 *
 * Rapports financiers et analytiques SIRET-scoped.
 *
 * GET /rapports/bilan               — Bilan simplifié (actif/passif/résultat)
 * GET /rapports/flux-tresorerie     — Flux de trésorerie mensuel par année/trimestre
 * GET /rapports/top-clients         — Top clients par CA HT
 * GET /rapports/entonnoir-factures  — Répartition des factures par statut
 *
 * À AJOUTER dans server.js : app.use('/rapports', require('./routes/rapports'));
 */

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Bilan simplifié ──────────────────────────────────────────────────────────

// GET /rapports/bilan?annee=2025
router.get('/bilan', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const annee = parseInt(req.query.annee) || new Date().getFullYear();

    // Créances clients : factures non encore payées (envoyées ou en retard)
    const { rows: creancesRows } = await pool.query(`
      SELECT COALESCE(SUM(montant_ttc), 0) AS total
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
        AND statut IN ('ENVOYEE', 'EN_RETARD')
    `, [siret, annee]);

    // TVA collectée : factures émises, payées ou en retard
    const { rows: tvaCollecteeRows } = await pool.query(`
      SELECT COALESCE(SUM(montant_tva), 0) AS total
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
        AND statut IN ('ENVOYEE', 'PAYEE', 'EN_RETARD')
    `, [siret, annee]);

    // Trésorerie estimée : encaissements réels (factures PAYEE)
    const { rows: tresorerieRows } = await pool.query(`
      SELECT COALESCE(SUM(montant_ttc), 0) AS total
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
        AND statut = 'PAYEE'
    `, [siret, annee]);

    // Dettes fournisseurs : dépenses en attente
    // On vérifie si la colonne statut existe sur la table depenses
    let dettesFournisseurs = 0;
    try {
      const { rows: dettesRows } = await pool.query(`
        SELECT COALESCE(SUM(montant_ttc), 0) AS total
        FROM depenses
        WHERE siret = $1
          AND EXTRACT(YEAR FROM date_depense) = $2
          AND statut = 'PENDING'
      `, [siret, annee]);
      dettesFournisseurs = parseFloat(dettesRows[0].total);
    } catch (_) {
      // La colonne statut n'existe peut-être pas — on retourne 0
      dettesFournisseurs = 0;
    }

    // TVA déductible : toutes les dépenses de l'année
    const { rows: tvaDedRows } = await pool.query(`
      SELECT COALESCE(SUM(montant_tva), 0) AS total
      FROM depenses
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_depense) = $2
    `, [siret, annee]);

    const creancesClients   = parseFloat(creancesRows[0].total);
    const tresorerieEstimee = parseFloat(tresorerieRows[0].total);
    const tvaCollectee      = parseFloat(tvaCollecteeRows[0].total);
    const tvaDeductible     = parseFloat(tvaDedRows[0].total);
    const tvaDue            = Math.max(0, tvaCollectee - tvaDeductible);

    const totalActif  = creancesClients + tresorerieEstimee;
    const totalPassif = dettesFournisseurs + tvaCollectee + tvaDeductible + tvaDue;
    const resultatNet = totalActif - dettesFournisseurs - tvaDue;

    res.json({
      actif: {
        creances_clients: creancesClients,
        tresorerie_estimee: tresorerieEstimee,
        total: totalActif,
      },
      passif: {
        dettes_fournisseurs: dettesFournisseurs,
        tva_collectee: tvaCollectee,
        tva_deductible: tvaDeductible,
        tva_due: tvaDue,
        total: totalPassif,
      },
      resultat_net: resultatNet,
    });
  } catch (err) {
    console.error('[GET /rapports/bilan]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Flux de trésorerie ───────────────────────────────────────────────────────

// GET /rapports/flux-tresorerie?annee=2025&trimestre=2
router.get('/flux-tresorerie', authenticate, async (req, res) => {
  try {
    const siret     = req.user.siret;
    const annee     = parseInt(req.query.annee) || new Date().getFullYear();
    const trimestre = req.query.trimestre ? parseInt(req.query.trimestre) : null;

    // Déterminer la plage de mois
    let moisDebut = 1;
    let moisFin   = 12;
    if (trimestre && trimestre >= 1 && trimestre <= 4) {
      moisDebut = (trimestre - 1) * 3 + 1;
      moisFin   = moisDebut + 2;
    }

    // Encaissements : factures PAYEE par mois
    const { rows: encaissementsRows } = await pool.query(`
      SELECT
        EXTRACT(MONTH FROM date_emission)::INT AS mois,
        COALESCE(SUM(montant_ttc), 0)          AS encaissements
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
        AND statut = 'PAYEE'
        AND EXTRACT(MONTH FROM date_emission) BETWEEN $3 AND $4
      GROUP BY mois
      ORDER BY mois ASC
    `, [siret, annee, moisDebut, moisFin]);

    // Décaissements : toutes dépenses par mois
    const { rows: decaissementsRows } = await pool.query(`
      SELECT
        EXTRACT(MONTH FROM date_depense)::INT AS mois,
        COALESCE(SUM(montant_ttc), 0)         AS decaissements
      FROM depenses
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_depense) = $2
        AND EXTRACT(MONTH FROM date_depense) BETWEEN $3 AND $4
      GROUP BY mois
      ORDER BY mois ASC
    `, [siret, annee, moisDebut, moisFin]);

    // Indexer par mois
    const encMap = {};
    for (const row of encaissementsRows) {
      encMap[row.mois] = parseFloat(row.encaissements);
    }
    const decMap = {};
    for (const row of decaissementsRows) {
      decMap[row.mois] = parseFloat(row.decaissements);
    }

    // Construire le tableau résultat
    const resultats = [];
    for (let m = moisDebut; m <= moisFin; m++) {
      const encaissements  = encMap[m]  || 0;
      const decaissements  = decMap[m]  || 0;
      const solde_net      = encaissements - decaissements;
      resultats.push({ mois: m, encaissements, decaissements, solde_net });
    }

    res.json(resultats);
  } catch (err) {
    console.error('[GET /rapports/flux-tresorerie]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Top clients ──────────────────────────────────────────────────────────────

// GET /rapports/top-clients?annee=2025&limit=5
router.get('/top-clients', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));

    const { rows } = await pool.query(`
      SELECT
        client_nom,
        COALESCE(client_siret, '')                           AS client_siret,
        COALESCE(SUM(montant_ht), 0)                        AS total_ht,
        COUNT(*)                                             AS nb_factures,
        COALESCE(
          AVG(
            CASE
              WHEN statut = 'PAYEE' AND date_paiement IS NOT NULL
              THEN EXTRACT(DAY FROM (date_paiement - date_emission))
            END
          ), 0
        )::INT                                              AS delai_moyen_paiement_jours
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
      GROUP BY client_nom, client_siret
      ORDER BY total_ht DESC
      LIMIT $3
    `, [siret, annee, limit]);

    res.json(rows.map(r => ({
      client_nom: r.client_nom,
      client_siret: r.client_siret || null,
      total_ht: parseFloat(r.total_ht),
      nb_factures: parseInt(r.nb_factures),
      delai_moyen_paiement_jours: parseInt(r.delai_moyen_paiement_jours),
    })));
  } catch (err) {
    console.error('[GET /rapports/top-clients]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Entonnoir factures ───────────────────────────────────────────────────────

// GET /rapports/entonnoir-factures
router.get('/entonnoir-factures', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const annee = parseInt(req.query.annee) || new Date().getFullYear();

    const statuts = ['BROUILLON', 'ENVOYEE', 'PAYEE', 'EN_RETARD', 'ANNULEE'];

    const { rows } = await pool.query(`
      SELECT
        statut,
        COUNT(*)                      AS count,
        COALESCE(SUM(montant_ttc), 0) AS montant_total
      FROM factures
      WHERE siret = $1
        AND EXTRACT(YEAR FROM date_emission) = $2
      GROUP BY statut
    `, [siret, annee]);

    // Indexer par statut
    const map = {};
    for (const row of rows) {
      map[row.statut] = {
        statut: row.statut,
        count: parseInt(row.count),
        montant_total: parseFloat(row.montant_total),
      };
    }

    // Retourner dans l'ordre canonique, en incluant les statuts à zéro
    const result = statuts.map(s => map[s] || { statut: s, count: 0, montant_total: 0 });

    res.json(result);
  } catch (err) {
    console.error('[GET /rapports/entonnoir-factures]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

// À AJOUTER dans server.js : app.use('/rapports', require('./routes/rapports'));
