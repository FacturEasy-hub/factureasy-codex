const fs = require('fs');

function loadEnvFile(file = '.env') {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}

loadEnvFile();

// ─── Validation des secrets au démarrage ────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'factureasy-dev-secret-change-in-prod') {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET non défini ou valeur par défaut en production. Arrêt.');
    process.exit(1);
  }
}

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const pool       = require('./db');
const {
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
} = require('./utils/security');

const CLIENT_TYPES = new Set(['B2B_FR', 'B2G_PUBLIC', 'B2C', 'EXPORT']);
const CHANNEL_BY_CLIENT_TYPE = {
  B2G_PUBLIC: 'B2G_CHORUS_PRO',
  B2C: 'B2C_E_REPORTING',
  EXPORT: 'EXPORT_E_REPORTING',
  B2B_FR: 'B2B_FR_E_INVOICING',
};
const TVA_REGIMES = new Set(['franchise', 'reel_simplifie', 'reel_normal', 'non_assujetti']);
const ACTIVITY_TYPES = new Set(['services', 'commerce', 'btp_leger', 'profession_liberale', 'autre']);

function normalizeClientType(value) {
  const type = String(value || 'B2B_FR').toUpperCase();
  return CLIENT_TYPES.has(type) ? type : 'B2B_FR';
}

function channelForClientType(type) {
  return CHANNEL_BY_CLIENT_TYPE[normalizeClientType(type)] || 'B2B_FR_E_INVOICING';
}

function normalizeFromSet(value, allowed, fallback) {
  const clean = String(value || fallback).toLowerCase();
  return allowed.has(clean) ? clean : fallback;
}

// ─── Numérotation séquentielle des factures ──────────────────────────────────
// Garantit une séquence chronologique sans rupture par SIRET (obligation légale)
async function nextNumeroFacture(siret) {
  const year = new Date().getFullYear();
  const prefix = `FE-${year}`;

  // Upsert atomique sur la séquence du SIRET pour l'année courante
  const { rows } = await pool.query(`
    INSERT INTO invoice_sequences (siret, year, last_seq)
    VALUES ($1, $2, 1)
    ON CONFLICT (siret, year)
    DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
    RETURNING last_seq
  `, [siret, year]);

  const seq = String(rows[0].last_seq).padStart(4, '0');
  return `${prefix}-${seq}`;
}

const { generateToken, authenticate, requireAdmin } = require('./middleware/auth');
const { router: comptableRouter, readOnly } = require('./routes/comptable');
const chorusRoutes = require('./routes/chorus');
const chorusClient = require('./services/chorusClient');
const ADMIN_SECRET = process.env.ADMIN_SECRET || DEFAULT_ADMIN_SECRET;
assertStrongSecret('ADMIN_SECRET', ADMIN_SECRET, DEFAULT_ADMIN_SECRET);

const app = express();
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie('fe_token', token, authCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie('fe_token', { ...authCookieOptions(), maxAge: undefined });
}

// Headers de sécurité minimum même si helmet n'est pas installé
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ─── Sécurité : helmet ─────────────────────────────────────────────────────────
try {
  const helmet = require('helmet');
  // CSP désactivée sur /backoffice (panel admin avec scripts inline)
  const relaxedHelmet = helmet({ contentSecurityPolicy: false });
  const strictHelmet = helmet();
  app.use('/backoffice', relaxedHelmet);
  app.use((req, res, next) => {
    if (req.path.startsWith('/backoffice')) return next();
    return strictHelmet(req, res, next);
  });
} catch (_) { /* helmet optionnel — npm install helmet */ }

// ─── Rate limiting sur /auth/* ─────────────────────────────────────────────────
try {
  const rateLimit = require('express-rate-limit');
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
    message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' } });
  app.use('/auth', authLimiter);
} catch (_) { /* express-rate-limit optionnel — npm install express-rate-limit */ }

// ─── CORS restreint aux origines autorisées ────────────────────────────────────
const DEFAULT_ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? 'https://factureasy-codex.vercel.app,https://factureasy-codex.onrender.com'
  : 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    cb(new Error('Origin non autorisée par CORS : ' + origin));
  },
  credentials: true,
}));

const stripeRoutes = require('./routes/stripe');
// ⚠️  /stripe/webhook doit être monté AVANT express.json()
// car il a besoin du body brut pour vérifier la signature Stripe
app.use('/stripe/webhook', stripeRoutes.webhookRouter);

app.use(express.json());
app.use('/stripe', stripeRoutes);
app.use('/api/chorus', chorusRoutes);

// ─── Initialisation DB (admin uniquement) ────────────────────────────────────
app.get('/init-db', requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entreprises (
        id                     SERIAL PRIMARY KEY,
        siret                  VARCHAR(14) UNIQUE NOT NULL,
        nom                    VARCHAR(255) NOT NULL,
        email                  VARCHAR(255),
        password_hash          TEXT,
        -- Stripe
        stripe_customer_id     VARCHAR(100),
        stripe_subscription_id VARCHAR(100),
        plan                   VARCHAR(50) DEFAULT 'gratuit',
        trial_ends_at          TIMESTAMPTZ,
        contact_nom            VARCHAR(255),
        contact_telephone      VARCHAR(50),
        adresse                TEXT,
        tva_regime             VARCHAR(50) DEFAULT 'reel_normal',
        activite_type          VARCHAR(50) DEFAULT 'services',
        domaine                VARCHAR(255),
        kbis_url               TEXT,
        notes_admin            TEXT,
        updated_at             TIMESTAMP DEFAULT NOW(),
        created_at             TIMESTAMP DEFAULT NOW()
      );

      -- Migration idempotente : ajouter les colonnes Stripe si elles n'existent pas déjà
      DO $$ BEGIN
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS password_hash          TEXT;
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(100);
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS plan                   VARCHAR(50) DEFAULT 'gratuit';
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ;
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS contact_nom            VARCHAR(255);
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS contact_telephone      VARCHAR(50);
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS adresse                TEXT;
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS tva_regime             VARCHAR(50) DEFAULT 'reel_normal';
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS activite_type          VARCHAR(50) DEFAULT 'services';
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS domaine                VARCHAR(255);
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS kbis_url               TEXT;
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS notes_admin            TEXT;
        ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMP DEFAULT NOW();
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS factures (
        id                    SERIAL PRIMARY KEY,
        numero                VARCHAR(50) UNIQUE NOT NULL,
        emetteur_siret        VARCHAR(14) NOT NULL,
        client_siret          VARCHAR(14) NOT NULL,
        client_nom            VARCHAR(255) NOT NULL,
        description           TEXT,
        montant_ht            NUMERIC(12,2) NOT NULL,
        tva                   NUMERIC(5,2) DEFAULT 20,
        montant_ttc           NUMERIC(12,2) NOT NULL,
        statut                VARCHAR(50) DEFAULT 'EMISE',
        chorus_id             VARCHAR(100),
        channel               VARCHAR(40) DEFAULT 'MANUAL',
        chorus_status         VARCHAR(40),
        chorus_transmission_id INTEGER,
        recipient_type        VARCHAR(40) DEFAULT 'PRIVATE_COMPANY',
        type_document         VARCHAR(10) DEFAULT 'FAC',
        avoir_de_facture_id   INTEGER REFERENCES factures(id),
        date_emission         TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
      );

      -- Colonnes optionnelles ajoutées en migration (idempotentes)
      DO $$ BEGIN
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS type_document VARCHAR(10) DEFAULT 'FAC';
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS avoir_de_facture_id INTEGER REFERENCES factures(id);
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS channel VARCHAR(40) DEFAULT 'MANUAL';
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS chorus_status VARCHAR(40);
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS chorus_transmission_id INTEGER;
        ALTER TABLE factures ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(40) DEFAULT 'PRIVATE_COMPANY';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;

      -- Séquences de numérotation légale par SIRET et année
      CREATE TABLE IF NOT EXISTS invoice_sequences (
        siret    VARCHAR(14) NOT NULL,
        year     INTEGER     NOT NULL,
        last_seq INTEGER     DEFAULT 0,
        PRIMARY KEY (siret, year)
      );

      CREATE INDEX IF NOT EXISTS idx_factures_siret  ON factures(emetteur_siret);
      CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut);
      CREATE INDEX IF NOT EXISTS idx_factures_channel ON factures(channel);

      CREATE TABLE IF NOT EXISTS auth_otps (
        id            SERIAL PRIMARY KEY,
        siret         VARCHAR(14) NOT NULL,
        email         VARCHAR(255) NOT NULL,
        code_hash     TEXT NOT NULL,
        expires_at    TIMESTAMPTZ NOT NULL,
        used_at       TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_otps_lookup ON auth_otps(siret, email, expires_at);

      CREATE TABLE IF NOT EXISTS clients (
        id            SERIAL PRIMARY KEY,
        siret         VARCHAR(14) NOT NULL,
        nom           VARCHAR(255) NOT NULL,
        siret_client  VARCHAR(14),
        email         VARCHAR(255),
        telephone     VARCHAR(50),
        adresse       TEXT,
        client_type   VARCHAR(30) DEFAULT 'B2B_FR',
        regulatory_channel VARCHAR(40) DEFAULT 'B2B_FR_E_INVOICING',
        chorus_service_code VARCHAR(100),
        chorus_engagement_required BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_clients_siret ON clients(siret);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(30) DEFAULT 'B2B_FR';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS regulatory_channel VARCHAR(40) DEFAULT 'B2B_FR_E_INVOICING';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS chorus_service_code VARCHAR(100);
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS chorus_engagement_required BOOLEAN DEFAULT FALSE;

      -- ── Catalogue produits/services ────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS catalogue (
        id              SERIAL PRIMARY KEY,
        siret           VARCHAR(14)   NOT NULL,
        reference       VARCHAR(100),
        nom             VARCHAR(255)  NOT NULL,
        description     TEXT,
        prix_ht         NUMERIC(12,2) NOT NULL DEFAULT 0,
        tva_taux        NUMERIC(5,2)  NOT NULL DEFAULT 20,
        unite           VARCHAR(50)   DEFAULT 'unité',
        code_comptable  VARCHAR(50),
        actif           BOOLEAN       DEFAULT TRUE,
        created_at      TIMESTAMPTZ   DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_catalogue_siret ON catalogue(siret);

      -- ── Devis ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS devis_sequences (
        siret    VARCHAR(14) NOT NULL,
        year     INTEGER     NOT NULL,
        last_seq INTEGER     DEFAULT 0,
        PRIMARY KEY (siret, year)
      );
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
      CREATE INDEX IF NOT EXISTS idx_devis_lignes ON devis_lignes(devis_id);

      CREATE TABLE IF NOT EXISTS regulatory_events (
        id              SERIAL PRIMARY KEY,
        entreprise_id   INTEGER,
        siret           VARCHAR(14) NOT NULL,
        invoice_id      INTEGER,
        transaction_id  INTEGER,
        channel         VARCHAR(40) NOT NULL,
        status          VARCHAR(30) NOT NULL DEFAULT 'PREPARED',
        payload_json    JSONB,
        response_json   JSONB,
        error_message   TEXT,
        next_retry_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reg_events_siret      ON regulatory_events(siret);
      CREATE INDEX IF NOT EXISTS idx_reg_events_invoice    ON regulatory_events(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_reg_events_status     ON regulatory_events(status);
      CREATE INDEX IF NOT EXISTS idx_reg_events_created_at ON regulatory_events(created_at);

      CREATE TABLE IF NOT EXISTS chorus_transmissions (
        id                     SERIAL PRIMARY KEY,
        entreprise_id          INTEGER,
        invoice_id             INTEGER,
        transmission_type      TEXT NOT NULL DEFAULT 'B2G_CHORUS',
        environment            TEXT NOT NULL DEFAULT 'sandbox',
        recipient_siret        TEXT,
        recipient_structure_id TEXT,
        service_code           TEXT,
        engagement_number      TEXT,
        status                 TEXT NOT NULL DEFAULT 'draft',
        chorus_invoice_id      TEXT,
        chorus_file_id         TEXT,
        request_payload        JSONB,
        response_payload       JSONB,
        error_code             TEXT,
        error_message          TEXT,
        last_attempt_at        TIMESTAMPTZ,
        submitted_at           TIMESTAMPTZ,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chorus_transmissions_entreprise ON chorus_transmissions(entreprise_id);
      CREATE INDEX IF NOT EXISTS idx_chorus_transmissions_invoice    ON chorus_transmissions(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_chorus_transmissions_status     ON chorus_transmissions(status);
      CREATE INDEX IF NOT EXISTS idx_chorus_transmissions_siret      ON chorus_transmissions(recipient_siret);
      CREATE INDEX IF NOT EXISTS idx_chorus_transmissions_created    ON chorus_transmissions(created_at);

      CREATE TABLE IF NOT EXISTS chorus_recipient_cache (
        id             SERIAL PRIMARY KEY,
        entreprise_id  INTEGER,
        siret          TEXT NOT NULL,
        id_structure   TEXT,
        designation    TEXT,
        statut         TEXT,
        raw_response   JSONB,
        checked_at     TIMESTAMPTZ DEFAULT NOW(),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entreprise_id, siret)
      );

      CREATE TABLE IF NOT EXISTS chorus_services_cache (
        id              SERIAL PRIMARY KEY,
        entreprise_id   INTEGER,
        siret           TEXT,
        id_structure    TEXT,
        code_service    TEXT,
        libelle_service TEXT,
        actif           BOOLEAN,
        raw_response    JSONB,
        checked_at      TIMESTAMPTZ DEFAULT NOW(),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.json({ ok: true, message: 'Schéma initialisé' });
  } catch (err) {
    console.error('[init-db]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Authentification ────────────────────────────────────────────────────────

// POST /auth/login — crée ou récupère une entreprise et retourne un JWT
app.post('/auth/login', async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    const nom = sanitizeText(req.body.nom, 255);
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!validateSiret(siret)) return res.status(400).json({ error: 'SIRET invalide — 14 chiffres attendus' });
    if (!nom) return res.status(400).json({ error: 'Nom ou raison sociale requis' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Email professionnel valide requis' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Mot de passe requis — 8 caractères minimum' });

    const existing = await pool.query('SELECT * FROM entreprises WHERE siret = $1', [siret]);
    let entreprise;

    if (!existing.rows[0]) {
      const passwordHash = hashPassword(password);
      const created = await pool.query(
        `INSERT INTO entreprises (siret, nom, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, siret, nom, email, plan, trial_ends_at, stripe_customer_id, created_at`,
        [siret, nom, email, passwordHash]
      );
      entreprise = created.rows[0];
    } else {
      const row = existing.rows[0];
      if (!row.password_hash || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({ error: 'Identifiants invalides' });
      }
      const updated = await pool.query(
        `UPDATE entreprises SET nom = $2, email = COALESCE($3, email), updated_at = NOW()
         WHERE siret = $1
         RETURNING id, siret, nom, email, plan, trial_ends_at, stripe_customer_id, created_at`,
        [siret, nom, email]
      );
      entreprise = updated.rows[0];
    }

    const token = generateToken({ siret: entreprise.siret, nom: entreprise.nom, id: entreprise.id, email: entreprise.email, role: 'user' });
    setAuthCookie(res, token);
    res.json({ token, entreprise });
  } catch (err) {
    const safe = safeError(err);
    console.error('[auth/login]', err.message);
    res.status(safe.status).json({ error: safe.message });
  }
});

// ─── Auth : profil courant ────────────────────────────────────────────────────

// GET /auth/me — retourne l'entreprise connectée (plan, trial_ends_at, etc.)
app.post('/auth/request-otp', async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    const email = normalizeEmail(req.body.email);
    if (!validateSiret(siret)) return res.status(400).json({ error: 'SIRET invalide — 14 chiffres attendus' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Email professionnel valide requis' });
    const { rows } = await pool.query('SELECT id, siret, nom, email FROM entreprises WHERE siret = $1 AND email = $2', [siret, email]);
    if (!rows[0]) return res.status(404).json({ error: 'Aucun compte trouvé pour ce SIRET et cet email' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query(
      `INSERT INTO auth_otps (siret, email, code_hash, expires_at)
       VALUES ($1,$2,$3,NOW() + INTERVAL '10 minutes')`,
      [siret, email, hashPassword(code)]
    );
    await require('./services/mailer').sendOtp(email, { code });
    res.json({ ok: true, message: 'Code envoyé par email' });
  } catch (err) {
    const safe = safeError(err);
    console.error('[auth/request-otp]', err.message, err.detail ? String(err.detail).slice(0, 200) : '');
    res.status(safe.status).json({ error: safe.message });
  }
});

app.post('/auth/verify-otp', async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    const email = normalizeEmail(req.body.email);
    const code = sanitizeText(req.body.code, 12);
    if (!validateSiret(siret) || !validateEmail(email) || !/^\d{6}$/.test(code || '')) {
      return res.status(400).json({ error: 'Code, SIRET ou email invalide' });
    }
    const otp = await pool.query(
      `SELECT * FROM auth_otps
       WHERE siret = $1 AND email = $2 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [siret, email]
    );
    if (!otp.rows[0] || !verifyPassword(code, otp.rows[0].code_hash)) {
      return res.status(401).json({ error: 'Code invalide ou expiré' });
    }
    await pool.query('UPDATE auth_otps SET used_at = NOW() WHERE id = $1', [otp.rows[0].id]);
    const { rows } = await pool.query(
      `SELECT id, siret, nom, email, plan, trial_ends_at, stripe_customer_id, created_at
       FROM entreprises WHERE siret = $1 AND email = $2`,
      [siret, email]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    const entreprise = rows[0];
    const token = generateToken({ siret: entreprise.siret, nom: entreprise.nom, id: entreprise.id, email: entreprise.email, role: 'user' });
    setAuthCookie(res, token);
    res.json({ token, entreprise });
  } catch (err) {
    const safe = safeError(err);
    console.error('[auth/verify-otp]', err.message);
    res.status(safe.status).json({ error: safe.message });
  }
});

app.get('/auth/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, siret, nom, email, contact_telephone AS telephone, adresse, tva_regime, activite_type, plan, trial_ends_at, stripe_customer_id, created_at
       FROM entreprises WHERE siret = $1`,
      [req.user.siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /auth/me]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ─── Entreprises ─────────────────────────────────────────────────────────────

app.post('/entreprises', authenticate, async (req, res) => {
  try {
    const siret = sanitizeText(req.body.siret, 14);
    const nom = sanitizeText(req.body.nom, 255);
    const email = normalizeEmail(req.body.email);
    if (req.user.role !== 'admin' && siret !== req.user.siret) return res.status(403).json({ error: 'Accès interdit à cette entreprise' });
    if (!validateSiret(siret) || !nom) return res.status(400).json({ error: 'SIRET et nom valides requis' });
    if (email && !validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    const telephone = sanitizeText(req.body.telephone || '', 50);
    const adresse = sanitizeText(req.body.adresse || '', 1000);
    const tvaRegime = normalizeFromSet(req.body.tva_regime, TVA_REGIMES, 'reel_normal');
    const activiteType = normalizeFromSet(req.body.activite_type, ACTIVITY_TYPES, 'services');
    const { rows } = await pool.query(
      `UPDATE entreprises
       SET nom=$2, email=COALESCE($3, email), contact_telephone=$4, adresse=$5,
           tva_regime=$6, activite_type=$7, updated_at=NOW()
       WHERE siret=$1
       RETURNING id, siret, nom, email, contact_telephone AS telephone, adresse, tva_regime, activite_type, plan, trial_ends_at, stripe_customer_id, created_at`,
      [siret, nom, email || null, telephone || null, adresse || null, tvaRegime, activiteType]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(rows[0]);
  } catch (err) {
    const safe = safeError(err);
    console.error('[POST /entreprises]', err.message);
    res.status(safe.status).json({ error: safe.message });
  }
});

app.get('/entreprises/:siret', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.params.siret !== req.user.siret) {
      return res.status(403).json({ error: 'Accès interdit à cette entreprise' });
    }
    const { rows } = await pool.query(
      'SELECT id, siret, nom, email, contact_telephone AS telephone, adresse, tva_regime, activite_type, plan, trial_ends_at, stripe_customer_id, created_at FROM entreprises WHERE siret = $1',
      [req.params.siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /entreprises]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloque les mutations pour les accès expert-comptable en lecture seule
// Clients de l'entreprise connectee
app.get('/clients', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nom, siret_client, email, telephone, adresse, client_type, regulatory_channel, chorus_service_code, chorus_engagement_required, created_at, updated_at
       FROM clients WHERE siret = $1 ORDER BY nom ASC`,
      [req.user.siret]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /clients]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/clients', authenticate, readOnly, async (req, res) => {
  try {
    const nom = sanitizeText(req.body.nom, 255);
    const siretClient = sanitizeText(req.body.siret_client || '', 14);
    const email = normalizeEmail(req.body.email || '');
    const telephone = sanitizeText(req.body.telephone || '', 50);
    const adresse = sanitizeText(req.body.adresse || '', 1000);
    const clientType = normalizeClientType(req.body.client_type);
    const regulatoryChannel = channelForClientType(clientType);
    const chorusServiceCode = sanitizeText(req.body.chorus_service_code || '', 100);
    const chorusEngagementRequired = Boolean(req.body.chorus_engagement_required);

    if (!nom) return res.status(400).json({ error: 'Nom client requis' });
    if (siretClient && !validateSiret(siretClient)) return res.status(400).json({ error: 'SIRET client invalide' });
    if (email && !validateEmail(email)) return res.status(400).json({ error: 'Email client invalide' });

    const { rows } = await pool.query(
      `INSERT INTO clients (siret, nom, siret_client, email, telephone, adresse, client_type, regulatory_channel, chorus_service_code, chorus_engagement_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, nom, siret_client, email, telephone, adresse, client_type, regulatory_channel, chorus_service_code, chorus_engagement_required, created_at, updated_at`,
      [req.user.siret, nom, siretClient || null, email || null, telephone || null, adresse || null, clientType, regulatoryChannel, chorusServiceCode || null, chorusEngagementRequired]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    const safe = safeError(err);
    console.error('[POST /clients]', err.message);
    res.status(safe.status).json({ error: safe.message });
  }
});

app.put('/clients/:id(\\d+)', authenticate, readOnly, async (req, res) => {
  try {
    const clientType = normalizeClientType(req.body.client_type);
    const regulatoryChannel = channelForClientType(clientType);
    const chorusServiceCode = sanitizeText(req.body.chorus_service_code || '', 100);
    const chorusEngagementRequired = Boolean(req.body.chorus_engagement_required);
    const { rows } = await pool.query(
      `UPDATE clients
       SET client_type = $1, regulatory_channel = $2, chorus_service_code = $3,
           chorus_engagement_required = $4, updated_at = NOW()
       WHERE id = $5 AND siret = $6
       RETURNING id, nom, siret_client, email, telephone, adresse, client_type, regulatory_channel, chorus_service_code, chorus_engagement_required, created_at, updated_at`,
      [clientType, regulatoryChannel, chorusServiceCode || null, chorusEngagementRequired, req.params.id, req.user.siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client introuvable' });
    res.json(rows[0]);
  } catch (err) {
    const safe = safeError(err);
    console.error('[PUT /clients/:id]', err.message);
    res.status(safe.status).json({ error: safe.message });
  }
});

app.use(['/factures', '/finances', '/stats', '/relances', '/catalogue', '/devis'], authenticate, readOnly);

// ─── Factures ────────────────────────────────────────────────────────────────

app.get('/factures', authenticate, async (req, res) => {
  try {
    // IDOR fix: siret forcé depuis le JWT, le query param est ignoré
    const siret = req.user.siret;
    const { statut } = req.query;
    let query = 'SELECT * FROM factures WHERE emetteur_siret = $1';
    const params = [siret];
    if (statut) { query += ' AND statut = $2'; params.push(statut); }
    query += ' ORDER BY date_emission DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[GET /factures]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/factures/:id(\\d+)', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM factures WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Facture introuvable' });
    // IDOR fix: vérifier que la facture appartient à l'entreprise connectée
    if (rows[0].emetteur_siret !== req.user.siret) {
      return res.status(403).json({ error: 'Accès interdit à cette facture' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /factures/:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function regulatoryChannelForInvoice(emetteurSiret, clientSiret, clientNom) {
  if (!clientSiret) return 'B2C_E_REPORTING';
  const { rows } = await pool.query(
    `SELECT regulatory_channel FROM clients
     WHERE siret = $1 AND (siret_client = $2 OR LOWER(nom) = LOWER($3))
     ORDER BY CASE WHEN siret_client = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [emetteurSiret, clientSiret, clientNom || '']
  );
  return rows[0]?.regulatory_channel || 'B2B_FR_E_INVOICING';
}

app.post('/factures', authenticate, async (req, res) => {
  try {
    const client_siret = sanitizeText(req.body.client_siret, 14);
    const client_nom = sanitizeText(req.body.client_nom, 255);
    const description = sanitizeText(req.body.description, 1000);
    const numero_engagement = sanitizeText(req.body.numero_engagement, 100);
    const montant_ht = parsePositiveAmount(req.body.montant_ht, 'montant_ht');
    const tva = parseTva(req.body.tva === undefined ? 20 : req.body.tva);
    const emetteur_siret = req.user.siret;
    if (!validateSiret(client_siret) || !client_nom) {
      return res.status(400).json({ error: 'Champs requis : client_siret valide, client_nom, montant_ht' });
    }

    const montant_ttc = parseFloat((montant_ht * (1 + tva / 100)).toFixed(2));
    const montant_tva = parseFloat((montant_ht * tva / 100).toFixed(2));
    const numero = await nextNumeroFacture(emetteur_siret);
    const date_emission = new Date().toISOString().split('T')[0];
    const regulatoryChannel = await regulatoryChannelForInvoice(emetteur_siret, client_siret, client_nom);
    const channel = regulatoryChannel === 'B2G_CHORUS_PRO' ? 'B2G_CHORUS' : regulatoryChannel;
    const recipientType = regulatoryChannel === 'B2G_CHORUS_PRO' ? 'PUBLIC' : 'PRIVATE_COMPANY';

    const { rows } = await pool.query(
      `INSERT INTO factures
        (numero, emetteur_siret, client_siret, client_nom, description, montant_ht, tva, montant_ttc, statut, chorus_id, channel, chorus_status, recipient_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'BROUILLON',NULL,$9,NULL,$10) RETURNING *`,
      [numero, emetteur_siret, client_siret, client_nom, description, montant_ht, tva, montant_ttc, channel, recipientType]
    );
    await pool.query(
      `INSERT INTO regulatory_events (siret, invoice_id, channel, status, payload_json)
       VALUES ($1,$2,$3,'PREPARED',$4)`,
      [emetteur_siret, rows[0].id, regulatoryChannel, { client_siret, montant_ht, tva, numero_engagement, date_emission, montant_tva }]
    ).catch(() => {});
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    const detail = err.response?.data || err.message;
    console.error('[POST /factures]', detail);
    res.status(500).json({ error: 'Erreur creation facture' });
  }
});
app.patch('/factures/:id(\\d+)/statut', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM factures WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Facture introuvable' });
    if (rows[0].emetteur_siret !== req.user.siret) {
      return res.status(403).json({ error: 'Acces interdit a cette facture' });
    }
    res.json({ ...rows[0], chorus_status: rows[0].chorus_id ? 'submitted_legacy' : 'local_only' });
  } catch (err) {
    console.error('[PATCH /factures/:id/statut]', err.message);
    res.status(500).json({ error: 'Impossible de recuperer le statut local' });
  }
});
// Statistiques ────────────────────────────────────────────────────────────

app.get('/regulatory-events', authenticate, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
    const { rows } = await pool.query(
      `SELECT id, invoice_id, transaction_id, channel, status, error_message, created_at, updated_at
       FROM regulatory_events
       WHERE siret = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.siret, limit]
    );
    res.json(rows);
  } catch (err) {
    if (err.code === '42P01') return res.json([]);
    console.error('[GET /regulatory-events]', err.message);
    res.status(500).json({ error: 'Impossible de charger les événements réglementaires' });
  }
});

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

app.get('/exports/factures.csv', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT numero, date_emission, client_nom, client_siret, montant_ht, tva, montant_ttc, statut, type_document
       FROM factures
       WHERE emetteur_siret = $1
       ORDER BY date_emission DESC`,
      [req.user.siret]
    );
    const header = ['numero','date_emission','client_nom','client_siret','montant_ht','tva','montant_ttc','statut','type_document'];
    const body = rows.map((row) => header.map((key) => csvCell(row[key])).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="factures.csv"');
    res.send([header.join(';'), ...body].join('\n'));
  } catch (err) {
    console.error('[GET /exports/factures.csv]', err.message);
    res.status(500).json({ error: 'Export factures indisponible' });
  }
});

app.get('/stats/:siret', authenticate, async (req, res) => {
  try {
    // IDOR fix: un utilisateur ne peut consulter que ses propres stats
    if (req.params.siret !== req.user.siret) {
      return res.status(403).json({ error: 'Accès interdit à ces statistiques' });
    }
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                          AS total_factures,
        COALESCE(SUM(montant_ttc), 0)                    AS ca_ttc,
        COALESCE(SUM(montant_ht), 0)                     AS ca_ht,
        COUNT(*) FILTER (WHERE statut = 'EMISE')         AS en_attente,
        COUNT(*) FILTER (WHERE statut = 'ACCEPTEE')      AS acceptees,
        COUNT(*) FILTER (WHERE statut = 'REJETEE')       AS rejetees,
        COALESCE(AVG(montant_ht), 0)                     AS panier_moyen_ht
      FROM factures WHERE emetteur_siret = $1
    `, [req.params.siret]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /stats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Login Admin ─────────────────────────────────────────────────────────────

// POST /auth/admin — authentification administrateur
// Body: { secret: "ADMIN_SECRET" }
app.post('/auth/admin', (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Secret administrateur invalide' });
  }
  const token = generateToken({ role: 'admin', email: 'admin@factureasy.fr' });
  setAuthCookie(res, token);
  res.json({ token, role: 'admin' });
});

// ─── Routes Admin ─────────────────────────────────────────────────────────────

app.use('/admin', require('./routes/admin'));

// ─── Routes Finances ─────────────────────────────────────────────────────────

app.use('/finances', require('./routes/finances'));

// ─── Route SIRENE — autocomplétion entreprise ─────────────────────────────────

app.use('/sirene', require('./routes/sirene'));

// ─── Routes Avoirs — notes de crédit ─────────────────────────────────────────
// Montées sous /factures/:id/avoir via mergeParams

const avoirsRouter = require('./routes/avoirs');
app.use('/factures/:id/avoir', avoirsRouter);

// ─── Routes Relances ─────────────────────────────────────────────────────────

app.use('/relances', require('./routes/relances'));

// ─── Routes Factures Récurrentes ─────────────────────────────────────────────

app.use('/factures/recurrentes', require('./routes/recurrentes'));

// ─── Routes Catalogue produits/services ──────────────────────────────────────

app.use('/catalogue', require('./routes/catalogue'));

// ─── Routes Devis ─────────────────────────────────────────────────────────────

app.use('/devis', require('./routes/devis'));

// ─── Routes Comptable (invitations + login read-only) ────────────────────────

app.use('/auth', comptableRouter);

// ─── Backoffice admin (fichier statique servi depuis /backoffice/) ─────────────
// Accessible à : https://factureasy-backend.onrender.com/backoffice/
// ⚠️  Les fichiers admin sont dans backend/public/backoffice/ (dans le build context Docker)
app.use('/backoffice', express.static(path.join(__dirname, 'public/backoffice')));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({
  ok: true,
  ts: new Date().toISOString(),
  chorus: chorusClient.publicConfig(),
}));

// --- Lancement ---

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, function() { console.log('[OK] FacturEasy API demarree sur :' + PORT); });
}

module.exports = app;



