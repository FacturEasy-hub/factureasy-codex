/**
 * FacturEasy — Routes /crm
 *
 * Gestion des contrats récurrents clients (CRM simplifié).
 * Chaque contrat est SIRET-scoped.
 *
 * GET  /crm/init-db          — Crée la table crm_contrats
 * GET  /crm/contrats         — Liste des contrats (filtre ?statut=)
 * POST /crm/contrats         — Créer un contrat
 * PUT  /crm/contrats/:id     — Modifier un contrat (IDOR check)
 * DELETE /crm/contrats/:id   — Soft delete (statut=RESILIE)
 * GET  /crm/relances         — Contrats dont la relance est dans les 7 prochains jours
 *
 * À AJOUTER dans server.js : app.use('/crm', require('./routes/crm'));
 */

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Init DB ─────────────────────────────────────────────────────────────────

// GET /crm/init-db
router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_contrats (
        id                SERIAL PRIMARY KEY,
        siret             VARCHAR(14)    NOT NULL,
        client_nom        VARCHAR(255)   NOT NULL,
        client_email      VARCHAR(255),
        montant_mensuel   NUMERIC(12,2)  DEFAULT 0,
        frequence         VARCHAR(20)    DEFAULT 'mensuel',
        date_debut        DATE           NOT NULL,
        date_fin          DATE,
        statut            VARCHAR(20)    DEFAULT 'ACTIF',
        notes             TEXT,
        prochaine_relance DATE,
        created_at        TIMESTAMPTZ    DEFAULT NOW(),
        updated_at        TIMESTAMPTZ    DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_crm_siret ON crm_contrats(siret);
    `);
    res.json({ ok: true, message: 'Table crm_contrats créée' });
  } catch (err) {
    console.error('[GET /crm/init-db]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Liste des contrats ───────────────────────────────────────────────────────

// GET /crm/contrats?statut=ACTIF
router.get('/contrats', authenticate, async (req, res) => {
  try {
    const siret  = req.user.siret;
    const statut = req.query.statut || null;

    let where  = 'WHERE siret = $1';
    const params = [siret];

    if (statut) {
      params.push(statut.toUpperCase());
      where += ` AND statut = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT * FROM crm_contrats ${where} ORDER BY client_nom ASC`,
      params
    );

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[GET /crm/contrats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Créer un contrat ─────────────────────────────────────────────────────────

// POST /crm/contrats
router.post('/contrats', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const {
      client_nom,
      client_email,
      montant_mensuel = 0,
      frequence = 'mensuel',
      date_debut,
      date_fin,
      statut = 'ACTIF',
      notes,
      prochaine_relance,
    } = req.body;

    if (!client_nom || !date_debut) {
      return res.status(400).json({ error: 'Champs requis : client_nom, date_debut' });
    }

    const statutValides = ['ACTIF', 'SUSPENDU', 'RESILIE'];
    const frequencesValides = ['mensuel', 'trimestriel', 'annuel'];

    if (!statutValides.includes(statut.toUpperCase())) {
      return res.status(400).json({ error: `Statut invalide. Valeurs acceptées : ${statutValides.join(', ')}` });
    }
    if (!frequencesValides.includes(frequence.toLowerCase())) {
      return res.status(400).json({ error: `Fréquence invalide. Valeurs acceptées : ${frequencesValides.join(', ')}` });
    }

    const { rows } = await pool.query(`
      INSERT INTO crm_contrats
        (siret, client_nom, client_email, montant_mensuel, frequence,
         date_debut, date_fin, statut, notes, prochaine_relance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      siret,
      client_nom.trim(),
      client_email || null,
      parseFloat(montant_mensuel) || 0,
      frequence.toLowerCase(),
      date_debut,
      date_fin || null,
      statut.toUpperCase(),
      notes || null,
      prochaine_relance || null,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /crm/contrats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Modifier un contrat ──────────────────────────────────────────────────────

// PUT /crm/contrats/:id
router.put('/contrats/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    // IDOR : vérifier appartenance
    const { rows: check } = await pool.query(
      'SELECT id FROM crm_contrats WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!check.length) return res.status(404).json({ error: 'Contrat introuvable' });

    const {
      client_nom,
      client_email,
      montant_mensuel,
      frequence,
      date_debut,
      date_fin,
      statut,
      notes,
      prochaine_relance,
    } = req.body;

    if (!client_nom || !date_debut) {
      return res.status(400).json({ error: 'Champs requis : client_nom, date_debut' });
    }

    const { rows } = await pool.query(`
      UPDATE crm_contrats
      SET
        client_nom        = $1,
        client_email      = $2,
        montant_mensuel   = $3,
        frequence         = $4,
        date_debut        = $5,
        date_fin          = $6,
        statut            = $7,
        notes             = $8,
        prochaine_relance = $9,
        updated_at        = NOW()
      WHERE id = $10 AND siret = $11
      RETURNING *
    `, [
      client_nom.trim(),
      client_email || null,
      parseFloat(montant_mensuel) || 0,
      (frequence || 'mensuel').toLowerCase(),
      date_debut,
      date_fin || null,
      (statut || 'ACTIF').toUpperCase(),
      notes || null,
      prochaine_relance || null,
      id,
      siret,
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /crm/contrats/:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Soft delete (résiliation) ────────────────────────────────────────────────

// DELETE /crm/contrats/:id
router.delete('/contrats/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rowCount } = await pool.query(
      `UPDATE crm_contrats
       SET statut = 'RESILIE', updated_at = NOW()
       WHERE id = $1 AND siret = $2`,
      [id, siret]
    );

    if (!rowCount) return res.status(404).json({ error: 'Contrat introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /crm/contrats/:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Relances à venir ─────────────────────────────────────────────────────────

// GET /crm/relances
// Retourne les contrats dont prochaine_relance est dans les 7 prochains jours
router.get('/relances', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;

    const { rows } = await pool.query(`
      SELECT *
      FROM crm_contrats
      WHERE siret = $1
        AND statut != 'RESILIE'
        AND prochaine_relance IS NOT NULL
        AND prochaine_relance <= NOW() + INTERVAL '7 days'
      ORDER BY prochaine_relance ASC
    `, [siret]);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[GET /crm/relances]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

// À AJOUTER dans server.js : app.use('/crm', require('./routes/crm'));
