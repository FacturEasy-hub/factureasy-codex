/**
 * FacturEasy — Routes /factures/:id/avoir
 * Gestion des avoirs (notes de crédit)
 *
 * Un avoir annule totalement ou partiellement une facture existante.
 * Il reçoit un numéro séquentiel AV-YYYY-XXXX et est lié à la facture source.
 */

const express = require('express');
const router  = express.Router({ mergeParams: true });
const pool    = require('../db');
const { authenticate } = require('../middleware/auth');

// Helper partagé — numérotation séquentielle
async function nextNumeroAvoir(siret) {
  const year = new Date().getFullYear();
  const { rows } = await pool.query(`
    INSERT INTO invoice_sequences (siret, year, last_seq)
    VALUES ($1, $2, 1)
    ON CONFLICT (siret, year)
    DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
    RETURNING last_seq
  `, [`${siret}_AV`, year]);
  return `AV-${year}-${String(rows[0].last_seq).padStart(4, '0')}`;
}

// =============================================================================
// POST /factures/:id/avoir — Créer un avoir sur une facture
// Body optionnel : { montant_ht, motif }
//   Si montant_ht absent → avoir total (montant_ht de la facture source)
// =============================================================================

router.post('/', authenticate, async (req, res) => {
  const factureId = req.params.id;
  const siret     = req.user.siret;

  try {
    // Récupérer la facture source
    const { rows: factures } = await pool.query(
      'SELECT * FROM factures WHERE id = $1', [factureId]
    );
    if (!factures[0]) return res.status(404).json({ error: 'Facture source introuvable' });
    if (factures[0].emetteur_siret !== siret) {
      return res.status(403).json({ error: 'Accès interdit à cette facture' });
    }

    const source = factures[0];

    // Vérifier qu'un avoir n'existe pas déjà pour cette facture (éviter doublon)
    const { rows: existants } = await pool.query(
      `SELECT id FROM factures WHERE avoir_de_facture_id = $1 AND type_document = 'AVO'`,
      [factureId]
    );
    if (existants.length > 0) {
      return res.status(409).json({
        error: 'Un avoir existe déjà pour cette facture',
        avoir_id: existants[0].id,
      });
    }

    const { motif = 'Avoir sur facture ' + source.numero, montant_ht: montantHtBody } = req.body;
    const montant_ht  = montantHtBody !== undefined
      ? parseFloat(montantHtBody)
      : parseFloat(source.montant_ht);

    if (isNaN(montant_ht) || montant_ht <= 0 || montant_ht > parseFloat(source.montant_ht)) {
      return res.status(400).json({
        error: `montant_ht invalide — doit être entre 0 et ${source.montant_ht}`,
      });
    }

    const tva         = parseFloat(source.tva);
    const montant_ttc = parseFloat((montant_ht * (1 + tva / 100)).toFixed(2));
    const numero      = await nextNumeroAvoir(siret);

    const { rows } = await pool.query(`
      INSERT INTO factures
        (numero, emetteur_siret, client_siret, client_nom, description,
         montant_ht, tva, montant_ttc, statut, type_document, avoir_de_facture_id, chorus_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'EMISE','AVO',$9,NULL)
      RETURNING *
    `, [
      numero, siret, source.client_siret, source.client_nom,
      motif, -montant_ht, tva, -montant_ttc, factureId,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /factures/:id/avoir]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// GET /factures/:id/avoir — Récupérer l'avoir lié à une facture
// =============================================================================

router.get('/', authenticate, async (req, res) => {
  const { id } = req.params;
  const siret  = req.user.siret;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM factures WHERE avoir_de_facture_id = $1 AND type_document = 'AVO'`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Aucun avoir pour cette facture' });
    if (rows[0].emetteur_siret !== siret) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /factures/:id/avoir]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
