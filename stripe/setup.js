#!/usr/bin/env node
/**
 * FacturEasy — Stripe Setup Script
 * ─────────────────────────────────
 * Crée les 4 produits + prix avec 60 jours d'essai gratuit.
 * À exécuter UNE SEULE FOIS depuis ton terminal local.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx node stripe/setup.js
 *
 * En test d'abord (recommandé) :
 *   STRIPE_SECRET_KEY=sk_test_xxx node stripe/setup.js
 *
 * Le script affiche les price IDs à copier dans Railway → Variables.
 */

'use strict';

const https = require('https');
const querystring = require('querystring');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error('❌  Manque STRIPE_SECRET_KEY en variable d\'environnement.');
  console.error('   Exemple : STRIPE_SECRET_KEY=sk_test_xxx node stripe/setup.js');
  process.exit(1);
}

const TRIAL_DAYS = 60; // 60 jours

// ─── Plans ────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name:        'FacturEasy Solo',
    description: 'Jusqu\'à 3 utilisateurs, 200 factures/mois, support email',
    key:         'SOLO',
    price_eur:   1400, // centimes — 14,00 €
  },
  {
    name:        'FacturEasy Pro',
    description: 'Jusqu\'à 10 utilisateurs, factures illimitées, CA3 + relances auto',
    key:         'PRO',
    price_eur:   3400, // 34,00 €
  },
  {
    name:        'FacturEasy Équipe',
    description: 'Jusqu\'à 30 utilisateurs, multi-établissements, comptable inclus',
    key:         'EQUIPE',
    price_eur:   6900, // 69,00 €
  },
  {
    name:        'FacturEasy Business',
    description: 'Utilisateurs illimités, API dédiée, SLA 99,9 %, support prioritaire',
    key:         'BUSINESS',
    price_eur:   14900, // 149,00 €
  },
];

// ─── Helper Stripe API ────────────────────────────────────────────────────────
function stripePost(path, data) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(data);
    const options = {
      hostname: 'api.stripe.com',
      path,
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${STRIPE_KEY}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2024-06-20',
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const json = JSON.parse(raw);
        if (json.error) reject(new Error(json.error.message));
        else resolve(json);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀  FacturEasy — Configuration Stripe`);
  console.log(`   Essai gratuit : ${TRIAL_DAYS} jours (60 jours)`);
  console.log(`   Mode : ${STRIPE_KEY.startsWith('sk_live') ? '🔴 PRODUCTION' : '🟡 TEST'}\n`);

  const results = [];

  for (const plan of PLANS) {
    process.stdout.write(`📦  Création produit "${plan.name}"… `);

    // 1. Créer le produit
    const product = await stripePost('/v1/products', {
      name:                        plan.name,
      description:                 plan.description,
      'metadata[factureasy_key]':  plan.key,
    });
    console.log(`✓ (${product.id})`);

    // 2. Créer le prix mensuel avec trial
    process.stdout.write(`   💶  Création prix ${(plan.price_eur / 100).toFixed(2)} €/mois + ${TRIAL_DAYS}j essai… `);
    const price = await stripePost('/v1/prices', {
      product:                         product.id,
      currency:                        'eur',
      unit_amount:                     plan.price_eur,
      'recurring[interval]':           'month',
      'recurring[trial_period_days]':  TRIAL_DAYS,
      nickname:                        `${plan.key} mensuel — essai ${TRIAL_DAYS}j`,
      'metadata[factureasy_key]':      plan.key,
    });
    console.log(`✓ (${price.id})`);

    results.push({ key: plan.key, priceId: price.id, productId: product.id });
  }

  // ─── Récapitulatif ───────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('✅  Terminé ! Copie ces variables dans Railway → Variables :\n');

  for (const r of results) {
    console.log(`STRIPE_PRICE_${r.key}=${r.priceId}`);
  }

  console.log('\nEt ajoute aussi :');
  console.log('STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx');
  console.log('STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx  ← après création webhook');

  console.log('\n' + '─'.repeat(60));
  console.log('📌  Prochaine étape — Webhook Stripe :');
  console.log('   stripe.com → Developers → Webhooks → + Add endpoint');
  console.log('   URL     : https://TON-BACKEND.up.railway.app/stripe/webhook');
  console.log('   Événements à écouter :');
  console.log('     • customer.subscription.trial_will_end');
  console.log('     • customer.subscription.updated');
  console.log('     • customer.subscription.deleted');
  console.log('     • invoice.payment_failed');
  console.log('     • checkout.session.completed\n');
}

main().catch((err) => {
  console.error('\n❌  Erreur :', err.message);
  process.exit(1);
});
