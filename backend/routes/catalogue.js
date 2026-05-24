/**
 * FacturEasy — Routes /catalogue
 *
 * Gestion du catalogue produits/services par entreprise (SIRET).
 * Chaque article appartient à un SIRET et ne peut être vu/modifié que par lui.
 *
 * Import CSV : POST /catalogue/import
 *   Body JSON : { "csv": "<contenu CSV en texte>" }
 *   Format attendu (séparateur ; ou ,) :
 *     reference;nom;description;prix_ht;tva_taux;unite;code_comptable
 *     REF001;Conseil horaire;;150.00;20;heure;706100
 *
 * Init DB : GET /catalogue/init-db (protégé JWT, une seule fois)
 */

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Init DB ─────────────────────────────────────────────────────────────────

router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalogue (
        id              SERIAL PRIMARY KEY,
        siret           VARCHAR(14)   NOT NULL,
        reference       VARCHAR(100),
        nom             VARCHAR(255)  NOT NULL,
        description     TEXT,
        prix_ht         NUMERIC(12,2) NOT NULL DEFAULT 0,
        tva_taux        NUMERIC(5,2)  NOT NULL DEFAULT 20,
        unite           VARCHAR(50)   DEFAULT 'unité',
        code_comptable  VARCHAR(50),
        actif           BOOLEAN       DEFAULT TRUE,
        created_at      TIMESTAMPTZ   DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_catalogue_siret ON catalogue(siret);
      CREATE INDEX IF NOT EXISTS idx_catalogue_actif  ON catalogue(siret, actif);
    `);
    res.json({ ok: true, message: 'Table catalogue créée' });
  } catch (err) {
    console.error('[GET /catalogue/init-db]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Liste ───────────────────────────────────────────────────────────────────

// GET /catalogue?search=...&actif=true&page=1&limit=50
router.get('/', authenticate, async (req, res) => {
  try {
    const siret  = req.user.siret;
    const search = req.query.search || '';
    const actif  = req.query.actif !== 'false'; // défaut : actifs seulement
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(200, parseInt(req.query.limit || '50'));
    const offset = (page - 1) * limit;

    let where = 'WHERE siret = $1';
    const params = [siret];

    if (actif) {
      where += ' AND actif = TRUE';
    }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      where += ` AND (nom ILIKE $${p} OR reference ILIKE $${p} OR description ILIKE $${p})`;
    }

    const { rows: total } = await pool.query(
      `SELECT COUNT(*) FROM catalogue ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT * FROM catalogue ${where} ORDER BY nom ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: rows,
      total: parseInt(total[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('[GET /catalogue]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Créer un article ─────────────────────────────────────────────────────────

// POST /catalogue
router.post('/', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const { reference, nom, description, prix_ht, tva_taux = 20, unite = 'unité', code_comptable } = req.body;

    if (!nom || prix_ht === undefined || prix_ht === null) {
      return res.status(400).json({ error: 'Champs requis : nom, prix_ht' });
    }

    const { rows } = await pool.query(`
      INSERT INTO catalogue (siret, reference, nom, description, prix_ht, tva_taux, unite, code_comptable)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [siret, reference || null, nom.trim(), description || null,
        parseFloat(prix_ht), parseFloat(tva_taux), unite, code_comptable || null]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /catalogue]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Mettre à jour un article ─────────────────────────────────────────────────

// PUT /catalogue/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    // IDOR : vérifier appartenance
    const { rows: check } = await pool.query(
      'SELECT id FROM catalogue WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!check.length) return res.status(404).json({ error: 'Article introuvable' });

    const { reference, nom, description, prix_ht, tva_taux, unite, code_comptable, actif } = req.body;

    if (!nom || prix_ht === undefined || prix_ht === null) {
      return res.status(400).json({ error: 'Champs requis : nom, prix_ht' });
    }

    const { rows } = await pool.query(`
      UPDATE catalogue
      SET reference = $1, nom = $2, description = $3, prix_ht = $4,
          tva_taux = $5, unite = $6, code_comptable = $7, actif = $8,
          updated_at = NOW()
      WHERE id = $9 AND siret = $10
      RETURNING *
    `, [reference || null, nom.trim(), description || null,
        parseFloat(prix_ht), parseFloat(tva_taux || 20),
        unite || 'unité', code_comptable || null,
        actif !== undefined ? actif : true,
        id, siret]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /catalogue/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Supprimer (soft delete) ──────────────────────────────────────────────────

// DELETE /catalogue/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rowCount } = await pool.query(
      'UPDATE catalogue SET actif = FALSE, updated_at = NOW() WHERE id = $1 AND siret = $2',
      [id, siret]
    );
    if (!rowCount) return res.status(404).json({ error: 'Article introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /catalogue/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Import CSV ───────────────────────────────────────────────────────────────

/**
 * POST /catalogue/import
 * Body : { "csv": "reference;nom;description;prix_ht;tva_taux;unite;code_comptable\n..." }
 *
 * Formats acceptés :
 *  - Séparateur : ; ou ,
 *  - Encoding   : UTF-8
 *  - Ligne 1    : en-têtes (insensible à la casse)
 *  - prix_ht    : notation point (150.00) ou virgule (150,00)
 *  - tva_taux   : 20 (pas de %)
 *
 * Colonnes reconnues : reference, nom, description, prix_ht (ou prix), tva_taux (ou tva),
 *                      unite, code_comptable
 */
router.post('/import', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const { csv } = req.body;

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'Champ "csv" requis (chaîne de caractères)' });
    }

    // Détecter le séparateur
    const firstLine = csv.split('\n')[0] || '';
    const sep = firstLine.includes(';') ? ';' : ',';

    const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'Le CSV doit contenir au moins une ligne d\'en-tête et une ligne de données' });
    }

    // Parser l'en-tête
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/["\r]/g, ''));

    // Mapper les noms de colonnes vers nos champs
    const colIdx = {
      reference:      headers.indexOf('reference'),
      nom:            headers.includes('nom')             ? headers.indexOf('nom')             : -1,
      description:    headers.indexOf('description'),
      prix_ht:        headers.includes('prix_ht')         ? headers.indexOf('prix_ht')         :
                      headers.includes('prix')            ? headers.indexOf('prix')             : -1,
      tva_taux:       headers.includes('tva_taux')        ? headers.indexOf('tva_taux')        :
                      headers.includes('tva')             ? headers.indexOf('tva')              : -1,
      unite:          headers.indexOf('unite'),
      code_comptable: headers.includes('code_comptable')  ? headers.indexOf('code_comptable')  :
                      headers.includes('compte')          ? headers.indexOf('compte')           : -1,
    };

    if (colIdx.nom === -1) {
      return res.status(400).json({ error: 'Colonne "nom" introuvable dans les en-têtes' });
    }
    if (colIdx.prix_ht === -1) {
      return res.status(400).json({ error: 'Colonne "prix_ht" ou "prix" introuvable dans les en-têtes' });
    }

    const imported = [];
    const errors   = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map((c) => c.trim().replace(/["\r]/g, ''));

      const nom     = colIdx.nom >= 0 ? (cols[colIdx.nom] || '').trim() : '';
      const prixRaw = colIdx.prix_ht >= 0 ? (cols[colIdx.prix_ht] || '0').replace(',', '.') : '0';
      const tvaRaw  = colIdx.tva_taux >= 0 ? (cols[colIdx.tva_taux] || '20').replace(',', '.') : '20';

      if (!nom) {
        errors.push({ ligne: i + 1, raison: 'Nom vide — ligne ignorée' });
        continue;
      }

      const prix_ht  = parseFloat(prixRaw);
      const tva_taux = parseFloat(tvaRaw.replace('%', ''));

      if (isNaN(prix_ht)) {
        errors.push({ ligne: i + 1, raison: `Prix invalide : "${prixRaw}"` });
        continue;
      }

      const ref           = colIdx.reference      >= 0 ? (cols[colIdx.reference]      || null) : null;
      const description   = colIdx.description    >= 0 ? (cols[colIdx.description]    || null) : null;
      const unite         = colIdx.unite          >= 0 ? (cols[colIdx.unite]          || 'unité') : 'unité';
      const code_comptable = colIdx.code_comptable >= 0 ? (cols[colIdx.code_comptable] || null) : null;

      imported.push([
        siret, ref, nom, description, prix_ht,
        isNaN(tva_taux) ? 20 : tva_taux,
        unite, code_comptable,
      ]);
    }

    if (!imported.length) {
      return res.status(400).json({
        error: 'Aucune ligne valide à importer',
        errors,
      });
    }

    // Insertion en masse via une transaction
    const client = await pool.connect();
    let created = 0;
    try {
      await client.query('BEGIN');
      for (const row of imported) {
        await client.query(`
          INSERT INTO catalogue (siret, reference, nom, description, prix_ht, tva_taux, unite, code_comptable)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT DO NOTHING
        `, row);
        created++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, created, errors, total_lignes: lines.length - 1 });
  } catch (err) {
    console.error('[POST /catalogue/import]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
