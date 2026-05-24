/**
 * FacturEasy — Routes /factures/recurrentes
 * Factures récurrentes : templates + génération automatique mensuelle/trimestrielle
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─── Init table ───────────────────────────────────────────────────────────────

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_invoices (
      id               SERIAL PRIMARY KEY,
      emetteur_siret   VARCHAR(14)   NOT NULL,
      client_siret     VARCHAR(14)   NOT NULL,
      client_nom       VARCHAR(255)  NOT NULL,
      description      TEXT,
      montant_ht       NUMERIC(12,2) NOT NULL,
      tva              NUMERIC(5,2)  DEFAULT 20,
      frequence        VARCHAR(20)   NOT NULL DEFAULT 'MENSUEL',
      prochaine_date   DATE          NOT NULL,
      actif            BOOLEAN       DEFAULT TRUE,
      created_at       TIMESTAMPTZ   DEFAULT NOW(),
      updated_at       TIMESTAMPTZ   DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recur_siret ON recurring_invoices(emetteur_siret);
    CREATE INDEX IF NOT EXISTS idx_recur_date  ON recurring_invoices(prochaine_date);

    CREATE TABLE IF NOT EXISTS relances (
      id                  SERIAL PRIMARY KEY,
      facture_id          INTEGER NOT NULL REFERENCES factures(id),
      siret               VARCHAR(14) NOT NULL,
      type                VARCHAR(20) DEFAULT 'MANUELLE',
      email_destinataire  VARCHAR(255),
      statut              VARCHAR(20) DEFAULT 'ENVOYEE',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_relances_facture ON relances(facture_id);
    CREATE INDEX IF NOT EXISTS idx_relances_siret   ON relances(siret);
  `).catch(() => {}); // Idempotent — ignore si tables existent déjà
}

// =============================================================================
// POST /factures/recurrentes — Créer un modèle de facture récurrente
// =============================================================================

router.post('/', authenticate, async (req, res) => {
  await ensureTable();
  const siret = req.user.siret;
  const {
    client_siret, client_nom, description,
    montant_ht, tva = 20,
    frequence = 'MENSUEL', // MENSUEL | TRIMESTRIEL | ANNUEL
    prochaine_date,
  } = req.body;

  if (!client_siret || !client_nom || !montant_ht || !prochaine_date) {
    return res.status(400).json({ error: 'Champs requis : client_siret, client_nom, montant_ht, prochaine_date' });
  }

  const FREQUENCES = ['MENSUEL', 'BIMESTRIEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL'];
  if (!FREQUENCES.includes(frequence)) {
    return res.status(400).json({ error: `Fréquence invalide. Valeurs : ${FREQUENCES.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO recurring_invoices
        (emetteur_siret, client_siret, client_nom, description, montant_ht, tva, frequence, prochaine_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [siret, client_siret, client_nom, description, parseFloat(montant_ht), parseFloat(tva), frequence, prochaine_date]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /recurrentes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /factures/recurrentes — Lister les modèles d'un SIRET
// =============================================================================

router.get('/', authenticate, async (req, res) => {
  await ensureTable();
  const siret = req.user.siret;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM recurring_invoices WHERE emetteur_siret = $1 ORDER BY prochaine_date ASC',
      [siret]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /recurrentes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// PATCH /factures/recurrentes/:id — Activer/désactiver ou modifier un modèle
// =============================================================================

router.patch('/:id', authenticate, async (req, res) => {
  const siret = req.user.siret;
  const { id } = req.params;

  try {
    const { rows: existing } = await pool.query(
      'SELECT * FROM recurring_invoices WHERE id = $1', [id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Modèle introuvable' });
    if (existing[0].emetteur_siret !== siret) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const updates = {};
    const allowed = ['actif', 'frequence', 'prochaine_date', 'montant_ht', 'tva', 'description'];
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = [id, ...Object.values(updates)];

    const { rows } = await pool.query(
      `UPDATE recurring_invoices SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /recurrentes/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// POST /factures/recurrentes/generate — Générer les factures dues aujourd'hui
//   Appelé par un cron quotidien ou via /admin
// =============================================================================

router.post('/generate', requireAdmin, async (req, res) => {
  await ensureTable();
  const today = new Date().toISOString().split('T')[0];

  try {
    const { rows: dues } = await pool.query(`
      SELECT * FROM recurring_invoices
      WHERE actif = TRUE AND prochaine_date <= $1
    `, [today]);

    const NEXT_DATE = {
      MENSUEL:      (d) => { d.setMonth(d.getMonth() + 1);      return d; },
      BIMESTRIEL:   (d) => { d.setMonth(d.getMonth() + 2);      return d; },
      TRIMESTRIEL:  (d) => { d.setMonth(d.getMonth() + 3);      return d; },
      SEMESTRIEL:   (d) => { d.setMonth(d.getMonth() + 6);      return d; },
      ANNUEL:       (d) => { d.setFullYear(d.getFullYear() + 1); return d; },
    };

    const generated = [];

    for (const tmpl of dues) {
      // Générer le numéro séquentiel
      const year = new Date().getFullYear();
      const { rows: seqRows } = await pool.query(`
        INSERT INTO invoice_sequences (siret, year, last_seq) VALUES ($1, $2, 1)
        ON CONFLICT (siret, year) DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
        RETURNING last_seq
      `, [tmpl.emetteur_siret, year]);
      const numero = `FE-${year}-${String(seqRows[0].last_seq).padStart(4, '0')}`;

      const ht  = parseFloat(tmpl.montant_ht);
      const tva = parseFloat(tmpl.tva);
      const ttc = parseFloat((ht * (1 + tva / 100)).toFixed(2));

      const { rows: facture } = await pool.query(`
        INSERT INTO factures
          (numero, emetteur_siret, client_siret, client_nom, description, montant_ht, tva, montant_ttc, statut, chorus_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EMISE','RECUR-' || $1)
        RETURNING id, numero
      `, [numero, tmpl.emetteur_siret, tmpl.client_siret, tmpl.client_nom,
          tmpl.description || 'Facture récurrente', ht, tva, ttc]);

      // Calculer la prochaine date
      const nextDate = NEXT_DATE[tmpl.frequence](new Date(tmpl.prochaine_date));
      await pool.query(
        'UPDATE recurring_invoices SET prochaine_date = $1, updated_at = NOW() WHERE id = $2',
        [nextDate.toISOString().split('T')[0], tmpl.id]
      );

      generated.push({ ...facture[0], template_id: tmpl.id });
    }

    res.json({ generees: generated.length, factures: generated });
  } catch (err) {
    console.error('[POST /recurrentes/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
