const http = require('./http');

const PROD_API = 'https://api.piste.gouv.fr/cpro';
const PROD_OAUTH = 'https://oauth.piste.gouv.fr';
const SANDBOX_API = 'https://sandbox-api.piste.gouv.fr/cpro';
const SANDBOX_OAUTH = 'https://sandbox-oauth.piste.gouv.fr';

const CHORUS_ENDPOINTS = {
  oauthToken: '/api/oauth/token',
  // TODO: verify exact paths and payloads with official PISTE/Chorus Pro docs before production use.
  myStructures: '/structures/v1/rechercher',
  searchStructureBySiret: '/structures/v1/rechercher',
  getStructure: '/structures/v1/consulter',
  listServices: '/structures/v1/services/rechercher',
  uploadFile: '/transverses/v1/fichiers/upload',
  submitPdfInvoice: '/factures/v1/deposer/pdf',
  invoiceStatus: '/factures/v1/consulter',
};

let cachedToken = null;
let tokenExpiresAt = 0;

function boolEnv(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function config() {
  const env = String(process.env.CHORUS_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  return {
    env,
    apiBaseUrl: process.env.CHORUS_API_BASE_URL || (env === 'production' ? PROD_API : SANDBOX_API),
    oauthBaseUrl: process.env.CHORUS_OAUTH_BASE_URL || (env === 'production' ? PROD_OAUTH : SANDBOX_OAUTH),
    clientId: process.env.CHORUS_CLIENT_ID || '',
    clientSecret: process.env.CHORUS_CLIENT_SECRET || '',
    cproAccount: process.env.CHORUS_CPRO_ACCOUNT_BASE64 || '',
    timeoutMs: Number(process.env.CHORUS_TIMEOUT_MS || 20000),
    mockMode: boolEnv('CHORUS_MOCK'),
  };
}

function publicConfig() {
  const cfg = config();
  return {
    enabled: cfg.mockMode || Boolean(cfg.clientId && cfg.clientSecret && cfg.cproAccount),
    env: cfg.env,
    apiBaseUrl: cfg.apiBaseUrl.replace(/^https?:\/\//, ''),
    hasClientId: Boolean(cfg.clientId),
    hasClientSecret: Boolean(cfg.clientSecret),
    hasCproAccount: Boolean(cfg.cproAccount),
    mockMode: cfg.mockMode,
  };
}

function normalizeChorusError(error) {
  if (error?.isChorusError) return error;
  const status = error?.response?.status;
  const data = error?.response?.data || {};
  const codeRetour = data.codeRetour || data.code || (status ? String(status) : 'CHORUS_ERROR');
  const libelle = data.libelle || data.message || error?.message || 'Erreur Chorus Pro';
  let message = 'Connexion Chorus Pro impossible : verifiez les identifiants PISTE.';
  if (error?.name === 'AbortError' || /abort|timeout/i.test(String(error?.message))) message = 'Connexion Chorus Pro trop lente : delai depasse.';
  else if (status === 401) message = 'Connexion Chorus Pro impossible : verifiez les identifiants PISTE.';
  else if (status === 403) message = 'Compte technique Chorus Pro manquant ou incorrect.';
  else if (/structure/i.test(libelle) && /introuvable|not found|aucun/i.test(libelle)) message = 'Structure publique introuvable pour ce SIRET.';
  const normalized = new Error(message);
  normalized.isChorusError = true;
  normalized.status = status || 502;
  normalized.codeRetour = codeRetour;
  normalized.libelle = libelle;
  normalized.userMessage = message;
  return normalized;
}

function assertConfigured() {
  const cfg = config();
  if (cfg.mockMode) return cfg;
  if (!cfg.clientId || !cfg.clientSecret) {
    const err = new Error('Connexion Chorus Pro impossible : verifiez les identifiants PISTE.');
    err.status = 503;
    err.codeRetour = 'MISSING_OAUTH';
    throw err;
  }
  if (!cfg.cproAccount) {
    const err = new Error('Compte technique Chorus Pro manquant ou incorrect.');
    err.status = 503;
    err.codeRetour = 'MISSING_CPRO_ACCOUNT';
    throw err;
  }
  return cfg;
}

async function getOAuthToken() {
  const cfg = assertConfigured();
  if (cfg.mockMode) return 'mock-chorus-token';
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  try {
    const res = await http.post(`${cfg.oauthBaseUrl}${CHORUS_ENDPOINTS.oauthToken}`, new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: 'openid',
    }), { timeout: cfg.timeoutMs, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    cachedToken = res.data.access_token;
    tokenExpiresAt = Date.now() + Number(res.data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (err) {
    throw normalizeChorusError(err);
  }
}

function assertChorusBody(data) {
  const code = data?.codeRetour;
  if (code !== undefined && !['0', 0, 'OK', 'SUCCESS'].includes(code)) {
    const err = new Error(data?.libelle || 'Erreur Chorus Pro');
    err.isChorusError = true;
    err.status = 502;
    err.codeRetour = String(code);
    err.libelle = data?.libelle || 'Erreur Chorus Pro';
    err.userMessage = err.libelle;
    throw err;
  }
}

async function chorusRequest(path, body = {}, options = {}) {
  const cfg = assertConfigured();
  if (cfg.mockMode) return mockResponse(path, body);
  const token = await getOAuthToken();
  try {
    const res = await http.post(`${cfg.apiBaseUrl}${path}`, body, {
      timeout: cfg.timeoutMs,
      headers: {
        Authorization: `Bearer ${token}`,
        'cpro-account': cfg.cproAccount,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    assertChorusBody(res.data);
    return res.data;
  } catch (err) {
    throw normalizeChorusError(err);
  }
}

function mockResponse(path, body) {
  if (path === CHORUS_ENDPOINTS.searchStructureBySiret) {
    return { codeRetour: 0, structures: [{ idStructure: `MOCK-${body.siret}`, siret: body.siret, designation: 'Structure publique de test', statut: 'ACTIVE' }] };
  }
  if (path === CHORUS_ENDPOINTS.listServices) {
    return { codeRetour: 0, services: [{ codeService: 'FACTURES', libelleService: 'Service factures', actif: true }, { codeService: 'COMPTA', libelleService: 'Comptabilite', actif: true }] };
  }
  if (path === CHORUS_ENDPOINTS.uploadFile) return { codeRetour: 0, fileId: `MOCK-FILE-${Date.now()}` };
  if (path === CHORUS_ENDPOINTS.submitPdfInvoice) return { codeRetour: 0, chorusInvoiceId: `MOCK-INV-${Date.now()}`, statut: 'SUBMITTED' };
  return { codeRetour: 0, ok: true, mock: true };
}

async function healthcheck() {
  const cfg = config();
  if (cfg.mockMode) return { ok: true, mock: true, env: cfg.env };
  await getMyStructures();
  return { ok: true, mock: false, env: cfg.env };
}

const getMyStructures = () => chorusRequest(CHORUS_ENDPOINTS.myStructures, {});
const searchStructureBySiret = (siret) => chorusRequest(CHORUS_ENDPOINTS.searchStructureBySiret, { siret });
const getStructure = (idStructure) => chorusRequest(CHORUS_ENDPOINTS.getStructure, { idStructure });
const listServices = (idStructure) => chorusRequest(CHORUS_ENDPOINTS.listServices, { idStructure });
const uploadFile = ({ filename, mimeType, base64Content }) => chorusRequest(CHORUS_ENDPOINTS.uploadFile, { filename, mimeType, base64Content });
const submitPdfInvoice = ({ invoiceId, recipientSiret, serviceCode, engagementNumber, pdfBase64, chorusFileId }) =>
  chorusRequest(CHORUS_ENDPOINTS.submitPdfInvoice, { invoiceId, recipientSiret, serviceCode, engagementNumber, pdfBase64, chorusFileId });
const createAndSubmitInvoiceApi = () => {
  const err = new Error('Mapping facture vers payload Chorus non finalise.');
  err.status = 501;
  err.codeRetour = 'MAPPING_NOT_IMPLEMENTED';
  throw err;
};

module.exports = {
  CHORUS_ENDPOINTS,
  config,
  publicConfig,
  normalizeChorusError,
  getOAuthToken,
  chorusRequest,
  healthcheck,
  getMyStructures,
  searchStructureBySiret,
  getStructure,
  listServices,
  uploadFile,
  submitPdfInvoice,
  createAndSubmitInvoiceApi,
};
