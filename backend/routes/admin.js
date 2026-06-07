/**
 * FacturEasy — Routes /admin
 * Toutes les routes requièrent le middleware requireAdmin (role: 'admin' dans le JWT).
 * Login admin via POST /auth/admin avec le secret ADMIN_SECRET en variable d'env.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validateSiret, validateEmail, validatePassword, normalizeEmail, sanitizeText, hashPassword } = require('../utils/security');

// Prix mensuels par plan (centimes → euros)
const PLAN_PRICES = { gratuit: 0, solo: 14, pro: 34, equipe: 69, business: 149 };
// Quotas factures / mois par plan (null = illimité)
const PLAN_QUOTAS = { gratuit: 5, solo: 50, pro: null, equipe: null, business: null };

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================================================
// GET /admin/stats — statistiques globales de la plateforme
// =============================================================================
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [entreprises, factures, finances] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                AS total_entreprises,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_ce_mois
        FROM entreprises
      `),
      pool.query(`
        SELECT
          COUNT(*)                                               AS total_factures,
          COUNT(*) FILTER (WHERE statut = 'ACCEPTEE')            AS acceptees,
          COUNT(*) FILTER (WHERE statut = 'REJETEE')             AS rejetees,
          COUNT(*) FILTER (WHERE statut = 'EMISE')               AS en_attente,
          COALESCE(SUM(montant_ttc), 0)                          AS volume_ttc_total,
          COALESCE(SUM(montant_ht),  0)                          AS volume_ht_total,
          COALESCE(SUM(montant_ttc) FILTER (
            WHERE date_emission > NOW() - INTERVAL '30 days'), 0) AS volume_ce_mois
        FROM factures
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(montant_ttc), 0) AS total_depenses,
          COUNT(*)                       AS nb_depenses
        FROM depenses
      `).catch(() => ({ rows: [{ total_depenses: 0, nb_depenses: 0 }] }))
    ]);

    res.json({
      entreprises: entreprises.rows[0],
      factures:    factures.rows[0],
      finances:    finances.rows[0],
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/stats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /admin/revenue — MRR, ARR, churn, historique, répartition par plan
// =============================================================================
router.get('/revenue', requireAdmin, async (req, res) => {
  try {
    // Répartition actuelle par plan
    const { rows: byPlanRows } = await pool.query(`
      SELECT
        plan,
        COUNT(*) AS nb
      FROM entreprises
      GROUP BY plan
    `);

    // MRR actuel
    let mrr = 0;
    const planBreakdown = {};
    const byPlan = Array.isArray(byPlanRows) ? byPlanRows : [];
    byPlan.forEach(({ plan, nb }) => {
      const price = PLAN_PRICES[plan] || 0;
      const count = parseInt(nb, 10);
      mrr += price * count;
      planBreakdown[plan] = { count, mrr: price * count, price };
    });

    // Historique inscriptions par mois (12 derniers mois)
    const { rows: historyRows } = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*) AS new_clients,
        COUNT(*) FILTER (WHERE plan != 'gratuit') AS new_paying
      FROM entreprises
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `);

    // MRR ajouté par mois (basé sur les inscriptions — approximatif)
    const history = Array.isArray(historyRows) ? historyRows : [];
    const mrrHistory = history.map(row => ({
      month:       row.month,
      new_clients: parseInt(row.new_clients, 10),
      new_paying:  parseInt(row.new_paying, 10),
    }));

    // Taux de conversion essai → payant
    const { rows: convRows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE trial_ends_at IS NOT NULL)                          AS total_trials,
        COUNT(*) FILTER (WHERE trial_ends_at IS NOT NULL AND plan != 'gratuit')    AS converted
      FROM entreprises
    `);
    const conversionRow = convRows?.[0] || {};
    const totalTrials = parseInt(conversionRow.total_trials || 0, 10);
    const converted   = parseInt(conversionRow.converted || 0, 10);
    const conversionRate = totalTrials > 0 ? Math.round((converted / totalTrials) * 100) : 0;

    // Churn ce mois : essais expirés ce mois restés en gratuit
    const { rows: churnRows } = await pool.query(`
      SELECT COUNT(*) AS churn
      FROM entreprises
      WHERE trial_ends_at IS NOT NULL
        AND trial_ends_at < NOW()
        AND trial_ends_at >= DATE_TRUNC('month', NOW())
        AND plan = 'gratuit'
    `);
    const churnThisMonth = parseInt(churnRows?.[0]?.churn || 0, 10);

    // ARPU (sur les payants uniquement)
    const payingCount = Object.values(planBreakdown)
      .filter((_, k) => k !== 'gratuit')
      .reduce((sum, p) => sum + p.count, 0);
    const payingMRR = Object.entries(planBreakdown)
      .filter(([k]) => k !== 'gratuit')
      .reduce((sum, [, p]) => sum + p.mrr, 0);
    const arpu = payingCount > 0 ? Math.round(payingMRR / payingCount) : 0;

    res.json({
      mrr_current:     mrr,
      arr:             mrr * 12,
      arpu,
      churn_this_month: churnThisMonth,
      conversion_rate: conversionRate,
      total_trials:    totalTrials,
      converted,
      by_plan:         planBreakdown,
      mrr_history:     mrrHistory,
    });
  } catch (err) {
    console.error('[admin/revenue]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /admin/monitoring — alertes : essais expirant, non-convertis, quotas
// =============================================================================
router.get('/monitoring', requireAdmin, async (req, res) => {
  try {
    // Essais expirant dans les 7 prochains jours
    const { rows: expiringSoon } = await pool.query(`
      SELECT siret, nom, email, plan, trial_ends_at,
        CEIL(EXTRACT(EPOCH FROM (trial_ends_at - NOW())) / 86400)::int AS days_left
      FROM entreprises
      WHERE trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '7 days'
      ORDER BY trial_ends_at ASC
    `);

    // Essais expirés non convertis (plan gratuit, essai terminé il y a > 0 jours)
    const { rows: expiredUnconverted } = await pool.query(`
      SELECT siret, nom, email, plan, trial_ends_at,
        CEIL(EXTRACT(EPOCH FROM (NOW() - trial_ends_at)) / 86400)::int AS days_since_expired
      FROM entreprises
      WHERE trial_ends_at IS NOT NULL
        AND trial_ends_at < NOW()
        AND plan = 'gratuit'
      ORDER BY trial_ends_at DESC
      LIMIT 50
    `);

    // Usage proche des limites (Solo: 50 fact/mois, Gratuit: 5 fact/mois)
    const { rows: highUsage } = await pool.query(`
      SELECT
        e.siret, e.nom, e.email, e.plan,
        COUNT(f.id) FILTER (
          WHERE f.date_emission >= DATE_TRUNC('month', NOW())
        )::int AS factures_ce_mois
      FROM entreprises e
      LEFT JOIN factures f ON f.emetteur_siret = e.siret
      WHERE e.plan IN ('solo', 'gratuit')
      GROUP BY e.siret, e.nom, e.email, e.plan
      HAVING COUNT(f.id) FILTER (
        WHERE f.date_emission >= DATE_TRUNC('month', NOW())
      ) >= CASE WHEN e.plan = 'gratuit' THEN 4 ELSE 40 END
      ORDER BY factures_ce_mois DESC
    `);

    // Comptes payants récents (30 derniers jours) — signaux positifs
    const { rows: recentPaying } = await pool.query(`
      SELECT siret, nom, email, plan, updated_at
      FROM entreprises
      WHERE plan != 'gratuit'
        AND updated_at >= NOW() - INTERVAL '30 days'
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    res.json({
      expiring_soon:       expiringSoon,
      expired_unconverted: expiredUnconverted,
      high_usage:          highUsage.map(r => ({
        ...r,
        quota: PLAN_QUOTAS[r.plan],
        pct:   PLAN_QUOTAS[r.plan]
          ? Math.round((r.factures_ce_mois / PLAN_QUOTAS[r.plan]) * 100)
          : 0,
      })),
      recent_paying: recentPaying,
    });
  } catch (err) {
    console.error('[admin/monitoring]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /admin/entreprises — liste toutes les entreprises
// =============================================================================
router.get('/entreprises', requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit || '20', 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;

    let sql = `
      SELECT
        e.*,
        COUNT(f.id)                                          AS nb_factures,
        COALESCE(SUM(f.montant_ttc), 0)                     AS ca_ttc_total,
        MAX(f.date_emission)                                 AS derniere_facture
      FROM entreprises e
      LEFT JOIN factures f ON f.emetteur_siret = e.siret
    `;
    const params = [];

    if (search) {
      sql += ` WHERE (e.nom ILIKE $1 OR e.siret ILIKE $1)`;
      params.push(search);
    }

    sql += ` GROUP BY e.id ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows: entrepriseRows } = await pool.query(sql, params);
    const rows = Array.isArray(entrepriseRows) ? entrepriseRows : [];

    let countSql = 'SELECT COUNT(*) FROM entreprises';
    const countParams = [];
    if (search) { countSql += ' WHERE (nom ILIKE $1 OR siret ILIKE $1)'; countParams.push(search); }
    const { rows: countRows } = await pool.query(countSql, countParams);
    const total = parseInt(countRows?.[0]?.count ?? rows.length, 10);

    res.json({
      data:  rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin/entreprises]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /admin/entreprises/:siret — détail d'une entreprise + ses factures
// =============================================================================
router.post('/entreprises', requireAdmin, async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    const nom = sanitizeText(req.body.nom, 255);
    const email = normalizeEmail(req.body.email || '');
    const password = req.body.password;
    const plan = sanitizeText(req.body.plan || 'gratuit', 50);
    const contactNom = sanitizeText(req.body.contact_nom || '', 255);
    const contactTelephone = sanitizeText(req.body.contact_telephone || '', 50);
    const domaine = sanitizeText(req.body.domaine || '', 255);
    const kbisUrl = sanitizeText(req.body.kbis_url || '', 1000);
    const notesAdmin = sanitizeText(req.body.notes_admin || '', 2000);

    if (!validateSiret(siret)) return res.status(400).json({ error: 'SIRET invalide' });
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    if (email && !validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Mot de passe requis (8 caracteres minimum)' });
    if (!['gratuit', 'solo', 'pro', 'equipe', 'business'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    const { rows } = await pool.query(
      `INSERT INTO entreprises (
         siret, nom, email, password_hash, plan,
         contact_nom, contact_telephone, domaine, kbis_url, notes_admin
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, siret, nom, email, plan, trial_ends_at, stripe_customer_id,
                 contact_nom, contact_telephone, domaine, kbis_url, notes_admin, created_at`,
      [
        siret, nom, email || null, hashPassword(password), plan,
        contactNom || null, contactTelephone || null, domaine || null, kbisUrl || null, notesAdmin || null,
      ]
    );
    res.status(201).json({ ok: true, entreprise: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Entreprise deja existante' });
    console.error('[admin POST /entreprises]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/entreprises/:siret', requireAdmin, async (req, res) => {
  try {
    const { rows: ent } = await pool.query(
      'SELECT * FROM entreprises WHERE siret = $1', [req.params.siret]
    );
    if (!ent[0]) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { rows: factures } = await pool.query(
      'SELECT * FROM factures WHERE emetteur_siret = $1 ORDER BY date_emission DESC LIMIT 50',
      [req.params.siret]
    );

    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*)                                      AS total,
        COUNT(*) FILTER (WHERE statut = 'ACCEPTEE')   AS acceptees,
        COUNT(*) FILTER (WHERE statut = 'REJETEE')    AS rejetees,
        COUNT(*) FILTER (WHERE date_emission >= DATE_TRUNC('month', NOW())) AS ce_mois,
        COALESCE(SUM(montant_ttc), 0)                 AS ca_ttc,
        COALESCE(SUM(montant_ht),  0)                 AS ca_ht
      FROM factures WHERE emetteur_siret = $1
    `, [req.params.siret]);

    res.json({ entreprise: ent[0], stats: stats[0], factures });
  } catch (err) {
    console.error('[admin/entreprises/:siret]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// PATCH /admin/entreprises/:siret/plan — changer le plan manuellement
// Body: { plan: 'gratuit'|'solo'|'pro'|'equipe'|'business' }
// =============================================================================
router.patch('/entreprises/:siret/plan', requireAdmin, async (req, res) => {
  const { siret } = req.params;
  const { plan }  = req.body;
  const validPlans = ['gratuit', 'solo', 'pro', 'equipe', 'business'];

  if (!plan || !validPlans.includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide', valid: validPlans });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE entreprises SET plan = $1, updated_at = NOW() WHERE siret = $2 RETURNING *`,
      [plan, siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    console.log(`[admin] Plan changé manuellement : ${siret} → ${plan}`);
    res.json({ ok: true, entreprise: rows[0] });
  } catch (err) {
    console.error('[admin/plan]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// PATCH /admin/entreprises/:siret/trial — prolonger l'essai
// Body: { days: 30 }
// =============================================================================
router.patch('/entreprises/:siret/trial', requireAdmin, async (req, res) => {
  const { siret } = req.params;
  const days = parseInt(req.body.days || '30', 10);

  if (!days || days < 1 || days > 365) {
    return res.status(400).json({ error: 'Durée invalide (1-365 jours)' });
  }

  try {
    // Si trial_ends_at est dans le passé ou null, on repart de maintenant
    const { rows } = await pool.query(`
      UPDATE entreprises
      SET trial_ends_at = CASE
        WHEN trial_ends_at IS NULL OR trial_ends_at < NOW()
          THEN NOW() + ($1 || ' days')::INTERVAL
        ELSE trial_ends_at + ($1 || ' days')::INTERVAL
        END,
        updated_at = NOW()
      WHERE siret = $2
      RETURNING *
    `, [days, siret]);

    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    console.log(`[admin] Essai prolongé : ${siret} +${days}j → ${rows[0].trial_ends_at}`);
    res.json({ ok: true, entreprise: rows[0] });
  } catch (err) {
    console.error('[admin/trial]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// POST /admin/entreprises/:siret/relance — envoyer un email de relance manuel
// Body: { message?: string }
// =============================================================================
router.post('/entreprises/:siret/relance', requireAdmin, async (req, res) => {
  const { siret } = req.params;

  try {
    const { rows } = await pool.query(
      'SELECT nom, email, plan, trial_ends_at FROM entreprises WHERE siret = $1', [siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    const ent = rows[0];

    if (!ent.email) return res.status(400).json({ error: 'Pas d\'email renseigné pour cette entreprise' });

    const RESEND_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_KEY) {
      // Log uniquement si Resend n'est pas configuré
      console.log(`[admin/relance] Email simulé vers ${ent.email} (RESEND_API_KEY manquant)`);
      return res.json({ ok: true, sent: false, reason: 'RESEND_API_KEY non configuré — email simulé en log' });
    }

    // Envoi via Resend
    const https  = require('https');
    const body   = JSON.stringify({
      from:    'FacturEasy <noreply@factureasy.fr>',
      to:      [ent.email],
      subject: `[FacturEasy] Votre essai gratuit — ${ent.nom}`,
      html: req.body.message
        ? `<p>${escapeHtml(req.body.message).replace(/\n/g, '<br>')}</p>`
        : `<p>Bonjour,</p>
           <p>Nous souhaitons prendre de vos nouvelles concernant votre essai <strong>FacturEasy</strong>.</p>
           <p>Votre période d'essai ${ent.trial_ends_at ? `se termine le <strong>${new Date(ent.trial_ends_at).toLocaleDateString('fr-FR')}</strong>` : 'est en cours'}.</p>
           <p>Pour toute question, répondez directement à cet email.</p>
           <p>L'équipe FacturEasy</p>`,
    });

    await new Promise((resolve, reject) => {
      const reqHttp = https.request({
        hostname: 'api.resend.com',
        path:     '/emails',
        method:   'POST',
        headers:  { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => {
          const json = JSON.parse(raw);
          if (r.statusCode >= 400) reject(new Error(json.message || `HTTP ${r.statusCode}`));
          else resolve(json);
        });
      });
      reqHttp.on('error', reject);
      reqHttp.write(body);
      reqHttp.end();
    });

    console.log(`[admin/relance] Email envoyé à ${ent.email}`);
    res.json({ ok: true, sent: true, to: ent.email });
  } catch (err) {
    console.error('[admin/relance]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// GET /admin/factures — toutes les factures de la plateforme
// =============================================================================
router.get('/factures', requireAdmin, async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit     = Math.min(100, parseInt(req.query.limit || '20', 10));
    const offset    = (page - 1) * limit;
    const { statut, siret, date_from, date_to } = req.query;

    let sql = 'SELECT f.*, e.nom AS emetteur_nom FROM factures f LEFT JOIN entreprises e ON e.siret = f.emetteur_siret WHERE 1=1';
    const params = [];
    let i = 1;

    if (statut)    { sql += ` AND f.statut = $${i++}`;                    params.push(statut); }
    if (siret)     { sql += ` AND f.emetteur_siret = $${i++}`;            params.push(siret); }
    if (date_from) { sql += ` AND f.date_emission >= $${i++}`;            params.push(date_from); }
    if (date_to)   { sql += ` AND f.date_emission <= $${i++}::date + 1`;  params.push(date_to); }

    sql += ` ORDER BY f.date_emission DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);

    let countSql = 'SELECT COUNT(*) FROM factures WHERE 1=1';
    const countParams = [];
    let j = 1;
    if (statut)    { countSql += ` AND statut = $${j++}`;                     countParams.push(statut); }
    if (siret)     { countSql += ` AND emetteur_siret = $${j++}`;             countParams.push(siret); }
    if (date_from) { countSql += ` AND date_emission >= $${j++}`;             countParams.push(date_from); }
    if (date_to)   { countSql += ` AND date_emission <= $${j++}::date + 1`;   countParams.push(date_to); }
    const { rows: countRows } = await pool.query(countSql, countParams);

    res.json({
      data:  rows,
      total: parseInt(countRows[0].count, 10),
      page,
      limit,
      pages: Math.ceil(parseInt(countRows[0].count, 10) / limit),
    });
  } catch (err) {
    console.error('[admin/factures]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// DELETE /admin/entreprises/:siret — supprime une entreprise et ses données
// =============================================================================
router.delete('/entreprises/:siret', requireAdmin, async (req, res) => {
  const { siret } = req.params;
  const client = await pool.connect();
  const tableExists = async (table) => {
    const safeTable = String(table).replace(/[^a-zA-Z0-9_]/g, '');
    const exists = await client.query('SELECT to_regclass($1) AS table_name', [`public.${safeTable}`]);
    return exists.rows[0]?.table_name ? safeTable : null;
  };
  const deleteIfTableExists = async (table, column = 'siret') => {
    const safeTable = await tableExists(table);
    const safeColumn = String(column).replace(/[^a-zA-Z0-9_]/g, '');
    if (safeTable) {
      await client.query(`DELETE FROM ${safeTable} WHERE ${safeColumn} = $1`, [siret]);
    }
  };
  const deleteSqlIfTableExists = async (table, sql) => {
    if (await tableExists(table)) await client.query(sql, [siret]);
  };
  try {
    const { rows } = await client.query('SELECT id FROM entreprises WHERE siret = $1', [siret]);
    if (!rows[0]) { client.release(); return res.status(404).json({ error: 'Entreprise introuvable' }); }

    await client.query('BEGIN');
    await deleteSqlIfTableExists('relances', 'DELETE FROM relances WHERE siret = $1 OR facture_id IN (SELECT id FROM factures WHERE emetteur_siret = $1)');
    await deleteIfTableExists('recurring_invoices', 'emetteur_siret');
    await deleteIfTableExists('comptable_invites');
    await deleteIfTableExists('journal_entries');
    await deleteIfTableExists('crm_contrats');
    await deleteIfTableExists('e_reporting');
    await deleteIfTableExists('catalogue');
    await deleteIfTableExists('devis');
    await deleteIfTableExists('devis_sequences');
    await deleteIfTableExists('invoice_sequences');
    await client.query('DELETE FROM factures       WHERE emetteur_siret = $1', [siret]);
    await deleteIfTableExists('clients');
    await deleteIfTableExists('depenses');
    await deleteIfTableExists('revenus_manuels');
    await client.query('DELETE FROM entreprises     WHERE siret = $1', [siret]);
    await client.query('COMMIT');

    res.json({ ok: true, message: `Entreprise ${siret} et toutes ses données supprimées` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin DELETE /entreprises/:siret]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;
