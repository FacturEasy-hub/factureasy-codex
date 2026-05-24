/**
 * FacturEasy — Routes /comptabilite
 *
 * Journal comptable (PCG), export FEC DGFiP, balance des comptes.
 * Chaque écriture est liée à un SIRET (isolement multi-tenant).
 *
 * Table : journal_entries
 *   id, siret, date_ecriture, journal_code, journal_lib, piece_ref,
 *   libelle, compte_debit, compte_credit, montant, lettrage, created_at
 *
 * Init DB : GET /comptabilite/init-db (protégé JWT, une seule fois)
 */

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Init DB ─────────────────────────────────────────────────────────────────

router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id             SERIAL PRIMARY KEY,
        siret          VARCHAR(14)    NOT NULL,
        date_ecriture  DATE           NOT NULL,
        journal_code   VARCHAR(10)    NOT NULL,
        journal_lib    VARCHAR(50)    NOT NULL,
        piece_ref      VARCHAR(100),
        libelle        VARCHAR(255)   NOT NULL,
        compte_debit   VARCHAR(10)    NOT NULL,
        compte_credit  VARCHAR(10)    NOT NULL,
        montant        NUMERIC(14,2)  NOT NULL,
        lettrage       VARCHAR(10),
        created_at     TIMESTAMPTZ    DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_journal_siret ON journal_entries(siret);
      CREATE INDEX IF NOT EXISTS idx_journal_date  ON journal_entries(siret, date_ecriture);
    `);
    res.json({ ok: true, message: 'Table journal_entries créée' });
  } catch (err) {
    console.error('[GET /comptabilite/init-db]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Liste du journal ─────────────────────────────────────────────────────────

router.get('/journal', authenticate, async (req, res) => {
  try {
    const siret        = req.user.siret;
    const { date_debut, date_fin, journal_code, compte } = req.query;
    const page         = Math.max(1, parseInt(req.query.page  || '1'));
    const limit        = Math.min(500, parseInt(req.query.limit || '100'));
    const offset       = (page - 1) * limit;

    let where  = 'WHERE siret = $1';
    const params = [siret];

    if (date_debut) {
      params.push(date_debut);
      where += ` AND date_ecriture >= $${params.length}`;
    }
    if (date_fin) {
      params.push(date_fin);
      where += ` AND date_ecriture <= $${params.length}`;
    }
    if (journal_code) {
      params.push(journal_code.toUpperCase());
      where += ` AND journal_code = $${params.length}`;
    }
    if (compte) {
      params.push(`${compte}%`);
      where += ` AND (compte_debit LIKE $${params.length} OR compte_credit LIKE $${params.length})`;
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM journal_entries ${where}`,
      params
    );
    const total = parseInt(countRows[0].count);

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT * FROM journal_entries ${where}
       ORDER BY date_ecriture ASC, id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows, total, page, limit });
  } catch (err) {
    console.error('[GET /comptabilite/journal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Créer une écriture manuelle ──────────────────────────────────────────────

router.post('/journal', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const {
      date_ecriture,
      journal_code,
      journal_lib,
      piece_ref,
      libelle,
      compte_debit,
      compte_credit,
      montant,
    } = req.body;

    if (!date_ecriture || !journal_code || !journal_lib || !libelle) {
      return res.status(400).json({
        error: 'Champs requis : date_ecriture, journal_code, journal_lib, libelle',
      });
    }
    if (!compte_debit || !compte_debit.trim()) {
      return res.status(400).json({ error: 'compte_debit est requis et ne peut être vide' });
    }
    if (!compte_credit || !compte_credit.trim()) {
      return res.status(400).json({ error: 'compte_credit est requis et ne peut être vide' });
    }
    const montantNum = parseFloat(montant);
    if (isNaN(montantNum) || montantNum <= 0) {
      return res.status(400).json({ error: 'montant doit être un nombre strictement positif' });
    }

    const { rows } = await pool.query(`
      INSERT INTO journal_entries
        (siret, date_ecriture, journal_code, journal_lib, piece_ref,
         libelle, compte_debit, compte_credit, montant)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      siret,
      date_ecriture,
      journal_code.toUpperCase().trim(),
      journal_lib.trim(),
      piece_ref   || null,
      libelle.trim(),
      compte_debit.trim(),
      compte_credit.trim(),
      montantNum,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /comptabilite/journal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Export FEC (Fichier des Écritures Comptables — DGFiP) ───────────────────

router.get('/export-fec', authenticate, async (req, res) => {
  try {
    const siret      = req.user.siret;
    const { date_debut, date_fin } = req.query;

    if (!date_debut || !date_fin) {
      return res.status(400).json({
        error: 'Paramètres requis : date_debut et date_fin (format YYYY-MM-DD)',
      });
    }

    const { rows } = await pool.query(
      `SELECT * FROM journal_entries
       WHERE siret = $1 AND date_ecriture >= $2 AND date_ecriture <= $3
       ORDER BY date_ecriture ASC, id ASC`,
      [siret, date_debut, date_fin]
    );

    const FEC_HEADER =
      'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib' +
      '|CompteAuxNum|CompteAuxLib|PieceRef|PieceDate|EcritureLib' +
      '|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise';

    const toFecDate = (d) => {
      if (!d) return '';
      const dt = typeof d === 'string' ? d : d.toISOString();
      return dt.slice(0, 10).replace(/-/g, '');
    };

    const toFecAmount = (n) => parseFloat(n).toFixed(2).replace('.', ',');

    const lines = [FEC_HEADER];

    rows.forEach((row) => {
      const ecritureNum  = String(row.id).padStart(8, '0');
      const ecritureDate = toFecDate(row.date_ecriture);
      const pieceRef     = row.piece_ref || '';
      const pieceDate    = ecritureDate;
      const lettrage     = row.lettrage  || '';

      lines.push([
        row.journal_code, row.journal_lib, ecritureNum, ecritureDate,
        row.compte_debit, '', '', '',
        pieceRef, pieceDate, row.libelle,
        toFecAmount(row.montant), '0,00',
        lettrage, '', '', '', '',
      ].join('|'));

      lines.push([
        row.journal_code, row.journal_lib, ecritureNum, ecritureDate,
        row.compte_credit, '', '', '',
        pieceRef, pieceDate, row.libelle,
        '0,00', toFecAmount(row.montant),
        lettrage, '', '', '', '',
      ].join('|'));
    });

    const content   = lines.join('\r\n');
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename  = `FEC_${siret}_${dateStamp}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    console.error('[GET /comptabilite/export-fec]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Balance des comptes ──────────────────────────────────────────────────────

router.get('/balance', authenticate, async (req, res) => {
  try {
    const siret      = req.user.siret;
    const { date_debut, date_fin } = req.query;

    let where  = 'WHERE siret = $1';
    const params = [siret];

    if (date_debut) {
      params.push(date_debut);
      where += ` AND date_ecriture >= $${params.length}`;
    }
    if (date_fin) {
      params.push(date_fin);
      where += ` AND date_ecriture <= $${params.length}`;
    }

    const { rows: debits } = await pool.query(
      `SELECT compte_debit AS compte, SUM(montant) AS total
       FROM journal_entries ${where}
       GROUP BY compte_debit`,
      params
    );

    const { rows: credits } = await pool.query(
      `SELECT compte_credit AS compte, SUM(montant) AS total
       FROM journal_entries ${where}
       GROUP BY compte_credit`,
      params
    );

    const balanceMap = new Map();

    for (const { compte, total } of debits) {
      if (!balanceMap.has(compte)) {
        balanceMap.set(compte, { compte, total_debit: 0, total_credit: 0, solde: 0 });
      }
      balanceMap.get(compte).total_debit = parseFloat(total);
    }

    for (const { compte, total } of credits) {
      if (!balanceMap.has(compte)) {
        balanceMap.set(compte, { compte, total_debit: 0, total_credit: 0, solde: 0 });
      }
      balanceMap.get(compte).total_credit = parseFloat(total);
    }

    const balance = Array.from(balanceMap.values())
      .map((row) => ({
        ...row,
        solde: parseFloat((row.total_debit - row.total_credit).toFixed(2)),
      }))
      .sort((a, b) => a.compte.localeCompare(b.compte));

    res.json(balance);
  } catch (err) {
    console.error('[GET /comptabilite/balance]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// À AJOUTER dans server.js : app.use('/comptabilite', require('./routes/comptabilite'));
