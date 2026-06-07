/**
 * FacturEasy — Accès expert-comptable (rôle read-only)
 *
 * Flux :
 *  1. POST /auth/invite-comptable — l'entreprise génère un token comptable lié à son SIRET
 *  2. POST /auth/login-comptable  — le comptable s'authentifie avec ce token
 *  3. Le JWT résultant a le rôle 'comptable' + le SIRET de l'entreprise cliente
 *  4. Le middleware readOnly bloque toute mutation (POST/PUT/PATCH/DELETE)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const crypto  = require('crypto');
const { authenticate, generateToken } = require('../middleware/auth');

// ─── Middleware read-only pour le rôle comptable ──────────────────────────────
// Utilisé dans server.js pour les routes sensibles
function readOnly(req, res, next) {
  if (req.user?.role === 'comptable' && ['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    return res.status(403).json({ error: 'Accès en lecture seule — rôle expert-comptable' });
  }
  next();
}

// =============================================================================
// POST /auth/invite-comptable — Générer un token d'invitation comptable
//   Nécessite d'être authentifié en tant qu'entreprise
// =============================================================================

router.post('/invite-comptable', authenticate, async (req, res) => {
  const siret = req.user.siret;
  if (!siret) return res.status(403).json({ error: 'Réservé aux comptes entreprise' });

  try {
    // Générer un token d'invitation à usage unique (valable 7 jours)
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comptable_invites (
        id          SERIAL PRIMARY KEY,
        siret       VARCHAR(14) NOT NULL,
        token       VARCHAR(64) UNIQUE NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      'INSERT INTO comptable_invites (siret, token, expires_at) VALUES ($1,$2,$3)',
      [siret, inviteToken, expiresAt]
    );

    res.json({
      token:         inviteToken,
      invite_token:  inviteToken,
      expires_at:    expiresAt,
      login_url:     `https://app.factureasy.fr/comptable?token=${inviteToken}`,
      instructions:  'Transmettez ce lien à votre expert-comptable. Il expire dans 7 jours.',
    });
  } catch (err) {
    console.error('[POST /auth/invite-comptable]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================================
// POST /auth/login-comptable — Authentification du comptable via token d'invite
// =============================================================================

router.post('/login-comptable', async (req, res) => {
  const { invite_token, nom_cabinet } = req.body;
  if (!invite_token) return res.status(400).json({ error: 'invite_token requis' });

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS comptable_invites (
      id SERIAL PRIMARY KEY, siret VARCHAR(14) NOT NULL,
      token VARCHAR(64) UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    const { rows } = await pool.query(
      'SELECT * FROM comptable_invites WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [invite_token]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    // Marquer le token comme utilisé
    await pool.query('UPDATE comptable_invites SET used = TRUE WHERE id = $1', [rows[0].id]);

    const token = generateToken({
      role:         'comptable',
      siret:        rows[0].siret,   // SIRET de l'entreprise cliente
      nom_cabinet:  nom_cabinet || 'Expert-comptable',
    });

    res.json({ token, siret_client: rows[0].siret, role: 'comptable' });
  } catch (err) {
    console.error('[POST /auth/login-comptable]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = { router, readOnly };
