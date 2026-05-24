/**
 * FacturEasy - Suite de tests Jest
 * Couverture : auth, factures, stats, securite IDOR, admin
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'factureasy-test-secret';

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// Helpers

const JWT_SECRET = 'factureasy-test-secret';

function makeToken(payload) {
  return jwt.sign(
    Object.assign({ siret: '12345678901234', nom: 'Entreprise Test', id: 1 }, payload || {}),
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'factureasy-api', audience: 'factureasy-app' }
  );
}

function bearer(token) {
  return { Authorization: 'Bearer ' + token };
}

// Mock PostgreSQL

const mockFactures = [];
const mockEntreprises = [];

const mockQuery = jest.fn(async function(sql, params) {
  params = params || [];
  var s = sql.replace(/\s+/g, ' ').trim();

  if (/INSERT INTO entreprises/.test(s)) {
    var row = { id: 1, siret: params[0], nom: params[1], email: params[2] || null, password_hash: params[3] || null, plan: 'gratuit', created_at: new Date().toISOString() };
    mockEntreprises.push(row);
    return { rows: [row] };
  }
  if (/SELECT \* FROM entreprises WHERE siret/.test(s)) {
    return { rows: mockEntreprises.filter(function(e) { return e.siret === params[0]; }) };
  }
  if (/UPDATE entreprises SET nom/.test(s)) {
    var e = mockEntreprises.find(function(x) { return x.siret === params[0]; });
    if (!e) return { rows: [] };
    e.nom = params[1] || e.nom;
    e.email = params[2] || e.email;
    return { rows: [e] };
  }
  if (/SELECT \* FROM factures WHERE emetteur_siret/.test(s)) {
    var rows = mockFactures.filter(function(f) { return f.emetteur_siret === params[0]; });
    if (params[1]) rows = rows.filter(function(f) { return f.statut === params[1]; });
    return { rows: rows };
  }
  if (/SELECT \* FROM factures WHERE id/.test(s)) {
    return { rows: mockFactures.filter(function(f) { return f.id === parseInt(params[0]); }) };
  }
  if (/INSERT INTO factures/.test(s)) {
    var f = {
      id: mockFactures.length + 1,
      numero: params[0],
      emetteur_siret: params[1],
      client_siret: params[2],
      client_nom: params[3],
      description: params[4] || null,
      montant_ht: parseFloat(params[5]),
      tva: parseFloat(params[6]),
      montant_ttc: parseFloat(params[7]),
      statut: 'EMISE',
      chorus_id: params[8] || ('MOCK-' + params[0]),
      date_emission: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockFactures.push(f);
    return { rows: [f] };
  }
  if (/UPDATE factures SET statut/.test(s)) {
    var found = mockFactures.find(function(f) { return f.id === parseInt(params[1]); });
    if (found) found.statut = params[0];
    return { rows: [] };
  }
  if (/COUNT\(\*\).*total_factures/.test(s)) {
    var factures = mockFactures.filter(function(f) { return f.emetteur_siret === params[0]; });
    return { rows: [{
      total_factures: String(factures.length),
      ca_ttc: String(factures.reduce(function(s, f) { return s + f.montant_ttc; }, 0)),
      ca_ht:  String(factures.reduce(function(s, f) { return s + f.montant_ht;  }, 0)),
      en_attente: String(factures.filter(function(f) { return f.statut === 'EMISE'; }).length),
      acceptees:  String(factures.filter(function(f) { return f.statut === 'ACCEPTEE'; }).length),
      rejetees:   String(factures.filter(function(f) { return f.statut === 'REJETEE'; }).length),
      panier_moyen_ht: '0',
    }]};
  }
  if (/FROM depenses/.test(s) && /INSERT/.test(s)) {
    return { rows: [{ id: 1, siret: params[0], montant: parseFloat(params[1]), categorie: params[2] }] };
  }
  if (/FROM depenses/.test(s)) {
    return { rows: [] };
  }
  if (/FROM revenus_manuels/.test(s) && /INSERT/.test(s)) {
    return { rows: [{ id: 1, siret: params[0], montant: parseFloat(params[1]) }] };
  }
  if (/FROM revenus_manuels/.test(s)) {
    return { rows: [] };
  }
  if (/tva_collectee|tva_deductible/.test(s)) {
    return { rows: [{ tva_collectee: '0', tva_deductible: '0', tva_nette: '0' }] };
  }
  if (/total_entreprises/.test(s)) {
    return { rows: [{ total_entreprises: '0', new_ce_mois: '0' }] };
  }
  if (/total_factures.*acceptees.*rejetees.*volume/.test(s)) {
    return { rows: [{ total_factures: '0', acceptees: '0', rejetees: '0', en_attente: '0', volume_ttc_total: '0', volume_ht_total: '0', volume_ce_mois: '0' }] };
  }
  if (/total_depenses/.test(s)) {
    return { rows: [{ total_depenses: '0', nb_depenses: '0' }] };
  }
  if (/CREATE TABLE|CREATE INDEX/.test(s)) return { rows: [] };
  // invoice_sequences
  if (/INSERT INTO invoice_sequences/.test(s)) {
    return { rows: [{ last_seq: 1 }] };
  }
  // avoirs — get avoir lié
  if (/FROM factures WHERE avoir_de_facture_id/.test(s)) {
    return { rows: [] };
  }
  // SIRENE cache proxy — shouldn't hit DB (handled in route)
  // recurring_invoices — list
  if (/FROM recurring_invoices WHERE emetteur_siret/.test(s)) {
    return { rows: [] };
  }
  // recurring_invoices — insert
  if (/INSERT INTO recurring_invoices/.test(s)) {
    return { rows: [{ id: 1, emetteur_siret: params[0], client_nom: params[1], frequence: params[2] || 'MENSUEL', actif: true, prochaine_date: new Date().toISOString() }] };
  }
  // recurring_invoices — update
  if (/UPDATE recurring_invoices SET/.test(s)) {
    return { rows: [{ id: parseInt(params[params.length - 1]) }] };
  }
  // relances — insert
  if (/INSERT INTO relances/.test(s)) {
    return { rows: [{ id: 1, facture_id: params[0], siret: params[1], date_envoi: new Date().toISOString() }] };
  }
  // relances — select
  if (/FROM relances/.test(s)) {
    return { rows: [] };
  }
  // comptable_invites — insert
  if (/INSERT INTO comptable_invites/.test(s)) {
    return { rows: [{ id: 1, siret: params[0], token: params[1], expires_at: params[2] }] };
  }
  // comptable_invites — select by token
  if (/FROM comptable_invites WHERE token/.test(s)) {
    // Return expired/used = simulate "not found" by default
    return { rows: [] };
  }
  // vat_summary by rate (CA3)
  if (/taux_tva.*GROUP BY taux_tva/.test(s)) {
    return { rows: [{ taux_tva: '20', base_ht: '1000', tva_amount: '200' }] };
  }
  return { rows: [] };
});

jest.mock('pg', function() {
  return {
    Pool: jest.fn(function() {
      return {
        query: mockQuery,
        on: jest.fn(),
        connect: jest.fn(async function() {
          return { query: mockQuery, release: jest.fn() };
        }),
      };
    }),
  };
});

jest.mock('../services/http', function() {
  return {
    post: jest.fn(async function(url) {
      if (url.includes('token')) return { data: { access_token: 'mock-token', expires_in: 3600 } };
      return { data: { identifiantFactureCPP: 'CHORUS-MOCK-001' } };
    }),
    get: jest.fn(async function() { return { data: { statut: 'ACCEPTEE' } }; }),
  };
});

const app = require('../server');

beforeEach(function() {
  mockFactures.length = 0;
  mockEntreprises.length = 0;
  mockQuery.mockClear();
});

// HEALTH

describe('GET /health', function() {
  it('retourne 200 ok:true', async function() {
    var res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// AUTH

describe('POST /auth/login', function() {
  it('retourne 400 si siret manquant', async function() {
    var res = await request(app).post('/auth/login').send({ nom: 'Test SARL', email: 'test@example.com', password: 'motdepasse123' });
    expect(res.status).toBe(400);
  });

  it('retourne 400 si nom manquant', async function() {
    var res = await request(app).post('/auth/login').send({ siret: '12345678901234', email: 'test@example.com', password: 'motdepasse123' });
    expect(res.status).toBe(400);
  });

  it('retourne un token JWT valide + entreprise', async function() {
    var res = await request(app).post('/auth/login').send({
      siret: '12345678901234', nom: 'Test SARL', email: 'test@example.com', password: 'motdepasse123',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('entreprise');
    var decoded = jwt.verify(res.body.token, JWT_SECRET, { issuer: 'factureasy-api', audience: 'factureasy-app' });
    expect(decoded.siret).toBe('12345678901234');
  });
});

// SECURITE - routes sans token

describe('Routes protegees sans JWT -> 401', function() {
  var routes = [
    ['get',   '/factures'],
    ['post',  '/factures'],
    ['get',   '/stats/12345678901234'],
    ['get',   '/entreprises/12345678901234'],
  ];

  routes.forEach(function(r) {
    it(r[0].toUpperCase() + ' ' + r[1] + ' -> 401', async function() {
      var res = await request(app)[r[0]](r[1]);
      expect(res.status).toBe(401);
    });
  });
});

// IDOR

describe('Securite IDOR', function() {
  it('GET /factures retourne uniquement les factures du JWT', async function() {
    mockFactures.push({ id: 1, numero: 'FE-001', emetteur_siret: '11111111100001', client_siret: '99999999900001', client_nom: 'A', montant_ht: 100, tva: 20, montant_ttc: 120, statut: 'EMISE' });
    mockFactures.push({ id: 2, numero: 'FE-002', emetteur_siret: '22222222200002', client_siret: '99999999900001', client_nom: 'B', montant_ht: 200, tva: 20, montant_ttc: 240, statut: 'EMISE' });
    var token = makeToken({ siret: '11111111100001' });
    var res = await request(app).get('/factures').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.every(function(f) { return f.emetteur_siret === '11111111100001'; })).toBe(true);
  });

  it('GET /stats/:siret -> 403 si siret JWT != param', async function() {
    var token = makeToken({ siret: '11111111100001' });
    var res = await request(app).get('/stats/99999999900001').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('GET /factures/:id -> 403 si facture appartient a un autre', async function() {
    mockFactures.push({ id: 99, numero: 'FE-099', emetteur_siret: '99999999900001', client_siret: '11111111100001', client_nom: 'Test', montant_ht: 100, tva: 20, montant_ttc: 120, statut: 'EMISE' });
    var token = makeToken({ siret: '11111111100001' });
    var res = await request(app).get('/factures/99').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('POST /factures: emetteur_siret vient du JWT, pas du body', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/factures').set(bearer(token)).send({
      emetteur_siret: '99999999999999',
      client_siret: '98765432109876', client_nom: 'Test IDOR', montant_ht: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.emetteur_siret).toBe('12345678901234');
    expect(res.body.emetteur_siret).not.toBe('99999999999999');
  });
});

// FACTURES CRUD

describe('GET /factures', function() {
  it('retourne un tableau vide si aucune facture', async function() {
    var token = makeToken();
    var res = await request(app).get('/factures').set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /factures/:id', function() {
  it('retourne 404 pour un id inexistant', async function() {
    var token = makeToken();
    var res = await request(app).get('/factures/999999').set(bearer(token));
    expect(res.status).toBe(404);
  });
});

describe('POST /factures', function() {
  it('retourne 400 si champs obligatoires manquants', async function() {
    var token = makeToken();
    var res = await request(app).post('/factures').set(bearer(token)).send({ client_nom: 'Test' });
    expect(res.status).toBe(400);
  });

  it('cree une facture avec TTC correct a 20%', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/factures').set(bearer(token)).send({
      client_siret: '98765432109876', client_nom: 'Mairie de Lyon',
      description: 'Accompagnement PPF', montant_ht: 490, tva: 20,
    });
    expect(res.status).toBe(201);
    expect(res.body.montant_ttc).toBe(588);
    expect(res.body.statut).toBe('EMISE');
    expect(res.body.emetteur_siret).toBe('12345678901234');
  });

  it('calcule correctement le TTC a 10%', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/factures').set(bearer(token)).send({
      client_siret: '98765432109876', client_nom: 'Client TVA 10%', montant_ht: 1000, tva: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.montant_ttc).toBe(1100);
  });
});

// STATS

describe('GET /stats/:siret', function() {
  it('retourne les statistiques pour le bon siret', async function() {
    var siret = '12345678901234';
    var token = makeToken({ siret: siret });
    var res = await request(app).get('/stats/' + siret).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_factures');
    expect(res.body).toHaveProperty('acceptees');
  });
});

// JWT INVALIDE

describe('JWT invalide', function() {
  it('retourne 401 avec token forge', async function() {
    var fakeToken = jwt.sign({ siret: '12345678901234' }, 'mauvais-secret', { issuer: 'factureasy-api', audience: 'factureasy-app' });
    var res = await request(app).get('/factures').set(bearer(fakeToken));
    expect(res.status).toBe(401);
  });

  it('retourne 401 avec token expire', async function() {
    var expiredToken = jwt.sign({ siret: '12345678901234', nom: 'Test' }, JWT_SECRET, { expiresIn: '-1s', issuer: 'factureasy-api', audience: 'factureasy-app' });
    var res = await request(app).get('/factures').set(bearer(expiredToken));
    expect(res.status).toBe(401);
  });

  it('retourne 401 avec header malformed', async function() {
    var res = await request(app).get('/factures').set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });
});

// ADMIN

describe('Routes /admin - controle acces', function() {
  it('GET /admin/stats -> 401 sans token', async function() {
    var res = await request(app).get('/admin/stats');
    expect(res.status).toBe(401);
  });

  it('GET /admin/stats -> 403 avec token user normal', async function() {
    var token = makeToken({ siret: '12345678901234', role: 'user' });
    var res = await request(app).get('/admin/stats').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('GET /admin/stats -> 200 avec token admin', async function() {
    var token = makeToken({ siret: '12345678901234', role: 'admin' });
    var res = await request(app).get('/admin/stats').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entreprises');
    expect(res.body).toHaveProperty('factures');
  });
});

// --- FINANCES CA3 ---

describe('GET /finances/ca3/:siret', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).get('/finances/ca3/12345678901234');
    expect(res.status).toBe(401);
  });

  it('retourne 403 si siret JWT != param', async function() {
    var token = makeToken({ siret: '11111111100001' });
    var res = await request(app).get('/finances/ca3/99999999900001').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('retourne 200 ou 400 avec cadres si mois fourni', async function() {
    var siret = '12345678901234';
    var token = makeToken({ siret: siret });
    var mois = new Date().getFullYear() + '-01';
    var res = await request(app).get('/finances/ca3/' + siret + '?mois=' + mois).set(bearer(token));
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('meta');
    }
  });
});

// --- SIRENE ---

describe('GET /sirene/:siret', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).get('/sirene/12345678901234');
    expect(res.status).toBe(401);
  });

  it('retourne 400 si siret invalide (pas 14 chiffres)', async function() {
    var token = makeToken();
    var res = await request(app).get('/sirene/123').set(bearer(token));
    expect([400, 422]).toContain(res.status);
  });

  it('retourne 200 ou 503 fallback pour siret valide (INSEE indisponible en test)', async function() {
    var token = makeToken();
    var res = await request(app).get('/sirene/12345678901234').set(bearer(token));
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) {
      expect(res.body).toHaveProperty('fallback', true);
    }
  });
});

// --- AVOIRS ---

describe('POST /factures/:id/avoir', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).post('/factures/1/avoir');
    expect(res.status).toBe(401);
  });

  it('retourne 404 ou 403 si facture inexistante', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/factures/99999/avoir').set(bearer(token));
    expect([404, 403]).toContain(res.status);
  });
});

describe('GET /factures/:id/avoir', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).get('/factures/1/avoir');
    expect(res.status).toBe(401);
  });
});

// --- FACTURES RECURRENTES ---

describe('GET /factures/recurrentes', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).get('/factures/recurrentes');
    expect(res.status).toBe(401);
  });

  it('retourne un tableau pour un utilisateur authentifie', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).get('/factures/recurrentes').set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /factures/recurrentes', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).post('/factures/recurrentes').send({ client_nom: 'Test', montant_ht: 100, frequence: 'MENSUEL' });
    expect(res.status).toBe(401);
  });

  it('retourne 400 ou 201 selon la validation des champs', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/factures/recurrentes').set(bearer(token)).send({ client_nom: 'Test' });
    expect([400, 201]).toContain(res.status);
  });
});

// --- RELANCES ---

describe('POST /relances/:factureId', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).post('/relances/1');
    expect(res.status).toBe(401);
  });

  it('retourne 404 ou 403 si facture introuvable', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/relances/99999').set(bearer(token));
    expect([404, 403]).toContain(res.status);
  });
});

describe('GET /relances', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).get('/relances');
    expect(res.status).toBe(401);
  });

  it('retourne un tableau pour un utilisateur authentifie', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).get('/relances').set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// --- EXPERT-COMPTABLE ---

describe('POST /auth/invite-comptable', function() {
  it('retourne 401 sans token', async function() {
    var res = await request(app).post('/auth/invite-comptable').send({ siret: '12345678901234' });
    expect(res.status).toBe(401);
  });

  it('genere un token invitation pour un user authentifie', async function() {
    var token = makeToken({ siret: '12345678901234' });
    var res = await request(app).post('/auth/invite-comptable').set(bearer(token)).send({ siret: '12345678901234' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});

describe('POST /auth/login-comptable', function() {
  it('retourne 400 si token manquant', async function() {
    var res = await request(app).post('/auth/login-comptable').send({});
    expect(res.status).toBe(400);
  });

  it('retourne 401 ou 404 si token inconnu', async function() {
    var res = await request(app).post('/auth/login-comptable').send({ invite_token: 'token-inexistant' });
    expect([401, 404]).toContain(res.status);
  });
});

// --- ROLE COMPTABLE readOnly middleware ---

describe('Middleware readOnly (role comptable)', function() {
  it('POST /factures -> 403 pour un token role=comptable', async function() {
    var token = makeToken({ siret: '12345678901234', role: 'comptable' });
    var res = await request(app).post('/factures').set(bearer(token)).send({
      client_siret: '98765432109876', client_nom: 'Test', montant_ht: 100, tva: 20,
    });
    expect(res.status).toBe(403);
  });

  it('GET /factures -> 200 pour un token role=comptable (lecture autorisee)', async function() {
    var token = makeToken({ siret: '12345678901234', role: 'comptable' });
    var res = await request(app).get('/factures').set(bearer(token));
    expect(res.status).toBe(200);
  });
});
