'use strict';
/**
 * FacturEasy — Routes Stripe
 * ───────────────────────────
 * POST /stripe/create-checkout-session  → Crée une session Checkout (essai 60j)
 * POST /stripe/webhook                  → Webhooks Stripe (signature vérifiée)
 * POST /stripe/portal                   → Portail client Stripe (gérer abonnement)
 *
 * Variables d'environnement requises :
 *   STRIPE_SECRET_KEY     sk_live_xxx   (ou sk_test_xxx en dev)
 *   STRIPE_WEBHOOK_SECRET whsec_xxx     (obtenu dans Stripe Dashboard → Webhooks)
 *   STRIPE_PRICE_SOLO     price_xxx
 *   STRIPE_PRICE_PRO      price_xxx
 *   STRIPE_PRICE_EQUIPE   price_xxx
 *   STRIPE_PRICE_BUSINESS price_xxx
 */

const express  = require('express');
const https    = require('https');
const crypto   = require('crypto');
const pool     = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── Config ───────────────────────────────────────────────────────────────────
const STRIPE_KEY            = process.env.STRIPE_SECRET_KEY     || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const TRIAL_DAYS            = 60;

const PRICE_MAP = {
  solo:     process.env.STRIPE_PRICE_SOLO     || '',
  pro:      process.env.STRIPE_PRICE_PRO      || '',
  equipe:   process.env.STRIPE_PRICE_EQUIPE   || '',
  business: process.env.STRIPE_PRICE_BUSINESS || '',
};

// ─── Helper : appel Stripe API (sans SDK — zéro dépendance externe) ───────────
function stripeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? new URLSearchParams(data).toString() : '';
    const options = {
      hostname: 'api.stripe.com',
      path,
      method,
      headers: {
        'Authorization':  `Bearer ${STRIPE_KEY}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(raw);
        } catch (_) {
          const err = new Error('Reponse Stripe invalide');
          err.status = res.statusCode;
          return reject(err);
        }
        if (json.error) {
          const err = new Error(json.error.message);
          err.status = res.statusCode;
          return reject(err);
        }
        resolve(json);
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Vérification signature webhook Stripe ────────────────────────────────────
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) throw new Error('Signature Stripe manquante');
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const sig       = parts['v1'];

  if (!timestamp || !sig) throw new Error('Signature Stripe malformée');

  // Rejet des webhooks trop anciens (5 min)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) throw new Error('Webhook Stripe trop ancien (replay attack ?)');

  const payload  = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const sigBuffer = Buffer.from(sig, 'hex');

  if (expectedBuffer.length !== sigBuffer.length || !crypto.timingSafeEqual(expectedBuffer, sigBuffer)) {
    throw new Error('Signature Stripe invalide');
  }
}

// ─── POST /stripe/create-checkout-session ────────────────────────────────────
// Body: { plan: 'solo'|'pro'|'equipe'|'business' }
// Retourne: { url: 'https://checkout.stripe.com/...' }
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    if (!STRIPE_KEY) {
      return res.status(503).json({ error: 'Stripe non configuré (STRIPE_SECRET_KEY manquant)' });
    }

    const { plan } = req.body;
    const priceId  = PRICE_MAP[plan?.toLowerCase()];
    if (!priceId) {
      return res.status(400).json({
        error: 'Plan invalide',
        valid: Object.keys(PRICE_MAP),
      });
    }

    const siret         = req.user.siret;
    const successUrl    = `${req.headers.origin || 'https://app.factureasy.fr'}/?stripe=success&plan=${plan}`;
    const cancelUrl     = `${req.headers.origin || 'https://app.factureasy.fr'}/?stripe=cancel`;

    // Récupérer ou créer le customer Stripe pour ce SIRET
    const { rows } = await pool.query(
      'SELECT stripe_customer_id, nom, email FROM entreprises WHERE siret = $1',
      [siret]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entreprise introuvable' });

    let customerId = rows[0].stripe_customer_id;

    if (!customerId) {
      const customer = await stripeRequest('POST', '/v1/customers', {
        email:             rows[0].email || '',
        name:              rows[0].nom,
        'metadata[siret]': siret,
      });
      customerId = customer.id;

      await pool.query(
        'UPDATE entreprises SET stripe_customer_id = $1 WHERE siret = $2',
        [customerId, siret]
      );
    }

    // Créer la session Checkout avec l'essai configuré sur le prix
    const session = await stripeRequest('POST', '/v1/checkout/sessions', {
      customer:                              customerId,
      mode:                                  'subscription',
      'line_items[0][price]':                priceId,
      'line_items[0][quantity]':             '1',
      // Metadata sur la SESSION (pour checkout.session.completed)
      'metadata[siret]':                     siret,
      'metadata[plan]':                      plan,
      // Metadata sur la SUBSCRIPTION (pour subscription.updated/deleted)
      'subscription_data[trial_period_days]': String(TRIAL_DAYS),
      'subscription_data[metadata][siret]':  siret,
      'subscription_data[metadata][plan]':   plan,
      success_url:                           successUrl,
      cancel_url:                            cancelUrl,
      allow_promotion_codes:                 'true',
      'billing_address_collection':          'required',
      'customer_update[address]':            'auto',
      'customer_update[name]':               'auto',
      locale:                                'fr',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[POST /stripe/create-checkout-session]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /stripe/portal ──────────────────────────────────────────────────────
// Génère un lien vers le portail client Stripe (gérer CB, factures, annuler)
router.post('/portal', authenticate, async (req, res) => {
  try {
    if (!STRIPE_KEY) return res.status(503).json({ error: 'Stripe non configuré' });

    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM entreprises WHERE siret = $1',
      [req.user.siret]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(404).json({ error: 'Pas de compte Stripe associé' });

    const returnUrl = req.headers.origin || 'https://app.factureasy.fr';

    const session = await stripeRequest('POST', '/v1/billing_portal/sessions', {
      customer:   customerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[POST /stripe/portal]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── POST /stripe/webhook ─────────────────────────────────────────────────────
// ⚠️  Ce endpoint reçoit le body RAW (Buffer) — ne pas passer par express.json()
// Monté dans server.js AVANT express.json() avec express.raw({ type: '*/*' })
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET non configuré — webhook ignoré');
    return res.json({ received: true, warning: 'webhook_secret_missing' });
  }

  let event;
  try {
    verifyStripeSignature(req.body.toString(), sig, STRIPE_WEBHOOK_SECRET);
    event = JSON.parse(req.body.toString());
  } catch (err) {
    console.error('[stripe/webhook] Signature invalide :', err.message);
    return res.status(400).json({ error: err.message });
  }

  const obj = event.data?.object;

  try {
    switch (event.type) {

      // ── Checkout réussi → enregistrer subscription + plan ────────────────────
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;
        const siret = obj.metadata?.siret || obj.customer_details?.email;
        const plan  = obj.metadata?.plan  || obj.subscription_data?.metadata?.plan || 'solo';
        if (!siret) { console.warn('[webhook] checkout.session.completed — siret manquant'); break; }

        await pool.query(`
          UPDATE entreprises
          SET stripe_subscription_id = $1,
              plan                   = $2,
              updated_at             = NOW()
          WHERE siret = $3
        `, [obj.subscription, plan, siret]);

        console.log(`[stripe] ✓ Checkout terminé — ${siret} → plan ${plan} (sub: ${obj.subscription})`);
        break;
      }

      // ── Subscription mise à jour (upgrade / fin d'essai → actif) ─────────────
      case 'customer.subscription.updated': {
        const siret = obj.metadata?.siret;
        if (!siret) break;

        const plan        = obj.metadata?.plan || 'solo';
        const trialEnd    = obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : null;
        const status      = obj.status; // trialing | active | past_due | canceled

        await pool.query(`
          UPDATE entreprises
          SET plan          = $1,
              trial_ends_at = $2,
              updated_at    = NOW()
          WHERE siret = $3
        `, [plan, trialEnd, siret]);

        console.log(`[stripe] subscription.updated — ${siret} plan=${plan} status=${status}`);
        break;
      }

      // ── Fin d'essai dans 7 jours → log (+ Resend si configuré) ──────────────
      case 'customer.subscription.trial_will_end': {
        const siret = obj.metadata?.siret;
        const plan  = obj.metadata?.plan  || 'inconnu';
        const end   = obj.trial_end ? new Date(obj.trial_end * 1000).toLocaleDateString('fr-FR') : '?';

        console.log(`[stripe] ⚠️  trial_will_end — ${siret || 'inconnu'} plan=${plan} fin=${end}`);
        // TODO : envoyer email Resend de rappel (utiliser le service relances existant)
        break;
      }

      // ── Subscription annulée → remettre en plan gratuit ──────────────────────
      case 'customer.subscription.deleted': {
        const siret = obj.metadata?.siret;
        if (!siret) break;

        await pool.query(`
          UPDATE entreprises
          SET plan                   = 'gratuit',
              stripe_subscription_id = NULL,
              trial_ends_at          = NULL,
              updated_at             = NOW()
          WHERE siret = $1
        `, [siret]);

        console.log(`[stripe] subscription.deleted — ${siret} → plan gratuit`);
        break;
      }

      // ── Paiement échoué → log ─────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const customerId = obj.customer;
        console.warn(`[stripe] ⚠️  invoice.payment_failed — customer=${customerId}`);
        // Stripe envoie automatiquement des relances par email (Smart Retries)
        break;
      }

      default:
        console.log(`[stripe/webhook] Événement ignoré : ${event.type}`);
    }
  } catch (err) {
    console.error('[stripe/webhook] Erreur traitement :', err.message);
    // On retourne quand même 200 pour éviter que Stripe ne re-tente
  }

  res.json({ received: true });
});

module.exports = router;
