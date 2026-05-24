/**
 * FacturEasy — Routes /devis
 *
 * Gestion des devis (propositions commerciales) par entreprise.
 * Numérotation automatique : DEV-YYYY-XXXX (séquence par SIRET × année)
 *
 * Statuts : BROUILLON → ENVOYE → ACCEPTE / REFUSE → FACTURE / EXPIRE
 *
 * Conversion : POST /devis/:id/convertir
 *   Crée une facture depuis le devis, passe le devis en statut FACTURE.
 *   Requiert le champ client_siret dans le devis.
 *
 * Init DB : GET /devis/init-db (protégé JWT, une seule fois)
 */

const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const { authenticate } = require('../middleware/auth');

// ─── Numérotation DEV-YYYY-XXXX ──────────────────────────────────────────────

async function nextNumeroDevis(siret) {
  const year   = new Date().getFullYear();
  const prefix = `DEV-${year}`;

  const { rows } = await pool.query(`
    INSERT INTO devis_sequences (siret, year, last_seq)
    VALUES ($1, $2, 1)
    ON CONFLICT (siret, year)
    DO UPDATE SET last_seq = devis_sequences.last_seq + 1
    RETURNING last_seq
  `, [siret, year]);

  const seq = String(rows[0].last_seq).padStart(4, '0');
  return `${prefix}-${seq}`;
}

// ─── Init DB ─────────────────────────────────────────────────────────────────

router.get('/init-db', authenticate, async (req, res) => {
  try {
    await pool.query(`
      -- Séquences de numérotation devis
      CREATE TABLE IF NOT EXISTS devis_sequences (
        siret    VARCHAR(14) NOT NULL,
        year     INTEGER     NOT NULL,
        last_seq INTEGER     DEFAULT 0,
        PRIMARY KEY (siret, year)
      );

      -- Table devis
      CREATE TABLE IF NOT EXISTS devis (
        id              SERIAL PRIMARY KEY,
        numero          VARCHAR(50)   UNIQUE NOT NULL,
        siret           VARCHAR(14)   NOT NULL,
        client_siret    VARCHAR(14),
        client_nom      VARCHAR(255)  NOT NULL,
        client_email    VARCHAR(255),
        client_adresse  TEXT,
        objet           VARCHAR(255),
        montant_ht      NUMERIC(12,2) NOT NULL DEFAULT 0,
        tva_taux        NUMERIC(5,2)  DEFAULT 20,
        montant_ttc     NUMERIC(12,2) NOT NULL DEFAULT 0,
        statut          VARCHAR(20)   DEFAULT 'BROUILLON',
        date_emission   DATE          DEFAULT CURRENT_DATE,
        date_validite   DATE,
        notes           TEXT,
        facture_id      INTEGER,
        created_at      TIMESTAMPTZ   DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   DEFAULT NOW()
      );

      -- Lignes du devis (articles détaillés)
      CREATE TABLE IF NOT EXISTS devis_lignes (
        id               SERIAL PRIMARY KEY,
        devis_id         INTEGER       NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
        description      TEXT          NOT NULL,
        quantite         NUMERIC(10,3) DEFAULT 1,
        prix_unitaire_ht NUMERIC(12,2) NOT NULL,
        tva_taux         NUMERIC(5,2)  DEFAULT 20,
        montant_ht       NUMERIC(12,2) NOT NULL,
        unite            VARCHAR(50)   DEFAULT 'unité',
        catalogue_id     INTEGER,
        ordre            INTEGER       DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_devis_siret  ON devis(siret);
      CREATE INDEX IF NOT EXISTS idx_devis_statut ON devis(siret, statut);
      CREATE INDEX IF NOT EXISTS idx_devis_lignes ON devis_lignes(devis_id);
    `);
    res.json({ ok: true, message: 'Tables devis créées' });
  } catch (err) {
    console.error('[GET /devis/init-db]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Liste ───────────────────────────────────────────────────────────────────

// GET /devis?statut=ENVOYE&client=Acme&page=1&limit=20
router.get('/', authenticate, async (req, res) => {
  try {
    const siret  = req.user.siret;
    const statut = req.query.statut  || '';
    const client = req.query.client  || '';
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(100, parseInt(req.query.limit || '20'));
    const offset = (page - 1) * limit;

    let where  = 'WHERE siret = $1';
    const params = [siret];

    if (statut) {
      params.push(statut.toUpperCase());
      where += ` AND statut = $${params.length}`;
    }
    if (client) {
      params.push(`%${client}%`);
      where += ` AND client_nom ILIKE $${params.length}`;
    }

    const { rows: total } = await pool.query(
      `SELECT COUNT(*) FROM devis ${where}`, params
    );

    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT * FROM devis ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      data: rows,
      total: parseInt(total[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('[GET /devis]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Détail d'un devis (avec lignes) ─────────────────────────────────────────

// GET /devis/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rows } = await pool.query(
      'SELECT * FROM devis WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });

    const { rows: lignes } = await pool.query(
      'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC, id ASC', [id]
    );

    res.json({ ...rows[0], lignes });
  } catch (err) {
    console.error('[GET /devis/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Créer un devis ───────────────────────────────────────────────────────────

/**
 * POST /devis
 * Body :
 * {
 *   client_nom, client_siret?, client_email?, client_adresse?,
 *   objet?, date_validite?, notes?,
 *   lignes: [{ description, quantite, prix_unitaire_ht, tva_taux?, unite?, catalogue_id? }]
 * }
 */
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const siret = req.user.siret;
    const {
      client_nom, client_siret, client_email, client_adresse,
      objet, date_validite, notes,
      lignes = [],
    } = req.body;

    if (!client_nom) return res.status(400).json({ error: 'client_nom requis' });
    if (!lignes.length) return res.status(400).json({ error: 'Au moins une ligne requise' });

    // Calculer les totaux depuis les lignes
    let montant_ht  = 0;
    let montant_ttc = 0;
    const lignesCalculees = lignes.map((l, i) => {
      const qte      = parseFloat(l.quantite    || 1);
      const puHT     = parseFloat(l.prix_unitaire_ht || 0);
      const tva      = parseFloat(l.tva_taux    || 20);
      const htLigne  = parseFloat((qte * puHT).toFixed(2));
      const ttcLigne = parseFloat((htLigne * (1 + tva / 100)).toFixed(2));
      montant_ht  += htLigne;
      montant_ttc += ttcLigne;
      return { ...l, quantite: qte, prix_unitaire_ht: puHT, tva_taux: tva, montant_ht: htLigne, ordre: i };
    });

    montant_ht  = parseFloat(montant_ht.toFixed(2));
    montant_ttc = parseFloat(montant_ttc.toFixed(2));

    // TVA globale (taux moyen pondéré, indicatif)
    const tva_taux = montant_ht > 0
      ? parseFloat(((montant_ttc - montant_ht) / montant_ht * 100).toFixed(2))
      : 20;

    const numero = await nextNumeroDevis(siret);

    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO devis
        (numero, siret, client_siret, client_nom, client_email, client_adresse,
         objet, montant_ht, tva_taux, montant_ttc, statut, date_validite, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BROUILLON',$11,$12)
      RETURNING *
    `, [
      numero, siret, client_siret || null, client_nom.trim(),
      client_email || null, client_adresse || null,
      objet || null, montant_ht, tva_taux, montant_ttc,
      date_validite || null, notes || null,
    ]);

    const devisId = rows[0].id;

    for (const l of lignesCalculees) {
      await client.query(`
        INSERT INTO devis_lignes
          (devis_id, description, quantite, prix_unitaire_ht, tva_taux, montant_ht, unite, catalogue_id, ordre)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        devisId, l.description || '', l.quantite, l.prix_unitaire_ht,
        l.tva_taux, l.montant_ht, l.unite || 'unité',
        l.catalogue_id || null, l.ordre,
      ]);
    }

    await client.query('COMMIT');

    // Retourner le devis complet
    const { rows: lignesDB } = await pool.query(
      'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC', [devisId]
    );
    res.status(201).json({ ...rows[0], lignes: lignesDB });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /devis]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── Modifier un devis (BROUILLON uniquement) ─────────────────────────────────

// PUT /devis/:id
router.put('/:id', authenticate, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rows: existing } = await dbClient.query(
      'SELECT * FROM devis WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!existing.length) return res.status(404).json({ error: 'Devis introuvable' });
    if (existing[0].statut !== 'BROUILLON') {
      return res.status(409).json({ error: 'Seuls les devis BROUILLON peuvent être modifiés' });
    }

    const {
      client_nom, client_siret, client_email, client_adresse,
      objet, date_validite, notes,
      lignes = [],
    } = req.body;

    if (!client_nom) return res.status(400).json({ error: 'client_nom requis' });
    if (!lignes.length) return res.status(400).json({ error: 'Au moins une ligne requise' });

    // Recalculer les totaux
    let montant_ht = 0, montant_ttc = 0;
    const lignesCalculees = lignes.map((l, i) => {
      const qte      = parseFloat(l.quantite    || 1);
      const puHT     = parseFloat(l.prix_unitaire_ht || 0);
      const tva      = parseFloat(l.tva_taux    || 20);
      const htLigne  = parseFloat((qte * puHT).toFixed(2));
      const ttcLigne = parseFloat((htLigne * (1 + tva / 100)).toFixed(2));
      montant_ht  += htLigne;
      montant_ttc += ttcLigne;
      return { ...l, quantite: qte, prix_unitaire_ht: puHT, tva_taux: tva, montant_ht: htLigne, ordre: i };
    });

    montant_ht  = parseFloat(montant_ht.toFixed(2));
    montant_ttc = parseFloat(montant_ttc.toFixed(2));
    const tva_taux = montant_ht > 0
      ? parseFloat(((montant_ttc - montant_ht) / montant_ht * 100).toFixed(2))
      : 20;

    await dbClient.query('BEGIN');

    const { rows } = await dbClient.query(`
      UPDATE devis
      SET client_siret=$1, client_nom=$2, client_email=$3, client_adresse=$4,
          objet=$5, montant_ht=$6, tva_taux=$7, montant_ttc=$8,
          date_validite=$9, notes=$10, updated_at=NOW()
      WHERE id=$11 AND siret=$12
      RETURNING *
    `, [
      client_siret || null, client_nom.trim(), client_email || null, client_adresse || null,
      objet || null, montant_ht, tva_taux, montant_ttc,
      date_validite || null, notes || null,
      id, siret,
    ]);

    // Supprimer et recréer les lignes
    await dbClient.query('DELETE FROM devis_lignes WHERE devis_id = $1', [id]);
    for (const l of lignesCalculees) {
      await dbClient.query(`
        INSERT INTO devis_lignes
          (devis_id, description, quantite, prix_unitaire_ht, tva_taux, montant_ht, unite, catalogue_id, ordre)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [id, l.description || '', l.quantite, l.prix_unitaire_ht,
          l.tva_taux, l.montant_ht, l.unite || 'unité', l.catalogue_id || null, l.ordre]);
    }

    await dbClient.query('COMMIT');

    const { rows: lignesDB } = await pool.query(
      'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC', [id]
    );
    res.json({ ...rows[0], lignes: lignesDB });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[PUT /devis/:id]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// ─── Changer le statut ────────────────────────────────────────────────────────

const TRANSITIONS = {
  BROUILLON: ['ENVOYE'],
  ENVOYE:    ['ACCEPTE', 'REFUSE', 'EXPIRE'],
  ACCEPTE:   ['FACTURE'],
  REFUSE:    [],
  EXPIRE:    [],
  FACTURE:   [],
};

// PATCH /devis/:id/statut  — body: { statut: "ENVOYE" }
router.patch('/:id/statut', authenticate, async (req, res) => {
  try {
    const siret         = req.user.siret;
    const id            = parseInt(req.params.id);
    const { statut }    = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM devis WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });

    const current    = rows[0].statut;
    const allowed    = TRANSITIONS[current] || [];
    const newStatut  = (statut || '').toUpperCase();

    if (!allowed.includes(newStatut)) {
      return res.status(409).json({
        error: `Transition ${current} → ${newStatut} non autorisée`,
        allowed,
      });
    }

    const { rows: updated } = await pool.query(
      'UPDATE devis SET statut=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [newStatut, id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('[PATCH /devis/:id/statut]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Convertir en facture ─────────────────────────────────────────────────────

/**
 * POST /devis/:id/convertir
 * Crée une facture depuis ce devis (statut ACCEPTE requis).
 * Passe le devis en FACTURE et stocke le facture_id.
 */
router.post('/:id/convertir', authenticate, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rows } = await dbClient.query(
      'SELECT * FROM devis WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });

    const devis = rows[0];
    if (devis.statut !== 'ACCEPTE') {
      return res.status(409).json({
        error: `Seuls les devis ACCEPTÉ peuvent être convertis (statut actuel : ${devis.statut})`,
      });
    }
    if (!devis.client_siret) {
      return res.status(400).json({
        error: 'Le SIRET client est requis pour convertir en facture. Modifiez le devis.',
      });
    }

    // Construire la description depuis les lignes du devis
    const { rows: lignes } = await dbClient.query(
      'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre ASC', [id]
    );

    const descriptionFacture = lignes
      .map((l) => `${l.description} — qté ${l.quantite} × ${l.prix_unitaire_ht}€ HT`)
      .join('\n');

    // Numérotation facture (séquence invoice_sequences existante dans server.js)
    const year   = new Date().getFullYear();
    const prefix = `FE-${year}`;
    const { rows: seqRows } = await dbClient.query(`
      INSERT INTO invoice_sequences (siret, year, last_seq)
      VALUES ($1, $2, 1)
      ON CONFLICT (siret, year)
      DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
      RETURNING last_seq
    `, [siret, year]);
    const numeroFacture = `${prefix}-${String(seqRows[0].last_seq).padStart(4, '0')}`;

    // TVA dominante (première ligne)
    const tvaDominante = lignes[0]?.tva_taux || devis.tva_taux || 20;

    await dbClient.query('BEGIN');

    const { rows: factureRows } = await dbClient.query(`
      INSERT INTO factures
        (numero, emetteur_siret, client_siret, client_nom, description,
         montant_ht, tva, montant_ttc, statut)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EMISE')
      RETURNING *
    `, [
      numeroFacture, siret, devis.client_siret, devis.client_nom,
      descriptionFacture || (devis.objet || `Devis ${devis.numero}`),
      devis.montant_ht, tvaDominante, devis.montant_ttc,
    ]);

    const facture = factureRows[0];

    // Mettre à jour le devis
    await dbClient.query(
      'UPDATE devis SET statut=$1, facture_id=$2, updated_at=NOW() WHERE id=$3',
      ['FACTURE', facture.id, id]
    );

    await dbClient.query('COMMIT');

    res.status(201).json({
      facture,
      devis_numero: devis.numero,
      message: `Facture ${numeroFacture} créée depuis le devis ${devis.numero}`,
    });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[POST /devis/:id/convertir]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// ─── Supprimer (BROUILLON uniquement) ────────────────────────────────────────

// DELETE /devis/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const siret = req.user.siret;
    const id    = parseInt(req.params.id);

    const { rows } = await pool.query(
      'SELECT statut FROM devis WHERE id = $1 AND siret = $2', [id, siret]
    );
    if (!rows.length) return res.status(404).json({ error: 'Devis introuvable' });
    if (rows[0].statut !== 'BROUILLON') {
      return res.status(409).json({ error: 'Seuls les devis BROUILLON peuvent être supprimés' });
    }

    await pool.query('DELETE FROM devis WHERE id = $1', [id]); // CASCADE sur devis_lignes
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /devis/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
