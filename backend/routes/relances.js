/**
 * FacturEasy — Routes /relances
 * Relances automatiques sur factures EMISE depuis trop longtemps
 *
 * Nécessite la variable d'environnement RESEND_API_KEY (ou SENDGRID_API_KEY)
 * pour l'envoi réel. En mode mock (pas de clé), simule l'envoi et log en console.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const http    = require('../services/http');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─── Envoi email via Resend (fallback: log mock) ──────────────────────────────

async function sendRelanceEmail({ to, nom_client, numero, montant_ttc, date_emission, emetteur_nom }) {
  const sujet  = `Rappel : facture ${numero} en attente de paiement`;
  const corps  = `Bonjour,\n\nNous vous rappelons que la facture ${numero} d'un montant de ${montant_ttc}€ TTC, émise le ${new Date(date_emission).toLocaleDateString('fr-FR')}, est toujours en attente de traitement sur Chorus Pro.\n\nMerci de procéder à son règlement ou de nous informer de toute difficulté.\n\nCordialement,\n${emetteur_nom}`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[RELANCE MOCK] Email → ${to} | ${sujet}`);
    return { ok: true, mock: true };
  }

  try {
    await http.post('https://api.resend.com/emails', {
      from:    'factureasy@factureasy.fr',
      to:      [to],
      subject: sujet,
      text:    corps,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[sendRelanceEmail]', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

// =============================================================================
// POST /relances/:factureId — Relance manuelle d'une facture spécifique
// =============================================================================

router.post('/:factureId', authenticate, async (req, res) => {
  const { factureId } = req.params;
  const siret = req.user.siret;

  try {
    const { rows } = await pool.query('SELECT * FROM factures WHERE id = $1', [factureId]);
    if (!rows[0]) return res.status(404).json({ error: 'Facture introuvable' });
    if (rows[0].emetteur_siret !== siret) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    if (rows[0].statut !== 'EMISE') {
      return res.status(400).json({ error: `Facture en statut ${rows[0].statut} — relance non applicable` });
    }

    // Récupérer l'email de l'entreprise émettrice
    const { rows: entreprises } = await pool.query(
      'SELECT nom, email FROM entreprises WHERE siret = $1', [siret]
    );

    const result = await sendRelanceEmail({
      to:           req.body.email_destinataire || rows[0].client_nom + '@exemple.fr',
      nom_client:   rows[0].client_nom,
      numero:       rows[0].numero,
      montant_ttc:  rows[0].montant_ttc,
      date_emission: rows[0].date_emission,
      emetteur_nom: entreprises[0]?.nom || 'FacturEasy',
    });

    // Enregistrer la relance en base
    await pool.query(`
      INSERT INTO relances (facture_id, siret, type, email_destinataire, statut)
      VALUES ($1, $2, 'MANUELLE', $3, $4)
    `, [factureId, siret, req.body.email_destinataire || null, result.ok ? 'ENVOYEE' : 'ECHEC']);

    res.json({ ok: result.ok, mock: result.mock || false, facture: rows[0].numero });
  } catch (err) {
    console.error('[POST /relances/:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /relances/auto — Déclencher les relances automatiques (admin / cron)
//   Relance toutes les factures EMISE depuis plus de RELANCE_DELAI_JOURS jours
//   Sans relance déjà envoyée dans les 7 derniers jours
// =============================================================================

router.get('/auto', requireAdmin, async (req, res) => {
  const DELAI_JOURS = parseInt(process.env.RELANCE_DELAI_JOURS || '30', 10);

  try {
    // Factures EMISE depuis > DELAI_JOURS sans relance récente
    const { rows: factures } = await pool.query(`
      SELECT f.*, e.nom AS emetteur_nom, e.email AS emetteur_email
      FROM factures f
      JOIN entreprises e ON e.siret = f.emetteur_siret
      WHERE f.statut = 'EMISE'
        AND f.date_emission < NOW() - INTERVAL '${DELAI_JOURS} days'
        AND f.type_document IS DISTINCT FROM 'AVO'
        AND NOT EXISTS (
          SELECT 1 FROM relances r
          WHERE r.facture_id = f.id
            AND r.created_at > NOW() - INTERVAL '7 days'
        )
      LIMIT 50
    `);

    const results = [];
    for (const f of factures) {
      const result = await sendRelanceEmail({
        to:           f.emetteur_email || 'noreply@factureasy.fr',
        nom_client:   f.client_nom,
        numero:       f.numero,
        montant_ttc:  f.montant_ttc,
        date_emission: f.date_emission,
        emetteur_nom: f.emetteur_nom,
      });

      await pool.query(`
        INSERT INTO relances (facture_id, siret, type, email_destinataire, statut)
        VALUES ($1, $2, 'AUTO', $3, $4)
      `, [f.id, f.emetteur_siret, f.emetteur_email, result.ok ? 'ENVOYEE' : 'ECHEC']);

      results.push({ facture: f.numero, ok: result.ok });
    }

    res.json({ traite: results.length, resultats: results });
  } catch (err) {
    console.error('[GET /relances/auto]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /relances — Historique des relances d'une entreprise
// =============================================================================

router.get('/', authenticate, async (req, res) => {
  const siret = req.user.siret;
  try {
    const { rows } = await pool.query(`
      SELECT r.*, f.numero, f.client_nom, f.montant_ttc
      FROM relances r
      JOIN factures f ON f.id = r.facture_id
      WHERE r.siret = $1
      ORDER BY r.created_at DESC
      LIMIT 100
    `, [siret]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /relances]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
