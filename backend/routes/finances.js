/**
 * FacturEasy — Routes /finances
 *
 * Couvre : catégories de dépenses, dépenses, revenus manuels,
 *          récapitulatif TVA, dashboard trésorerie.
 *
 * Toutes les routes sont protégées par le middleware JWT `authenticate`.
 * Montage recommandé dans server.js :
 *   const financesRouter = require('./routes/finances');
 *   app.use('/finances', authenticate, financesRouter);
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Migration / initialisation des tables ───────────────────────────────────
// Appelez GET /finances/init-db (protégé) une seule fois en déploiement initial.

router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      -- Catégories de dépenses
      CREATE TABLE IF NOT EXISTS categories (
        id         SERIAL PRIMARY KEY,
        nom        VARCHAR(100) NOT NULL,
        icone      VARCHAR(50)  DEFAULT '📦',
        couleur    VARCHAR(20)  DEFAULT '#6B7280',
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Dépenses de l'entreprise
      CREATE TABLE IF NOT EXISTS depenses (
        id               SERIAL PRIMARY KEY,
        siret            VARCHAR(14)   NOT NULL,
        libelle          VARCHAR(255)  NOT NULL,
        montant_ttc      NUMERIC(12,2) NOT NULL,
        montant_ht       NUMERIC(12,2) NOT NULL,
        tva_taux         NUMERIC(5,2)  DEFAULT 20,
        categorie_id     INTEGER       REFERENCES categories(id),
        date_depense     TIMESTAMPTZ   DEFAULT NOW(),
        justificatif_url TEXT,
        created_at       TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_depenses_siret        ON depenses(siret);
      CREATE INDEX IF NOT EXISTS idx_depenses_date         ON depenses(date_depense);
      CREATE INDEX IF NOT EXISTS idx_depenses_categorie    ON depenses(categorie_id);

      -- Revenus manuels (hors Chorus Pro)
      CREATE TABLE IF NOT EXISTS revenus_manuels (
        id                SERIAL PRIMARY KEY,
        siret             VARCHAR(14)   NOT NULL,
        libelle           VARCHAR(255)  NOT NULL,
        client_nom        VARCHAR(255),
        montant_ttc       NUMERIC(12,2) NOT NULL,
        montant_ht        NUMERIC(12,2) NOT NULL,
        tva_taux          NUMERIC(5,2)  DEFAULT 20,
        date_encaissement TIMESTAMPTZ   DEFAULT NOW(),
        created_at        TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_revenus_manuels_siret ON revenus_manuels(siret);
      CREATE INDEX IF NOT EXISTS idx_revenus_manuels_date  ON revenus_manuels(date_encaissement);
    `);
    res.json({ ok: true, message: 'Tables finances initialisées' });
  } catch (err) {
    console.error('[finances/init-db]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Catégories par défaut ────────────────────────────────────────────────────

const CATEGORIES_DEFAUT = [
  { nom: 'Loyer & hébergement',      icone: '🏢', couleur: '#3B82F6' },
  { nom: 'Outils & logiciels',       icone: '💻', couleur: '#8B5CF6' },
  { nom: 'Télécommunications',       icone: '📱', couleur: '#06B6D4' },
  { nom: 'Marketing & publicité',    icone: '📣', couleur: '#F59E0B' },
  { nom: 'Déplacements',             icone: '🚗', couleur: '#10B981' },
  { nom: 'Fournitures',              icone: '📦', couleur: '#6B7280' },
  { nom: 'Comptabilité & juridique', icone: '⚖️',  couleur: '#EF4444' },
  { nom: 'Autre',                    icone: '🔖', couleur: '#D1D5DB' },
];

// ─── Utilitaire : construction du filtre mois/année ──────────────────────────

/**
 * Retourne une clause SQL et les paramètres pour filtrer par mois/année.
 * @param {string|undefined} mois  Format "YYYY-MM" ou undefined
 * @param {string|undefined} annee Format "YYYY"   ou undefined
 * @param {string}           col   Nom de la colonne de date (ex: "date_depense")
 * @param {number}           startIdx Index de départ pour les paramètres ($N)
 * @returns {{ clause: string, params: any[], nextIdx: number }}
 */
function buildDateFilter(mois, annee, col, startIdx) {
  const params = [];
  const conditions = [];
  let idx = startIdx;

  if (mois) {
    // mois au format "YYYY-MM"
    const [y, m] = mois.split('-');
    conditions.push(`EXTRACT(YEAR  FROM ${col}) = $${idx++}`);
    params.push(parseInt(y, 10));
    conditions.push(`EXTRACT(MONTH FROM ${col}) = $${idx++}`);
    params.push(parseInt(m, 10));
  } else if (annee) {
    conditions.push(`EXTRACT(YEAR FROM ${col}) = $${idx++}`);
    params.push(parseInt(annee, 10));
  }

  return {
    clause: conditions.length ? ' AND ' + conditions.join(' AND ') : '',
    params,
    nextIdx: idx,
  };
}

// ─── TVA : taux autorisés ─────────────────────────────────────────────────────

const TVA_TAUX_VALIDES = [0, 2.1, 5.5, 10, 20];

// =============================================================================
// 1. GET /finances/categories — liste des catégories
// =============================================================================

router.get('/categories', authenticate, async (req, res) => {
  try {
    let { rows } = await pool.query(
      'SELECT id, nom, icone, couleur FROM categories ORDER BY id'
    );

    // Si la table est vide, on insère les catégories par défaut et on les retourne
    if (rows.length === 0) {
      const insertValues = CATEGORIES_DEFAUT.map((c, i) => {
        const base = i * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      }).join(', ');

      const flatParams = CATEGORIES_DEFAUT.flatMap(c => [c.nom, c.icone, c.couleur]);

      const inserted = await pool.query(
        `INSERT INTO categories (nom, icone, couleur) VALUES ${insertValues} RETURNING id, nom, icone, couleur`,
        flatParams
      );
      rows = inserted.rows;
    }

    res.json(rows);
  } catch (err) {
    console.error('[GET /categories]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 2. POST /finances/categories — création d'une catégorie
// =============================================================================

router.post('/categories', authenticate, async (req, res) => {
  const { nom, icone = '📦', couleur = '#6B7280' } = req.body;

  if (!nom || !nom.trim()) {
    return res.status(400).json({ error: 'Le champ "nom" est obligatoire' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (nom, icone, couleur) VALUES ($1, $2, $3) RETURNING *',
      [nom.trim(), icone, couleur]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /categories]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 3. GET /finances/depenses — liste des dépenses d'un SIRET
//    Query params : siret (obligatoire), mois (YYYY-MM), annee (YYYY), categorie_id
// =============================================================================

router.get('/depenses', authenticate, async (req, res) => {
  // IDOR fix: siret forcé depuis le JWT (req.query.siret ignoré)
  const siret = req.user.siret;
  const { mois, annee, categorie_id } = req.query;


  try {
    const params  = [siret];
    let idx       = 2;
    let whereParts = ['d.siret = $1'];

    // Filtre optionnel par catégorie
    if (categorie_id) {
      whereParts.push(`d.categorie_id = $${idx++}`);
      params.push(parseInt(categorie_id, 10));
    }

    // Filtre optionnel par période
    const dateFilter = buildDateFilter(mois, annee, 'd.date_depense', idx);
    if (dateFilter.clause) {
      whereParts.push(dateFilter.clause.replace(' AND ', ''));
      // buildDateFilter renvoie la clause avec " AND " au début — on l'ajoute proprement
    }

    // Construction propre avec buildDateFilter
    let sql = `
      SELECT
        d.*,
        c.nom    AS categorie_nom,
        c.couleur AS categorie_couleur,
        c.icone  AS categorie_icone
      FROM depenses d
      LEFT JOIN categories c ON c.id = d.categorie_id
      WHERE d.siret = $1
    `;
    const allParams = [siret];
    let pIdx = 2;

    if (categorie_id) {
      sql += ` AND d.categorie_id = $${pIdx++}`;
      allParams.push(parseInt(categorie_id, 10));
    }

    const df = buildDateFilter(mois, annee, 'd.date_depense', pIdx);
    sql += df.clause;
    allParams.push(...df.params);

    sql += ' ORDER BY d.date_depense DESC';

    const { rows } = await pool.query(sql, allParams);
    res.json(rows);
  } catch (err) {
    console.error('[GET /depenses]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 4. POST /finances/depenses — enregistrement d'une dépense
// =============================================================================

router.post('/depenses', authenticate, async (req, res) => {
  // IDOR fix: siret forcé depuis le JWT
  const siret = req.user.siret;
  const {
    libelle,
    montant_ttc,
    tva_taux     = 20,
    categorie_id = null,
    date_depense = new Date().toISOString(),
    justificatif_url = null,
  } = req.body;

  // Validation des champs obligatoires
  if (!libelle)     return res.status(400).json({ error: 'Le champ "libelle" est obligatoire' });
  if (montant_ttc === undefined || montant_ttc === null) {
    return res.status(400).json({ error: 'Le champ "montant_ttc" est obligatoire' });
  }

  const tvaNum = parseFloat(tva_taux);
  if (!TVA_TAUX_VALIDES.includes(tvaNum)) {
    return res.status(400).json({
      error: `Taux de TVA invalide. Valeurs acceptées : ${TVA_TAUX_VALIDES.join(', ')}`,
    });
  }

  const ttc = parseFloat(montant_ttc);
  if (isNaN(ttc) || ttc < 0) {
    return res.status(400).json({ error: 'montant_ttc doit être un nombre positif' });
  }

  // Calcul HT
  const montant_ht = parseFloat((ttc / (1 + tvaNum / 100)).toFixed(2));

  try {
    const { rows } = await pool.query(
      `INSERT INTO depenses
        (siret, libelle, montant_ttc, montant_ht, tva_taux, categorie_id, date_depense, justificatif_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [siret, libelle.trim(), ttc, montant_ht, tvaNum, categorie_id, date_depense, justificatif_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /depenses]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 5. DELETE /finances/depenses/:id — suppression d'une dépense
//    Query param : siret (obligatoire, sécurité)
// =============================================================================

router.delete('/depenses/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  // IDOR fix: siret forcé depuis le JWT
  const siret = req.user.siret;

  try {
    // Vérifie que la dépense appartient bien au SIRET du JWT
    const { rows } = await pool.query(
      'SELECT id, siret FROM depenses WHERE id = $1',
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Dépense introuvable' });
    }
    if (rows[0].siret !== siret) {
      return res.status(403).json({ error: 'Accès interdit à cette dépense' });
    }

    await pool.query('DELETE FROM depenses WHERE id = $1', [id]);
    res.json({ ok: true, message: `Dépense #${id} supprimée` });
  } catch (err) {
    console.error('[DELETE /depenses/:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 6. GET /finances/revenus — liste des revenus (factures ACCEPTEE + revenus manuels)
//    Query params : siret (obligatoire), mois (YYYY-MM), annee (YYYY)
// =============================================================================

router.get('/revenus', authenticate, async (req, res) => {
  // IDOR fix: siret forcé depuis le JWT
  const siret = req.user.siret;
  const { mois, annee } = req.query;


  try {
    // --- Partie 1 : factures ACCEPTEE ---
    let sqlFactures = `
      SELECT
        id,
        'facture'          AS source,
        numero             AS libelle,
        client_nom,
        montant_ttc,
        montant_ht,
        tva                AS tva_taux,
        date_emission      AS date_encaissement
      FROM factures
      WHERE emetteur_siret = $1 AND statut = 'ACCEPTEE'
    `;
    const paramsFactures = [siret];
    const dfFactures = buildDateFilter(mois, annee, 'date_emission', 2);
    sqlFactures += dfFactures.clause;
    paramsFactures.push(...dfFactures.params);

    const resFactures = await pool.query(sqlFactures, paramsFactures);

    // --- Partie 2 : revenus manuels (table optionnelle) ---
    let revenusManuelsList = [];
    try {
      let sqlManuels = `
        SELECT
          id,
          'manuel'           AS source,
          libelle,
          client_nom,
          montant_ttc,
          montant_ht,
          tva_taux,
          date_encaissement
        FROM revenus_manuels
        WHERE siret = $1
      `;
      const paramsManuels = [siret];
      const dfManuels = buildDateFilter(mois, annee, 'date_encaissement', 2);
      sqlManuels += dfManuels.clause;
      paramsManuels.push(...dfManuels.params);
      sqlManuels += ' ORDER BY date_encaissement DESC';

      const resManuels = await pool.query(sqlManuels, paramsManuels);
      revenusManuelsList = resManuels.rows;
    } catch (tableErr) {
      // La table revenus_manuels peut ne pas encore exister
      console.warn('[GET /revenus] Table revenus_manuels absente :', tableErr.message);
    }

    // Fusion et tri chronologique décroissant
    const tous = [...resFactures.rows, ...revenusManuelsList].sort(
      (a, b) => new Date(b.date_encaissement) - new Date(a.date_encaissement)
    );

    res.json(tous);
  } catch (err) {
    console.error('[GET /revenus]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 7. POST /finances/revenus — enregistrement d'un revenu manuel
// =============================================================================

router.post('/revenus', authenticate, async (req, res) => {
  // IDOR fix: siret forcé depuis le JWT
  const siret = req.user.siret;
  const {
    libelle,
    montant_ttc,
    tva_taux          = 20,
    date_encaissement = new Date().toISOString(),
    client_nom        = null,
  } = req.body;

  if (!libelle)     return res.status(400).json({ error: 'Le champ "libelle" est obligatoire' });
  if (montant_ttc === undefined || montant_ttc === null) {
    return res.status(400).json({ error: 'Le champ "montant_ttc" est obligatoire' });
  }

  const tvaNum = parseFloat(tva_taux);
  if (!TVA_TAUX_VALIDES.includes(tvaNum)) {
    return res.status(400).json({
      error: `Taux de TVA invalide. Valeurs acceptées : ${TVA_TAUX_VALIDES.join(', ')}`,
    });
  }

  const ttc = parseFloat(montant_ttc);
  if (isNaN(ttc) || ttc < 0) {
    return res.status(400).json({ error: 'montant_ttc doit être un nombre positif' });
  }

  const montant_ht = parseFloat((ttc / (1 + tvaNum / 100)).toFixed(2));

  try {
    const { rows } = await pool.query(
      `INSERT INTO revenus_manuels
        (siret, libelle, client_nom, montant_ttc, montant_ht, tva_taux, date_encaissement)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [siret, libelle.trim(), client_nom, ttc, montant_ht, tvaNum, date_encaissement]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /revenus]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 8. GET /finances/vat-summary/:siret — récapitulatif TVA du mois
//    Query params : mois (YYYY-MM), annee (YYYY)
// =============================================================================

router.get(['/vat-summary/:siret', '/ca3/:siret'], authenticate, async (req, res) => {
  const { siret }     = req.params;
  const { mois, annee } = req.query;

  // IDOR fix: un utilisateur ne peut consulter que son propre récapitulatif TVA
  if (siret !== req.user.siret) {
    return res.status(403).json({ error: 'Accès interdit à ce récapitulatif TVA' });
  }

  // Période par défaut : mois courant
  const now         = new Date();
  const periodeAn   = mois ? mois.split('-')[0] : String(now.getFullYear());
  const periodeMois = mois ? mois.split('-')[1] : String(now.getMonth() + 1).padStart(2, '0');
  const periode     = `${periodeAn}-${periodeMois}`;

  try {
    // --- TVA collectée : factures ACCEPTEE ---
    const resFactures = await pool.query(`
      SELECT COALESCE(SUM(montant_ttc - montant_ht), 0) AS tva
      FROM factures
      WHERE emetteur_siret = $1
        AND statut = 'ACCEPTEE'
        AND EXTRACT(YEAR  FROM date_emission) = $2
        AND EXTRACT(MONTH FROM date_emission) = $3
    `, [siret, parseInt(periodeAn, 10), parseInt(periodeMois, 10)]);

    let tva_collectee = parseFloat(resFactures.rows[0]?.tva || 0);

    // + TVA collectée sur revenus manuels
    try {
      const resManuels = await pool.query(`
        SELECT COALESCE(SUM(montant_ttc - montant_ht), 0) AS tva
        FROM revenus_manuels
        WHERE siret = $1
          AND EXTRACT(YEAR  FROM date_encaissement) = $2
          AND EXTRACT(MONTH FROM date_encaissement) = $3
      `, [siret, parseInt(periodeAn, 10), parseInt(periodeMois, 10)]);
      tva_collectee += parseFloat(resManuels.rows[0]?.tva || 0);
    } catch (_) {
      // Table optionnelle
    }

    // --- TVA déductible : dépenses ---
    const resDepenses = await pool.query(`
      SELECT COALESCE(SUM(montant_ttc - montant_ht), 0) AS tva
      FROM depenses
      WHERE siret = $1
        AND EXTRACT(YEAR  FROM date_depense) = $2
        AND EXTRACT(MONTH FROM date_depense) = $3
    `, [siret, parseInt(periodeAn, 10), parseInt(periodeMois, 10)]);

    const tva_deductible = parseFloat(resDepenses.rows[0]?.tva || 0);
    const tva_a_reverser = parseFloat((tva_collectee - tva_deductible).toFixed(2));

    res.json({
      meta: { siret, periode },
      periode,
      tva_collectee:  parseFloat(tva_collectee.toFixed(2)),
      tva_deductible: parseFloat(tva_deductible.toFixed(2)),
      tva_a_reverser,
    });
  } catch (err) {
    console.error('[GET /vat-summary/:siret]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// 9. GET /finances/dashboard/:siret — vue agrégée trésorerie
//    Query params : mois (YYYY-MM), annee (YYYY)
// =============================================================================

router.get('/dashboard/:siret', authenticate, async (req, res) => {
  const { siret }       = req.params;
  const { mois, annee } = req.query;

  // IDOR fix: un utilisateur ne peut consulter que son propre dashboard
  if (siret !== req.user.siret) {
    return res.status(403).json({ error: 'Accès interdit à ce dashboard' });
  }

  const now         = new Date();
  const periodeAn   = mois ? mois.split('-')[0] : String(now.getFullYear());
  const periodeMois = mois ? mois.split('-')[1] : String(now.getMonth() + 1).padStart(2, '0');
  const periodeStr  = `${periodeAn}-${periodeMois}`;
  const anNum  = parseInt(periodeAn, 10);
  const moisNum = parseInt(periodeMois, 10);

  try {
    // --- Chiffre d'affaires global (factures EMISE + EN_COURS + ACCEPTEE) ---
    const resCaGlobal = await pool.query(`
      SELECT
        COALESCE(SUM(montant_ttc), 0) AS ca_ttc,
        COALESCE(SUM(montant_ht),  0) AS ca_ht
      FROM factures
      WHERE emetteur_siret = $1
        AND statut IN ('EMISE', 'EN_COURS', 'ACCEPTEE')
        AND EXTRACT(YEAR  FROM date_emission) = $2
        AND EXTRACT(MONTH FROM date_emission) = $3
    `, [siret, anNum, moisNum]);

    // --- CA encaissé (factures ACCEPTEE uniquement) ---
    const resCaEncaisse = await pool.query(`
      SELECT
        COALESCE(SUM(montant_ttc), 0) AS ca_encaisse_ttc,
        COALESCE(SUM(montant_ht),  0) AS ca_encaisse_ht
      FROM factures
      WHERE emetteur_siret = $1
        AND statut = 'ACCEPTEE'
        AND EXTRACT(YEAR  FROM date_emission) = $2
        AND EXTRACT(MONTH FROM date_emission) = $3
    `, [siret, anNum, moisNum]);

    // --- Dépenses du mois ---
    const resDepenses = await pool.query(`
      SELECT
        COALESCE(SUM(montant_ttc), 0) AS depenses_ttc,
        COALESCE(SUM(montant_ht),  0) AS depenses_ht
      FROM depenses
      WHERE siret = $1
        AND EXTRACT(YEAR  FROM date_depense) = $2
        AND EXTRACT(MONTH FROM date_depense) = $3
    `, [siret, anNum, moisNum]);

    // --- Compteurs de factures ---
    const resCompteurs = await pool.query(`
      SELECT
        COUNT(*)                                          AS nb_factures_emises,
        COUNT(*) FILTER (WHERE statut = 'ACCEPTEE')      AS nb_factures_acceptees,
        COUNT(*) FILTER (WHERE statut IN ('REJETEE','REFUSEE')) AS nb_factures_rejetees
      FROM factures
      WHERE emetteur_siret = $1
        AND EXTRACT(YEAR  FROM date_emission) = $2
        AND EXTRACT(MONTH FROM date_emission) = $3
    `, [siret, anNum, moisNum]);

    // --- 5 dernières factures (tous mois confondus) ---
    const resRecentes = await pool.query(`
      SELECT id, numero, client_nom, montant_ttc, montant_ht, statut, date_emission
      FROM factures
      WHERE emetteur_siret = $1
      ORDER BY date_emission DESC
      LIMIT 5
    `, [siret]);

    // --- TVA à reverser ---
    const resTVA = await pool.query(`
      SELECT
        COALESCE(SUM(montant_ttc - montant_ht), 0) AS tva_collectee
      FROM factures
      WHERE emetteur_siret = $1
        AND statut = 'ACCEPTEE'
        AND EXTRACT(YEAR  FROM date_emission) = $2
        AND EXTRACT(MONTH FROM date_emission) = $3
    `, [siret, anNum, moisNum]);

    let tva_collectee = parseFloat(resTVA.rows[0].tva_collectee);

    try {
      const resTVAManuels = await pool.query(`
        SELECT COALESCE(SUM(montant_ttc - montant_ht), 0) AS tva
        FROM revenus_manuels
        WHERE siret = $1
          AND EXTRACT(YEAR  FROM date_encaissement) = $2
          AND EXTRACT(MONTH FROM date_encaissement) = $3
      `, [siret, anNum, moisNum]);
      tva_collectee += parseFloat(resTVAManuels.rows[0].tva);
    } catch (_) { /* table optionnelle */ }

    const depenses_ht    = parseFloat(resDepenses.rows[0].depenses_ht);
    const tva_deductible = parseFloat(resDepenses.rows[0].depenses_ttc) - depenses_ht;
    const tva_a_reverser = parseFloat((tva_collectee - tva_deductible).toFixed(2));

    const ca_encaisse_ht = parseFloat(resCaEncaisse.rows[0].ca_encaisse_ht);
    const resultat_ht    = parseFloat((ca_encaisse_ht - depenses_ht).toFixed(2));

    res.json({
      periode:               periodeStr,
      // Chiffre d'affaires
      ca_ttc:                parseFloat(resCaGlobal.rows[0].ca_ttc),
      ca_ht:                 parseFloat(resCaGlobal.rows[0].ca_ht),
      // CA réellement encaissé
      ca_encaisse_ttc:       parseFloat(resCaEncaisse.rows[0].ca_encaisse_ttc),
      ca_encaisse_ht,
      // Dépenses
      depenses_ttc:          parseFloat(resDepenses.rows[0].depenses_ttc),
      depenses_ht,
      // Résultat et TVA
      resultat_ht,
      tva_a_reverser,
      // Compteurs factures
      nb_factures_emises:    parseInt(resCompteurs.rows[0].nb_factures_emises,   10),
      nb_factures_acceptees: parseInt(resCompteurs.rows[0].nb_factures_acceptees, 10),
      nb_factures_rejetees:  parseInt(resCompteurs.rows[0].nb_factures_rejetees,  10),
    });
  } catch (err) {
    console.error('[GET /finances/dashboard]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
