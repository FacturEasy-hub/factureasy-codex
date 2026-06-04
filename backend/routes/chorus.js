const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { validateSiret, sanitizeText, safeError } = require('../utils/security');
const chorus = require('../services/chorusClient');

const router = express.Router();
router.use(authenticate);
router.use((req, res, next) => {
  if (req.user?.role === 'comptable' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ error: 'Acces en lecture seule - role expert-comptable' });
  }
  next();
});

function entrepriseId(req) {
  return Number(req.user.id || 0) || null;
}

function cleanPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  delete clone.access_token;
  delete clone.client_secret;
  delete clone.cproAccount;
  return clone;
}

function normalizedStructure(siret, data) {
  const row = data?.structures?.[0] || data?.structure || data?.data?.[0] || data;
  if (!row) return { found: false, siret };
  const idStructure = row.idStructure || row.id_structure || row.identifiantStructure || row.id || null;
  return {
    found: Boolean(idStructure),
    siret,
    idStructure,
    designation: row.designation || row.raisonSociale || row.nom || 'Structure publique',
    statut: row.statut || row.etat || 'UNKNOWN',
    raw: data,
  };
}

function normalizedServices(data) {
  const rows = data?.services || data?.data || [];
  return rows.map((s) => ({
    codeService: s.codeService || s.code_service || s.code || '',
    libelleService: s.libelleService || s.libelle || s.nom || '',
    actif: s.actif !== false && s.statut !== 'INACTIF',
    raw: s,
  }));
}

function sendChorusError(res, err) {
  const safe = chorus.normalizeChorusError(err);
  return res.status(safe.status || 502).json({
    error: safe.userMessage || safe.message,
    codeRetour: safe.codeRetour,
    libelle: safe.libelle,
  });
}

router.get('/config/status', (req, res) => {
  res.json(chorus.publicConfig());
});

router.get('/health', async (req, res) => {
  try {
    const result = await chorus.healthcheck();
    res.json({ ok: true, ...result, config: chorus.publicConfig() });
  } catch (err) {
    sendChorusError(res, err);
  }
});

router.post('/structures/search', async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    if (!validateSiret(siret)) return res.status(400).json({ error: 'SIRET invalide : 14 chiffres requis' });
    const cached = await pool.query(
      `SELECT * FROM chorus_recipient_cache
       WHERE entreprise_id = $1 AND siret = $2 AND checked_at > NOW() - INTERVAL '7 days'
       LIMIT 1`,
      [entrepriseId(req), siret]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) {
      return res.json({
        found: Boolean(cached.rows[0].id_structure),
        siret,
        idStructure: cached.rows[0].id_structure,
        designation: cached.rows[0].designation,
        statut: cached.rows[0].statut,
        raw: cached.rows[0].raw_response,
        cached: true,
      });
    }
    const raw = await chorus.searchStructureBySiret(siret);
    const result = normalizedStructure(siret, raw);
    await pool.query(
      `INSERT INTO chorus_recipient_cache (entreprise_id, siret, id_structure, designation, statut, raw_response, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (entreprise_id, siret) DO UPDATE
       SET id_structure = EXCLUDED.id_structure, designation = EXCLUDED.designation, statut = EXCLUDED.statut,
           raw_response = EXCLUDED.raw_response, checked_at = NOW()`,
      [entrepriseId(req), siret, result.idStructure, result.designation, result.statut, raw]
    ).catch(() => {});
    res.json(result);
  } catch (err) {
    sendChorusError(res, err);
  }
});

router.post('/structures/:idStructure/services', async (req, res) => {
  try {
    const idStructure = sanitizeText(req.params.idStructure, 100);
    const raw = await chorus.listServices(idStructure);
    const services = normalizedServices(raw);
    for (const svc of services) {
      await pool.query(
        `INSERT INTO chorus_services_cache (entreprise_id, id_structure, code_service, libelle_service, actif, raw_response, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [entrepriseId(req), idStructure, svc.codeService, svc.libelleService, svc.actif, svc.raw]
      ).catch(() => {});
    }
    res.json(services);
  } catch (err) {
    sendChorusError(res, err);
  }
});

async function getTenantInvoice(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM factures WHERE id = $1 AND emetteur_siret = $2`,
    [req.params.invoiceId, req.user.siret]
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Facture introuvable' });
    return null;
  }
  return rows[0];
}

router.post('/invoices/:invoiceId/prepare', async (req, res) => {
  try {
    const invoice = await getTenantInvoice(req, res);
    if (!invoice) return;
    if (!validateSiret(invoice.client_siret)) return res.status(400).json({ error: 'SIRET destinataire invalide' });
    const raw = await chorus.searchStructureBySiret(invoice.client_siret);
    const recipient = normalizedStructure(invoice.client_siret, raw);
    if (!recipient.found) return res.status(404).json({ error: 'Structure publique introuvable pour ce SIRET.' });
    const servicesRaw = await chorus.listServices(recipient.idStructure);
    const services = normalizedServices(servicesRaw);
    const { rows } = await pool.query(
      `INSERT INTO chorus_transmissions
       (entreprise_id, invoice_id, environment, recipient_siret, recipient_structure_id, status, request_payload, response_payload, last_attempt_at)
       VALUES ($1,$2,$3,$4,$5,'recipient_validated',$6,$7,NOW())
       RETURNING *`,
      [entrepriseId(req), invoice.id, chorus.config().env, invoice.client_siret, recipient.idStructure, { invoiceId: invoice.id }, { recipient, services }]
    );
    res.json({ transmissionId: rows[0]?.id, invoiceId: invoice.id, recipient, services, missingFields: [] });
  } catch (err) {
    sendChorusError(res, err);
  }
});

router.post('/invoices/:invoiceId/submit-pdf', async (req, res) => {
  try {
    const invoice = await getTenantInvoice(req, res);
    if (!invoice) return;
    const existing = await pool.query(
      `SELECT * FROM chorus_transmissions WHERE entreprise_id = $1 AND invoice_id = $2 AND status IN ('submitted','accepted') LIMIT 1`,
      [entrepriseId(req), invoice.id]
    ).catch(() => ({ rows: [] }));
    if (existing.rows[0]) return res.status(409).json({ error: 'La facture a deja ete transmise.' });
    const pdfBase64 = req.body.pdfBase64;
    if (!pdfBase64) return res.status(400).json({ error: 'Cette facture n’a pas encore de PDF genere.' });
    const filename = sanitizeText(req.body.filename || `facture-${invoice.numero}.pdf`, 160);
    const fileRes = await chorus.uploadFile({ filename, mimeType: 'application/pdf', base64Content: pdfBase64 });
    const chorusFileId = fileRes.fileId || fileRes.idFichier || fileRes.identifiantFichier;
    const submitRes = await chorus.submitPdfInvoice({
      invoiceId: invoice.id,
      recipientSiret: invoice.client_siret,
      serviceCode: sanitizeText(req.body.serviceCode || '', 100) || null,
      engagementNumber: sanitizeText(req.body.engagementNumber || '', 100) || null,
      chorusFileId,
    });
    const chorusInvoiceId = submitRes.chorusInvoiceId || submitRes.identifiantFactureCPP || submitRes.numeroFactureCPP;
    const { rows } = await pool.query(
      `INSERT INTO chorus_transmissions
       (entreprise_id, invoice_id, environment, recipient_siret, service_code, engagement_number, status, chorus_invoice_id, chorus_file_id, request_payload, response_payload, last_attempt_at, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7,$8,$9,$10,NOW(),NOW())
       RETURNING *`,
      [entrepriseId(req), invoice.id, chorus.config().env, invoice.client_siret, req.body.serviceCode || null, req.body.engagementNumber || null, chorusInvoiceId, chorusFileId, cleanPayload(req.body), submitRes]
    );
    res.json({ ok: true, status: 'submitted', transmission: rows[0] });
  } catch (err) {
    sendChorusError(res, err);
  }
});

router.post('/invoices/:invoiceId/submit-api', async (req, res) => {
  res.status(501).json({ error: 'Mapping facture vers payload Chorus non finalise. Utiliser submit-pdf.' });
});

router.get('/invoices/:invoiceId/status', async (req, res) => {
  try {
    const invoice = await getTenantInvoice(req, res);
    if (!invoice) return;
    const { rows } = await pool.query(
      `SELECT * FROM chorus_transmissions WHERE entreprise_id = $1 AND invoice_id = $2 ORDER BY created_at DESC`,
      [entrepriseId(req), invoice.id]
    );
    res.json({ invoiceId: invoice.id, latest: rows[0] || null, history: rows });
  } catch (err) {
    const safe = safeError(err);
    res.status(safe.status).json({ error: safe.message });
  }
});

router.get('/transmissions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const status = sanitizeText(req.query.status || '', 30);
    const params = [entrepriseId(req), limit, (page - 1) * limit];
    const where = status ? 'AND status = $4' : '';
    if (status) params.push(status);
    const { rows } = await pool.query(
      `SELECT * FROM chorus_transmissions WHERE entreprise_id = $1 ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      params
    );
    res.json(rows);
  } catch (err) {
    const safe = safeError(err);
    res.status(safe.status).json({ error: safe.message });
  }
});

module.exports = router;
