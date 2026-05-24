/**
 * FacturEasy — Route /sirene
 * Proxy vers l'API publique INSEE SIRENE v3
 * Autocomplétion entreprise depuis un SIRET à 14 chiffres
 */

const express = require('express');
const router  = express.Router();
const http    = require('../services/http');
const { authenticate } = require('../middleware/auth');

// Cache mémoire simple pour éviter de re-solliciter l'INSEE sur chaque frappe
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

router.get('/:siret', authenticate, async (req, res) => {
  const { siret } = req.params;

  if (!/^\d{14}$/.test(siret)) {
    return res.status(400).json({ error: 'SIRET invalide — 14 chiffres attendus' });
  }

  // Cache hit
  const cached = cache.get(siret);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    // API SIRENE publique (sans authentification pour les données publiques)
    const url = `https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`;
    const headers = {};

    // Si un token INSEE est configuré (optionnel — améliore le rate limit)
    if (process.env.INSEE_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.INSEE_API_TOKEN}`;
    }

    const response = await http.get(url, { headers, timeout: 5000 });
    const etablissement = response.data?.etablissement;

    if (!etablissement) {
      return res.status(503).json({ error: 'Service SIRENE temporairement indisponible', fallback: true });
    }

    const ul = etablissement.uniteLegale || {};
    const adresse = etablissement.adresseEtablissement || {};

    const result = {
      siret,
      siren:       siret.slice(0, 9),
      nom:         ul.denominationUniteLegale
                   || `${ul.prenom1UniteLegale || ''} ${ul.nomUniteLegale || ''}`.trim()
                   || 'Nom inconnu',
      forme_juridique: ul.categorieJuridiqueUniteLegale || null,
      activite_principale: etablissement.activitePrincipaleEtablissement || null,
      adresse: [
        adresse.numeroVoieEtablissement,
        adresse.typeVoieEtablissement,
        adresse.libelleVoieEtablissement,
      ].filter(Boolean).join(' '),
      code_postal: adresse.codePostalEtablissement || null,
      ville:       adresse.libelleCommuneEtablissement || null,
      etat:        etablissement.etatAdministratifEtablissement || null, // 'A' = actif, 'F' = fermé
    };

    cache.set(siret, { ts: Date.now(), data: result });
    res.json(result);

  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'SIRET non trouvé dans le répertoire SIRENE' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Limite de requêtes INSEE atteinte — réessayez dans quelques secondes' });
    }
    // Fallback gracieux si INSEE indisponible
    console.warn('[SIRENE]', err.message);
    res.status(503).json({ error: 'Service SIRENE temporairement indisponible', fallback: true });
  }
});

module.exports = router;
