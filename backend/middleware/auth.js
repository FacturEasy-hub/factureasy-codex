const jwt = require('jsonwebtoken');
const { DEFAULT_JWT_SECRET, assertStrongSecret } = require('../utils/security');

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
assertStrongSecret('JWT_SECRET', JWT_SECRET, DEFAULT_JWT_SECRET);
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
    issuer: 'factureasy-api',
    audience: 'factureasy-app',
  });
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx > -1) acc[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function getRequestToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  return parseCookies(req).fe_token || null;
}

function requireAdmin(req, res, next) {
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'factureasy-api', audience: 'factureasy-app' });
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Acces reserve aux administrateurs' });
    req.user = decoded;
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
}

function authenticate(req, res, next) {
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant ou mal forme' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { issuer: 'factureasy-api', audience: 'factureasy-app' });
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expire - reconnectez-vous' });
    return res.status(401).json({ error: 'Token invalide' });
  }
}

function optionalAuth(req, res, next) {
  const token = getRequestToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET, { issuer: 'factureasy-api', audience: 'factureasy-app' });
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

function ownResource(siretField = 'siret') {
  return (req, res, next) => {
    const siret = req.params[siretField] || req.query[siretField] || req.body[siretField];
    if (req.user && siret && req.user.siret !== siret) return res.status(403).json({ error: 'Acces interdit a cette ressource' });
    next();
  };
}

module.exports = { generateToken, authenticate, optionalAuth, ownResource, requireAdmin, getRequestToken };
