/**
 * FacturEasy DB adapter.
 * Uses PostgreSQL when DATABASE_URL exists; otherwise an in-memory dev store.
 */
if (process.env.DATABASE_URL || process.env.NODE_ENV === 'test') {
  const { Pool } = require('pg');
  const requiresSsl = /sslmode=require/i.test(process.env.DATABASE_URL || '');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.NODE_ENV === 'production' || requiresSsl) ? { rejectUnauthorized: false } : false,
  });
  pool.on('error', (err) => {
    console.error('[DB] Erreur inattendue sur client inactif :', err.message);
  });
  module.exports = pool;
} else {
  console.warn('[DB] DATABASE_URL absent - stockage memoire DEV actif.');

  const state = {
    entreprises: [],
    clients: [],
    factures: [],
    authOtps: [],
    regulatoryEvents: [],
    chorusTransmissions: [],
    chorusRecipientCache: [],
    chorusServicesCache: [],
    invoiceSequences: [],
    nextEntrepriseId: 1,
    nextClientId: 1,
    nextFactureId: 1,
    nextOtpId: 1,
    nextRegulatoryEventId: 1,
    nextChorusTransmissionId: 1,
    nextChorusCacheId: 1,
  };

  const nowIso = () => new Date().toISOString();
  const empty = () => ({ rows: [], rowCount: 0 });

  function publicEntreprise(e) {
    if (!e) return e;
    const { password_hash, ...rest } = e;
    return { ...rest };
  }

  function statsFor(siret) {
    const fs = state.factures.filter((f) => f.emetteur_siret === siret);
    const sum = (key) => fs.reduce((total, f) => total + Number(f[key] || 0), 0);
    return {
      total_factures: String(fs.length),
      ca_ttc: String(sum('montant_ttc')),
      ca_ht: String(sum('montant_ht')),
      en_attente: String(fs.filter((f) => f.statut === 'EMISE').length),
      acceptees: String(fs.filter((f) => f.statut === 'ACCEPTEE').length),
      rejetees: String(fs.filter((f) => f.statut === 'REJETEE').length),
      panier_moyen_ht: fs.length ? String(sum('montant_ht') / fs.length) : '0',
    };
  }

  async function query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, ' ').trim();

    if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(s)) return empty();

    if (/SELECT (?:\*|id) FROM entreprises WHERE siret = \$1(?! AND email)/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0]);
      if (!row) return empty();
      return { rows: [/SELECT id FROM/i.test(s) ? { id: row.id } : row], rowCount: 1 };
    }

    if (/SELECT id, siret, nom, email FROM entreprises WHERE siret = \$1 AND email = \$2/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0] && String(e.email || '').toLowerCase() === String(params[1] || '').toLowerCase());
      return { rows: row ? [publicEntreprise(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (/SELECT id, siret, nom, email, plan, trial_ends_at, stripe_customer_id, created_at FROM entreprises WHERE siret = \$1 AND email = \$2/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0] && String(e.email || '').toLowerCase() === String(params[1] || '').toLowerCase());
      return { rows: row ? [publicEntreprise(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (/SELECT id, siret, nom, email, contact_telephone AS telephone, adresse, tva_regime, activite_type, plan, trial_ends_at, stripe_customer_id, created_at FROM entreprises WHERE siret = \$1/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0]);
      return { rows: row ? [publicEntreprise(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO auth_otps/i.test(s)) {
      const row = {
        id: state.nextOtpId++,
        siret: params[0],
        email: params[1],
        code_hash: params[2],
        expires_at: params[3],
        used_at: null,
        created_at: nowIso(),
      };
      state.authOtps.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM auth_otps/i.test(s)) {
      const now = Date.now();
      const row = state.authOtps
        .filter((o) => o.siret === params[0] && String(o.email || '').toLowerCase() === String(params[1] || '').toLowerCase() && !o.used_at && new Date(o.expires_at).getTime() > now)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/UPDATE auth_otps SET used_at/i.test(s)) {
      const row = state.authOtps.find((o) => o.id === params[0]);
      if (!row) return empty();
      row.used_at = nowIso();
      return { rows: [row], rowCount: 1 };
    }

    if (/SELECT id, siret, nom, email, plan, trial_ends_at, stripe_customer_id, created_at FROM entreprises WHERE siret = \$1/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0]);
      return { rows: row ? [publicEntreprise(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO entreprises/i.test(s)) {
      const row = {
        id: state.nextEntrepriseId++,
        siret: params[0],
        nom: params[1],
        email: params[2] || null,
        password_hash: params[3] || null,
        plan: params[4] || 'gratuit',
        contact_nom: params[5] || null,
        contact_telephone: params[6] || null,
        domaine: params[7] || null,
        kbis_url: params[8] || null,
        notes_admin: params[9] || null,
        adresse: null,
        tva_regime: 'reel_normal',
        activite_type: 'services',
        trial_ends_at: null,
        stripe_customer_id: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.entreprises.push(row);
      return { rows: [publicEntreprise(row)], rowCount: 1 };
    }

    if (/FROM entreprises e LEFT JOIN factures f ON f\.emetteur_siret = e\.siret/i.test(s)) {
      const hasSearch = /WHERE \(e\.nom ILIKE \$1 OR e\.siret ILIKE \$1\)/i.test(s);
      const search = hasSearch ? String(params[0] || '').replace(/%/g, '').toLowerCase() : '';
      const limit = Number(params[hasSearch ? 1 : 0] || 20);
      const offset = Number(params[hasSearch ? 2 : 1] || 0);
      const rows = state.entreprises
        .filter((e) => !search || String(e.nom).toLowerCase().includes(search) || String(e.siret).includes(search))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(offset, offset + limit)
        .map((e) => {
          const fs = state.factures.filter((f) => f.emetteur_siret === e.siret);
          const ca = fs.reduce((total, f) => total + Number(f.montant_ttc || 0), 0);
          const last = fs.map((f) => f.date_emission).filter(Boolean).sort().pop() || null;
          return { ...publicEntreprise(e), nb_factures: String(fs.length), ca_ttc_total: String(ca), derniere_facture: last };
        });
      return { rows, rowCount: rows.length };
    }

    if (/SELECT COUNT\(\*\) FROM entreprises/i.test(s)) {
      const search = params[0] ? String(params[0]).replace(/%/g, '').toLowerCase() : '';
      const count = state.entreprises.filter((e) => !search || String(e.nom).toLowerCase().includes(search) || String(e.siret).includes(search)).length;
      return { rows: [{ count: String(count) }], rowCount: 1 };
    }

    if (/COUNT\(\*\).*total_entreprises/i.test(s)) {
      const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return { rows: [{
        total_entreprises: String(state.entreprises.length),
        new_ce_mois: String(state.entreprises.filter((e) => new Date(e.created_at).getTime() > recentCutoff).length),
      }], rowCount: 1 };
    }

    if (/UPDATE entreprises SET nom/i.test(s)) {
      const row = state.entreprises.find((e) => e.siret === params[0]);
      if (!row) return empty();
      row.nom = params[1] || row.nom;
      row.email = params[2] || row.email;
      if (/contact_telephone/i.test(s)) {
        row.contact_telephone = params[3] || null;
        row.telephone = params[3] || null;
        row.adresse = params[4] || null;
        row.tva_regime = params[5] || 'reel_normal';
        row.activite_type = params[6] || 'services';
      }
      row.updated_at = nowIso();
      return { rows: [publicEntreprise(row)], rowCount: 1 };
    }

    if (/DELETE FROM factures\s+WHERE emetteur_siret = \$1/i.test(s)) {
      const before = state.factures.length;
      state.factures = state.factures.filter((f) => f.emetteur_siret !== params[0]);
      return { rows: [], rowCount: before - state.factures.length };
    }

    if (/DELETE FROM clients\s+WHERE siret = \$1/i.test(s)) {
      const before = state.clients.length;
      state.clients = state.clients.filter((c) => c.siret !== params[0]);
      return { rows: [], rowCount: before - state.clients.length };
    }

    if (/DELETE FROM entreprises\s+WHERE siret = \$1/i.test(s)) {
      const before = state.entreprises.length;
      state.entreprises = state.entreprises.filter((e) => e.siret !== params[0]);
      return { rows: [], rowCount: before - state.entreprises.length };
    }

    if (/SELECT id, nom, siret_client, email, telephone, adresse, client_type, regulatory_channel, chorus_service_code, chorus_engagement_required, created_at, updated_at FROM clients WHERE siret = \$1/i.test(s)) {
      const rows = state.clients
        .filter((c) => c.siret === params[0])
        .sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
        .map(({ siret, ...rest }) => rest);
      return { rows, rowCount: rows.length };
    }

    if (/SELECT regulatory_channel FROM clients/i.test(s)) {
      const row = state.clients.find((c) =>
        c.siret === params[0]
        && (c.siret_client === params[1] || String(c.nom || '').toLowerCase() === String(params[2] || '').toLowerCase())
      );
      return { rows: row ? [{ regulatory_channel: row.regulatory_channel || 'B2B_FR_E_INVOICING' }] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO clients/i.test(s)) {
      const row = {
        id: state.nextClientId++,
        siret: params[0],
        nom: params[1],
        siret_client: params[2] || null,
        email: params[3] || null,
        telephone: params[4] || null,
        adresse: params[5] || null,
        client_type: params[6] || 'B2B_FR',
        regulatory_channel: params[7] || 'B2B_FR_E_INVOICING',
        chorus_service_code: params[8] || null,
        chorus_engagement_required: Boolean(params[9]),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.clients.push(row);
      const { siret, ...publicRow } = row;
      return { rows: [publicRow], rowCount: 1 };
    }

    if (/UPDATE clients\s+SET client_type = \$1/i.test(s)) {
      const row = state.clients.find((c) => c.id === Number(params[4]) && c.siret === params[5]);
      if (!row) return { rows: [], rowCount: 0 };
      row.client_type = params[0] || 'B2B_FR';
      row.regulatory_channel = params[1] || 'B2B_FR_E_INVOICING';
      row.chorus_service_code = params[2] || null;
      row.chorus_engagement_required = Boolean(params[3]);
      row.updated_at = nowIso();
      const { siret, ...publicRow } = row;
      return { rows: [publicRow], rowCount: 1 };
    }

    if (/INSERT INTO invoice_sequences/i.test(s)) {
      const key = { siret: params[0], year: params[1] };
      let row = state.invoiceSequences.find((seq) => seq.siret === key.siret && seq.year === key.year);
      if (!row) {
        row = { ...key, last_seq: 1 };
        state.invoiceSequences.push(row);
      } else {
        row.last_seq += 1;
      }
      return { rows: [{ last_seq: row.last_seq }], rowCount: 1 };
    }

    if (/SELECT \* FROM factures WHERE emetteur_siret = \$1/i.test(s)) {
      let rows = state.factures.filter((f) => f.emetteur_siret === params[0]);
      if (/AND statut = \$2/i.test(s)) rows = rows.filter((f) => f.statut === params[1]);
      return { rows, rowCount: rows.length };
    }

    if (/SELECT \* FROM factures WHERE id = \$1/i.test(s)) {
      const row = state.factures.find((f) => f.id === Number(params[0]));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/SELECT numero, date_emission, client_nom, client_siret, montant_ht, tva, montant_ttc, statut, type_document FROM factures/i.test(s)) {
      const rows = state.factures
        .filter((f) => f.emetteur_siret === params[0])
        .sort((a, b) => String(b.date_emission).localeCompare(String(a.date_emission)))
        .map((f) => ({ ...f, type_document: f.type_document || 'FAC' }));
      return { rows, rowCount: rows.length };
    }

    if (/INSERT INTO factures/i.test(s)) {
      const row = {
        id: state.nextFactureId++,
        numero: params[0],
        emetteur_siret: params[1],
        client_siret: params[2],
        client_nom: params[3],
        description: params[4],
        montant_ht: Number(params[5]),
        tva: Number(params[6]),
        montant_ttc: Number(params[7]),
        statut: /'BROUILLON'/i.test(s) ? 'BROUILLON' : 'EMISE',
        chorus_id: /channel/i.test(s) ? null : (params[8] || null),
        channel: /channel/i.test(s) ? params[8] : 'MANUAL',
        recipient_type: /recipient_type/i.test(s) ? params[9] : 'PRIVATE_COMPANY',
        date_emission: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.factures.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/INSERT INTO regulatory_events/i.test(s)) {
      const row = {
        id: state.nextRegulatoryEventId++,
        siret: params[0],
        invoice_id: params[1] || null,
        transaction_id: null,
        channel: params[2],
        status: /'SENT'/i.test(s) ? 'SENT' : 'PREPARED',
        payload_json: params[3] || {},
        response_json: params[4] || null,
        error_message: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.regulatoryEvents.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM regulatory_events/i.test(s)) {
      const limit = Number(params[1] || 50);
      const rows = state.regulatoryEvents
        .filter((e) => e.siret === params[0])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    }

    if (/FROM chorus_recipient_cache/i.test(s)) {
      const row = state.chorusRecipientCache.find((c) => c.entreprise_id === params[0] && c.siret === params[1]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO chorus_recipient_cache/i.test(s)) {
      let row = state.chorusRecipientCache.find((c) => c.entreprise_id === params[0] && c.siret === params[1]);
      if (!row) {
        row = { id: state.nextChorusCacheId++, entreprise_id: params[0], siret: params[1], created_at: nowIso() };
        state.chorusRecipientCache.push(row);
      }
      Object.assign(row, { id_structure: params[2], designation: params[3], statut: params[4], raw_response: params[5], checked_at: nowIso() });
      return { rows: [row], rowCount: 1 };
    }

    if (/INSERT INTO chorus_services_cache/i.test(s)) {
      const row = { id: state.nextChorusCacheId++, entreprise_id: params[0], id_structure: params[1], code_service: params[2], libelle_service: params[3], actif: params[4], raw_response: params[5], checked_at: nowIso(), created_at: nowIso() };
      state.chorusServicesCache.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/INSERT INTO chorus_transmissions/i.test(s)) {
      const row = { id: state.nextChorusTransmissionId++, entreprise_id: params[0], invoice_id: Number(params[1]), environment: params[2], recipient_siret: params[3], status: /'submitted'/.test(s) ? 'submitted' : 'recipient_validated', created_at: nowIso(), updated_at: nowIso() };
      state.chorusTransmissions.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/FROM chorus_transmissions/i.test(s)) {
      let rows = state.chorusTransmissions.filter((t) => t.entreprise_id === params[0]);
      if (/invoice_id = \$2/i.test(s)) rows = rows.filter((t) => t.invoice_id === Number(params[1]));
      return { rows, rowCount: rows.length };
    }

    if (/UPDATE factures SET statut/i.test(s)) {
      const row = state.factures.find((f) => f.id === Number(params[1]));
      if (row) row.statut = params[0];
      return empty();
    }

    if (/COUNT\(\*\).*total_factures/i.test(s) || /FROM factures WHERE emetteur_siret = \$1/i.test(s)) {
      return { rows: [statsFor(params[0])], rowCount: 1 };
    }

    if (/FROM depenses/i.test(s) || /FROM revenus_manuels/i.test(s) || /FROM categories/i.test(s)) {
      if (/COALESCE\(SUM/i.test(s)) return { rows: [{ total: '0', tva: '0' }], rowCount: 1 };
      if (/COUNT/i.test(s)) return { rows: [{ count: '0', total: '0' }], rowCount: 1 };
      return empty();
    }

    return empty();
  }

  module.exports = {
    query,
    async connect() {
      return { query, release() {} };
    },
    on() {},
  };
}
