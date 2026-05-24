/**
 * FacturEasy — Routes /e-reporting
 *
 * Gestion de l'e-reporting DGFiP : transactions B2C, exports et prestations
 * de services hors facturation B2B Chorus Pro, à déclarer à la DGFiP.
 *
 * Chaque déclaration est scopée au SIRET de l'utilisateur authentifié.
 *
 * Init DB : GET /e-reporting/init-db (protégé JWT, une seule fois)
 */

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Init DB ─────────────────────────────────────────────────────────────────

router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS e_reporting (
        id                 SERIAL PRIMARY KEY,
        siret              VARCHAR(14)   NOT NULL,
        periode            VARCHAR(7)    NOT NULL,
        type_transaction   VARCHAR(20)   NOT NULL,
        montant_ht         NUMERIC(14,2) NOT NULL DEFAULT 0,
        montant_tva        NUMERIC(14,2) NOT NULL DEFAULT 0,
        nb_transactions    INTEGER       NOT NULL DEFAULT 0,
        statut             VARCHAR(20)   DEFAULT 'BROUILLON',
        dgfip_reference    VARCHAR(100),
        transmitted_at     TIMESTAMPTZ,
        created_at         TIMESTAMPTZ   DEFAULT NOW(),
        updated_at         TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_e_reporting_siret   ON e_reporting(siret);
      CREATE INDEX IF NOT EXISTS idx_e_reporting_periode ON e_reporting(siret, periode);
    `);
    res.json({ ok: true, message: 'Table e_reporting créée' });
  } catch (err) {
    console.error('[GET /e-reporting/init-db]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Résumé annuel ────────────────────────────────────────────────────────────

// GET /e-reporting/resume?annee=YYYY
router.get('/resume', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const annee = req.query.annee || new Date().getFullYear().toString();

    if (!/^\d{4}$/.test(annee)) {
      return res.status(400).json({ error: 'Paramètre annee invalide, format attendu : YYYY' });
    }

    const { rows } = await pool.query(`
      SELECT
        type_transaction,
        SUM(montant_ht)      AS total_ht,
        SUM(montant_tva)     AS total_tva,
        SUM(nb_transactions) AS total_transactions,
        COUNT(*)             AS nb_periodes
      FROM e_reporting
      WHERE siret = $1
        AND periode LIKE $2
      GROUP BY type_transaction
      ORDER BY type_transaction ASC
    `, [siret, `${annee}-%`]);

    res.json({ annee, data: rows });
  } catch (err) {
    console.error('[GET /e-reporting/resume]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Liste des déclarations ───────────────────────────────────────────────────

// GET /e-reporting?periode=YYYY-MM
router.get('/', authenticate, async (req, res) => {
  try {
    const siret   = req.user.siret;
    const periode = req.query.periode || null;

    let where    = 'WHERE siret = $1';
    const params = [siret];

    if (periode) {
      if (!/^\d{4}-\d{2}$/.test(periode)) {
        return res.status(400).json({ error: 'Paramètre periode invalide, format attendu : YYYY-MM' });
      }
      params.push(periode);
      where += ` AND periode = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT * FROM e_reporting ${where} ORDER BY periode DESC, type_transaction ASC`,
      params
    );

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[GET /e-reporting]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Créer / mettre à jour une déclaration ───────────────────────────────────

// POST /e-reporting
router.post('/', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const {
      periode,
      type_transaction,
      montant_ht,
      montant_tva,
      nb_transactions,
    } = req.body;

    // Validation des champs requis
    if (!periode || !type_transaction) {
      return res.status(400).json({ error: 'Champs requis : periode, type_transaction' });
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return res.status(400).json({ error: 'Champ periode invalide, format attendu : YYYY-MM' });
    }
    const typesValides = ['B2C', 'EXPORT', 'SERVICE'];
    if (!typesValides.includes(type_transaction)) {
      return res.status(400).json({
        error: `type_transaction invalide. Valeurs acceptées : ${typesValides.join(', ')}`,
      });
    }
    if (montant_ht === undefined || montant_ht === null) {
      return res.status(400).json({ error: 'Champ requis : montant_ht' });
    }
    if (montant_tva === undefined || montant_tva === null) {
      return res.status(400).json({ error: 'Champ requis : montant_tva' });
    }
    if (nb_transactions === undefined || nb_transactions === null) {
      return res.status(400).json({ error: 'Champ requis : nb_transactions' });
    }

    const { rows } = await pool.query(`
      INSERT INTO e_reporting (siret, periode, type_transaction, montant_ht, montant_tva, nb_transactions)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (siret, periode, type_transaction)
      DO UPDATE SET
        montant_ht      = EXCLUDED.montant_ht,
        montant_tva     = EXCLUDED.montant_tva,
        nb_transactions = EXCLUDED.nb_transactions,
        updated_at      = NOW()
      WHERE e_reporting.statut = 'BROUILLON'
      RETURNING *
    `, [
      siret,
      periode,
      type_transaction,
      parseFloat(montant_ht),
      parseFloat(montant_tva),
      parseInt(nb_transactions),
    ]);

    if (!rows.length) {
      return res.status(409).json({
        error: 'Cette déclaration a déjà été transmise ou acceptée et ne peut plus être modifiée.',
      });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /e-reporting]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Transmettre à la DGFiP (simulation) ─────────────────────────────────────

// PATCH /e-reporting/:id/transmettre
router.patch('/:id/transmettre', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }

    // IDOR : vérifier appartenance et récupérer le statut
    const { rows: check } = await pool.query(
      'SELECT id, statut, periode FROM e_reporting WHERE id = $1 AND siret = $2',
      [id, siret]
    );
    if (!check.length) {
      return res.status(404).json({ error: 'Déclaration introuvable' });
    }

    const declaration = check[0];
    if (declaration.statut !== 'BROUILLON') {
      return res.status(400).json({
        error: `Impossible de transmettre : statut actuel "${declaration.statut}" (attendu : BROUILLON)`,
      });
    }

    const annee          = declaration.periode.substring(0, 4);
    const dgfip_reference = `EREPORT-${annee}-${id}`;

    const { rows } = await pool.query(`
      UPDATE e_reporting
      SET statut          = 'TRANSMIS',
          transmitted_at  = NOW(),
          dgfip_reference = $1,
          updated_at      = NOW()
      WHERE id = $2 AND siret = $3
      RETURNING *
    `, [dgfip_reference, id, siret]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /e-reporting/:id/transmettre]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Supprimer (seulement si BROUILLON) ──────────────────────────────────────

// DELETE /e-reporting/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }

    // IDOR : vérifier appartenance et récupérer le statut
    const { rows: check } = await pool.query(
      'SELECT id, statut FROM e_reporting WHERE id = $1 AND siret = $2',
      [id, siret]
    );
    if (!check.length) {
      return res.status(404).json({ error: 'Déclaration introuvable' });
    }

    if (check[0].statut !== 'BROUILLON') {
      return res.status(400).json({
        error: `Suppression impossible : statut "${check[0].statut}". Seules les déclarations en BROUILLON peuvent être supprimées.`,
      });
    }

    await pool.query('DELETE FROM e_reporting WHERE id = $1 AND siret = $2', [id, siret]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /e-reporting/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// À AJOUTER dans server.js : app.use('/e-reporting', require('./routes/e-reporting'));
