const crypto = require('crypto');

const DEFAULT_JWT_SECRET = 'factureasy-dev-secret-change-in-prod';
const DEFAULT_ADMIN_SECRET = 'factureasy-admin-change-in-prod';

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function assertStrongSecret(name, value, defaultValue) {
  if (!value || value === defaultValue || String(value).length < 32) {
    if (isProd()) {
      throw new Error(`${name} manquant, trop court ou valeur par défaut en production`);
    }
  }
}

function validateSiret(siret) {
  return typeof siret === 'string' && /^\d{14}$/.test(siret);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

function sanitizeText(value, max = 255) {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, max);
}

function parsePositiveAmount(value, fieldName = 'montant') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 999999999) {
    const err = new Error(`${fieldName} invalide`);
    err.status = 400;
    throw err;
  }
  return Math.round(n * 100) / 100;
}

function parseTva(value = 20) {
  const n = Number(value);
  const allowed = [0, 2.1, 5.5, 10, 20];
  if (!Number.isFinite(n) || !allowed.includes(n)) {
    const err = new Error('Taux de TVA invalide');
    err.status = 400;
    throw err;
  }
  return n;
}

const HASH_ALGO = 'sha256';
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = 'hex';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_ALGO).toString(HASH_DIGEST);
  return `pbkdf2_${HASH_ALGO}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith(`pbkdf2_${HASH_ALGO}$`)) return false;
  const [, iterationsStr, salt, expected] = stored.split('$');
  const iterations = Number(iterationsStr);
  if (!iterations || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, HASH_KEYLEN, HASH_ALGO).toString(HASH_DIGEST);
  return crypto.timingSafeEqual(Buffer.from(hash, HASH_DIGEST), Buffer.from(expected, HASH_DIGEST));
}

function safeError(err) {
  return { status: err.status || 500, message: err.status ? err.message : 'Erreur serveur' };
}

module.exports = {
  DEFAULT_JWT_SECRET,
  DEFAULT_ADMIN_SECRET,
  assertStrongSecret,
  validateSiret,
  normalizeEmail,
  validateEmail,
  validatePassword,
  sanitizeText,
  parsePositiveAmount,
  parseTva,
  hashPassword,
  verifyPassword,
  safeError,
};
