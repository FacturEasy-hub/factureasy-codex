import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Données mock ────────────────────────────────────────────────────────────
const MOCK_COMPANY = {
  siret: '12345678901234',
  nom: 'Tech Solutions SARL',
  email: 'contact@techsolutions.fr',
  telephone: '01 23 45 67 89',
  adresse: '12 rue de la Paix, 75001 Paris',
};

const MOCK_FACTURES = [
  { id: 1, numero: 'FA-2024-001', client: 'Acme Corp', siretClient: '98765432100012', date: '2024-11-01', montantHT: 2500, tva: 500, ttc: 3000, statut: 'ACCEPTEE', numeroEngagement: 'ENG-001' },
  { id: 2, numero: 'FA-2024-002', client: 'Beta SAS', siretClient: '11223344556677', date: '2024-11-10', montantHT: 1800, tva: 360, ttc: 2160, statut: 'EN_COURS', numeroEngagement: 'ENG-002' },
  { id: 3, numero: 'FA-2024-003', client: 'Gamma SA', siretClient: '55667788990011', date: '2024-11-15', montantHT: 4200, tva: 840, ttc: 5040, statut: 'EMISE', numeroEngagement: '' },
  { id: 4, numero: 'FA-2024-004', client: 'Delta EURL', siretClient: '33445566778899', date: '2024-10-20', montantHT: 900, tva: 180, ttc: 1080, statut: 'REJETEE', numeroEngagement: 'ENG-004' },
  { id: 5, numero: 'FA-2024-005', client: 'Epsilon Ltd', siretClient: '44556677889900', date: '2024-10-05', montantHT: 3100, tva: 620, ttc: 3720, statut: 'ACCEPTEE', numeroEngagement: 'ENG-005' },
];

const MOCK_REVENUS = [
  { id: 1, date: '2024-11-01', source: 'Facture', client: 'Acme Corp', montantHT: 2500, tva: 500, ttc: 3000, statut: 'ENCAISSE' },
  { id: 2, date: '2024-10-05', source: 'Facture', client: 'Epsilon Ltd', montantHT: 3100, tva: 620, ttc: 3720, statut: 'ENCAISSE' },
  { id: 3, date: '2024-09-15', source: 'Manuel', client: 'Zeta Corp', montantHT: 1500, tva: 300, ttc: 1800, statut: 'ENCAISSE' },
  { id: 4, date: '2024-11-10', source: 'Facture', client: 'Beta SAS', montantHT: 1800, tva: 360, ttc: 2160, statut: 'EN_ATTENTE' },
  { id: 5, date: '2024-11-15', source: 'Facture', client: 'Gamma SA', montantHT: 4200, tva: 840, ttc: 5040, statut: 'EN_ATTENTE' },
];

const MOCK_DEPENSES = [
  { id: 1, date: '2024-11-02', libelle: 'Abonnement OVH', categorie: 'Hébergement', montantHT: 83.33, tva: 16.67, ttc: 100, justificatif: '' },
  { id: 2, date: '2024-11-05', libelle: 'Fournitures bureau', categorie: 'Fournitures', montantHT: 166.67, tva: 33.33, ttc: 200, justificatif: '' },
  { id: 3, date: '2024-11-08', libelle: 'Déplacement Paris-Lyon', categorie: 'Transport', montantHT: 145.83, tva: 0, ttc: 145.83, justificatif: '' },
  { id: 4, date: '2024-10-15', libelle: 'Logiciel comptabilité', categorie: 'Logiciels', montantHT: 250, tva: 50, ttc: 300, justificatif: '' },
  { id: 5, date: '2024-10-20', libelle: 'Repas client', categorie: 'Restaurant', montantHT: 85.42, tva: 5.08, ttc: 90.50, justificatif: '' },
];

const MOCK_TVA_HISTORY = [
  { periode: 'Octobre 2024', collectee: 1400, deductible: 320, montant: 1080, statut: 'DECLAREE' },
  { periode: 'Septembre 2024', collectee: 980, deductible: 210, montant: 770, statut: 'DECLAREE' },
  { periode: 'Août 2024', collectee: 1650, deductible: 380, montant: 1270, statut: 'DECLAREE' },
  { periode: 'Juillet 2024', collectee: 720, deductible: 155, montant: 565, statut: 'DECLAREE' },
];

const MOCK_GRAPH_DATA = [
  { mois: 'Juin', ca: 4200, depenses: 800 },
  { mois: 'Juil', ca: 3100, depenses: 620 },
  { mois: 'Août', ca: 5500, depenses: 950 },
  { mois: 'Sept', ca: 2900, depenses: 540 },
  { mois: 'Oct', ca: 6200, depenses: 1100 },
  { mois: 'Nov', ca: 4800, depenses: 836 },
];

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '-');

// Normalise les données de l'API vers le format frontend
const normFacture = (f) => ({
  ...f,
  client:     f.client_nom   || f.client   || '',
  date:       f.date_emission ? f.date_emission.slice(0,10) : (f.date || ''),
  ttc:        parseFloat(f.montant_ttc  || f.ttc       || 0),
  montantHT:  parseFloat(f.montant_ht   || f.montantHT || 0),
  tva:        parseFloat(f.tva          || 0),
});
const normRevenu = (r) => ({
  ...r,
  client:     r.client_nom         || r.client   || '',
  date:       r.date_encaissement  ? r.date_encaissement.slice(0,10)  : (r.date || ''),
  ttc:        parseFloat(r.montant_ttc  || r.ttc       || 0),
  montantHT:  parseFloat(r.montant_ht   || r.montantHT || 0),
  tva:        parseFloat(r.tva_taux !== undefined ? (parseFloat(r.montant_ttc||0) - parseFloat(r.montant_ht||0)) : (r.tva || 0)),
  statut:     r.statut || (r.source === 'facture' ? 'ENCAISSE' : 'ENCAISSE'),
  source:     r.source === 'facture' ? 'Facture' : 'Manuel',
});
const normDepense = (d) => ({
  ...d,
  date:       d.date_depense ? d.date_depense.slice(0,10) : (d.date || ''),
  ttc:        parseFloat(d.montant_ttc  || d.ttc       || 0),
  montantHT:  parseFloat(d.montant_ht   || d.montantHT || 0),
  tva:        parseFloat(d.montant_ttc && d.montant_ht ? (parseFloat(d.montant_ttc) - parseFloat(d.montant_ht)) : (d.tva || 0)),
  categorie:  d.categorie_nom || d.categorie || 'Autre',
});

const initiales = (nom) =>
  nom
    ? nom
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

function apiCall(path, options = {}) {
  const token = localStorage.getItem('fe_token');
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function downloadApiFile(path, filename) {
  const token = localStorage.getItem('fe_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Téléchargement impossible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Styles globaux ───────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      input, select, textarea { font-family: inherit; }
      button { cursor: pointer; font-family: inherit; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; }
      .fade-in { animation: fadeIn 0.25s ease; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .bar-ca { background: #4f46e5; border-radius: 3px 3px 0 0; transition: height 0.5s ease; }
      .bar-dep { background: #f59e0b; border-radius: 3px 3px 0 0; transition: height 0.5s ease; }
      .progress-fill { border-radius: 4px; height: 100%; transition: width 0.6s ease; }
      .nav-btn:hover { background: #252840 !important; color: #e2e8f0 !important; }
    `}</style>
  );
}

// ─── Composants UI réutilisables ──────────────────────────────────────────────
function Badge({ statut }) {
  const map = {
    BROUILLON: { bg: '#f1f5f9', color: '#475569', label: 'Préparée localement' },
    EMISE: { bg: '#dbeafe', color: '#1d4ed8', label: 'Émise' },
    EN_COURS: { bg: '#fef3c7', color: '#b45309', label: 'En cours' },
    ACCEPTEE: { bg: '#d1fae5', color: '#065f46', label: 'Acceptée' },
    REJETEE: { bg: '#fee2e2', color: '#991b1b', label: 'Rejetée' },
    ENCAISSE: { bg: '#d1fae5', color: '#065f46', label: 'Encaissé' },
    EN_ATTENTE: { bg: '#fef3c7', color: '#b45309', label: 'En attente' },
    DECLAREE:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Déclarée' },
    A_REVERSER: { bg: '#fef9c3', color: '#854d0e', label: 'À reverser' },
  };
  const s = map[statut] || { bg: '#f1f5f9', color: '#64748b', label: statut };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

function KpiCard({ icon, label, value, variation, color }) {
  const isPositive = variation >= 0;
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 22,
            background: color + '18',
            borderRadius: 8,
            padding: '6px 8px',
            lineHeight: 1,
          }}
        >
          {icon}
        </span>
        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{value}</div>
      {variation !== undefined && (
        <div
          style={{
            fontSize: 12,
            color: isPositive ? '#10b981' : '#ef4444',
            fontWeight: 500,
          }}
        >
          {isPositive ? '▲' : '▼'} {Math.abs(variation)}% vs mois préc.
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fade-in"
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 22,
              color: '#94a3b8',
              lineHeight: 1,
              padding: 4,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: '#374151',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1.5px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  background: '#fff',
  color: '#0f172a',
};

function Btn({ children, onClick, variant = 'primary', style: s = {}, disabled = false }) {
  const base = {
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    transition: 'opacity 0.15s',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    ...s,
  };
  const variants = {
    primary: { background: '#4f46e5', color: '#fff' },
    ghost: { background: '#f1f5f9', color: '#374151' },
    danger: { background: '#fee2e2', color: '#991b1b' },
    success: { background: '#d1fae5', color: '#065f46' },
  };
  return (
    <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ─── LoginScreen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [siret, setSiret] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromLanding = params.get('email');
    if (emailFromLanding) setEmail(emailFromLanding);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (siret.length !== 14 || !/^\d{14}$/.test(siret)) {
      setError('Le SIRET doit contenir exactement 14 chiffres.');
      return;
    }
    if (!nom.trim()) {
      setError("Le nom de l'entreprise est requis.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Un email professionnel valide est requis.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ siret, nom, email: email.trim(), password }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('fe_token', data.token);
        localStorage.setItem('fe_company', JSON.stringify(data.entreprise || { siret, nom }));
        onLogin(data.entreprise || { siret, nom });
        return;
      }
      const errData = await res.json().catch(() => ({}));
      setError(errData.error || 'Connexion refusée. Vérifiez votre SIRET.');
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    }
    setLoading(false);
  };

  const requestOtp = async () => {
    setError('');
    setInfo('');
    if (siret.length !== 14 || !/^\d{14}$/.test(siret)) return setError('Le SIRET doit contenir exactement 14 chiffres.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Un email professionnel valide est requis.');
    setLoading(true);
    try {
      const res = await apiCall('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ siret, email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Impossible d’envoyer le code');
      setOtpRequested(true);
      setInfo(data.message || 'Code envoyé par email. Vérifiez aussi vos spams.');
    } catch (e) {
      setError(e.message || 'Impossible de joindre le serveur.');
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(otpCode)) return setError('Code à 6 chiffres requis.');
    setLoading(true);
    try {
      const res = await apiCall('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ siret, email: email.trim(), code: otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Code invalide');
      localStorage.setItem('fe_token', data.token);
      localStorage.setItem('fe_company', JSON.stringify(data.entreprise || { siret, nom }));
      onLogin(data.entreprise || { siret, nom });
    } catch (e) {
      setError(e.message || 'Impossible de vérifier le code.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1d2e 0%, #252840 50%, #4f46e5 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="fade-in"
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '48px 40px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>💼</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#4f46e5', letterSpacing: '-0.5px' }}>
            FacturEasy
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            Gestion de trésorerie &amp; facturation électronique
            <br />
            pour PME françaises
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="SIRET (14 chiffres)">
            <input
              style={inputStyle}
              type="text"
              placeholder="12345678901234"
              value={siret}
              onChange={(e) => setSiret(e.target.value.replace(/\D/g, '').slice(0, 14))}
              maxLength={14}
              required
            />
          </Field>
          <Field label="Nom de l'entreprise">
            <input
              style={inputStyle}
              type="text"
              placeholder="Tech Solutions SARL"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
            />
          </Field>
          <Field label="Email professionnel">
            <input
              style={inputStyle}
              type="email"
              placeholder="contact@entreprise.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Mot de passe">
            <input
              style={inputStyle}
              type="password"
              placeholder="8 caractères minimum"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          {otpRequested && (
            <Field label="Code email">
              <input
                style={inputStyle}
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
              />
            </Field>
          )}
          {error && (
            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}
          {info && (
            <div
              style={{
                background: '#d1fae5',
                color: '#065f46',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {info}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 8,
            }}
          >
            {loading ? 'Connexion…' : 'Créer / accéder à mon espace client →'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={otpRequested ? verifyOtp : requestOtp}
            style={{
              width: '100%',
              padding: '12px',
              background: '#fff',
              color: '#4f46e5',
              border: '1px solid #c7d2fe',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 10,
            }}
          >
            {otpRequested ? 'Valider le code email' : 'Recevoir un code email (compte existant)'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 24 }}>
          Vos données sont protégées · Conforme RGPD
        </p>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'clients', label: 'Clients', icon: 'CL' },
  { key: 'factures', label: 'Factures', icon: '🧾' },
  { key: 'chorus', label: 'Chorus Pro', icon: '🔗' },
  { key: 'recurrentes', label: 'Récurrentes', icon: '🔁' },
  { key: 'revenus', label: 'Revenus', icon: '💰' },
  { key: 'depenses', label: 'Dépenses', icon: '💸' },
  { key: 'tresorerie', label: 'Trésorerie', icon: '📈' },
  { key: 'tva',        label: 'TVA',                icon: '📋' },
  { key: 'devis',      label: 'Devis',              icon: '📝' },
  { key: 'catalogue',  label: 'Catalogue',          icon: '🗂️' },
  { key: 'plans', label: 'Plans & abonnement', icon: '⭐' },
  { key: 'comptable', label: 'Comptable', icon: '👤' },
  { key: 'parametres', label: 'Paramètres', icon: '⚙️' },
];

function Sidebar({ active, onNav, company }) {
  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: '#1a1d2e',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid #252840' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
          💼 FacturEasy
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Espace pro</div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              className={isActive ? '' : 'nav-btn'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '11px 14px',
                borderRadius: 10,
                border: 'none',
                marginBottom: 3,
                cursor: 'pointer',
                textAlign: 'left',
                background: isActive ? '#4f46e5' : 'transparent',
                color: isActive ? '#fff' : '#9ca3af',
                fontWeight: isActive ? 700 : 400,
                fontSize: 14,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer user */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #252840',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#4f46e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {initiales(company?.nom || '')}
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              color: '#e2e8f0',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {company?.nom || 'Mon entreprise'}
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>
            {company?.siret ? company.siret.slice(0, 9) + '…' : ''}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard: { title: 'Dashboard', subtitle: "Vue d'ensemble de votre activité", cta: null },
  clients: { title: 'Clients', subtitle: 'Carnet clients de votre entreprise', cta: '+ Nouveau client' },
  factures: {
    title: 'Factures',
    subtitle: 'Gestion des factures électroniques',
    cta: '+ Nouvelle facture',
  },
  chorus: {
    title: 'Chorus Pro',
    subtitle: 'Connexion et suivi du portail public de facturation',
    cta: null,
  },
  recurrentes: {
    title: 'Factures récurrentes',
    subtitle: 'Modèles et planification automatique',
    cta: '+ Nouveau modèle',
  },
  revenus: { title: 'Revenus', subtitle: 'Suivi de vos encaissements', cta: '+ Revenu manuel' },
  depenses: { title: 'Dépenses', subtitle: 'Gestion de vos charges', cta: '+ Nouvelle dépense' },
  tresorerie: { title: 'Trésorerie', subtitle: 'Projection simple 30 / 60 / 90 jours', cta: null },
  tva: { title: 'TVA', subtitle: 'Déclarations et suivi de la TVA', cta: null },
  devis: { title: 'Devis', subtitle: 'Propositions commerciales et conversion en facture', cta: '+ Nouveau devis' },
  catalogue: { title: 'Catalogue', subtitle: 'Articles et services réutilisables', cta: '+ Nouvel article' },
  plans: { title: 'Plans & abonnement', subtitle: 'Gérez votre abonnement FacturEasy', cta: null },
  comptable: { title: 'Expert-comptable', subtitle: 'Accès lecture seule pour votre cabinet', cta: null },
  parametres: { title: 'Paramètres', subtitle: 'Configuration de votre compte', cta: null },
};

function Topbar({ page, onCta }) {
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '1px solid #e8ecf0',
        padding: '18px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{meta.title}</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{meta.subtitle}</p>
      </div>
      {meta.cta && <Btn onClick={onCta}>{meta.cta}</Btn>}
    </div>
  );
}

// ─── Section Dashboard ────────────────────────────────────────────────────────
function SectionDashboard({ factures, depenses, onNav }) {
  const caEncaisse = factures
    .filter((f) => f.statut === 'ACCEPTEE')
    .reduce((s, f) => s + f.ttc, 0);
  const totalDep = depenses.reduce((s, d) => s + d.ttc, 0);
  const resultatNet = caEncaisse - totalDep;
  const tvaReverse =
    factures.filter((f) => f.statut === 'ACCEPTEE').reduce((s, f) => s + f.tva, 0) -
    depenses.reduce((s, d) => s + d.tva, 0);

  const hasActivity = factures.length > 0 || depenses.length > 0;
  const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
  const graphData = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - idx));
    const key = d.toISOString().slice(0, 7);
    return {
      mois: monthFmt.format(d),
      ca: factures
        .filter((f) => (f.date || '').slice(0, 7) === key)
        .reduce((s, f) => s + Number(f.ttc || 0), 0),
      depenses: depenses
        .filter((x) => (x.date || '').slice(0, 7) === key)
        .reduce((s, x) => s + Number(x.ttc || 0), 0),
    };
  });
  const maxVal = Math.max(1, ...graphData.map((d) => Math.max(d.ca, d.depenses)));
  const openInvoices = factures.filter((f) => !['ACCEPTEE', 'PAYEE', 'ANNULEE'].includes(f.statut));
  const caMois = graphData[graphData.length - 1]?.ca || 0;
  const depMois = graphData[graphData.length - 1]?.depenses || 0;
  const tvaEstimee = Math.max(0, tvaReverse);
  const soldeEstime = resultatNet - tvaEstimee;
  const projectionRows = [30, 60, 90].map((days) => {
    const encaissements = openInvoices.reduce((s, f) => s + Number(f.ttc || 0), 0);
    const depensesPrevues = depMois * (days / 30);
    const soldeProjete = soldeEstime + encaissements - depensesPrevues - tvaEstimee;
    return { days, encaissements, depensesPrevues, tvaPrevue: tvaEstimee, soldeProjete };
  });
  const priorityActions = [
    openInvoices.length && { title: `${openInvoices.length} facture(s) à suivre`, priority: 'Moyenne', amount: openInvoices.reduce((s, f) => s + Number(f.ttc || 0), 0), action: 'Voir', nav: 'factures' },
    tvaEstimee > 0 && { title: 'TVA estimée à vérifier', priority: 'Moyenne', amount: tvaEstimee, action: 'Contrôler', nav: 'tva' },
    !hasActivity && { title: 'Créer votre première facture', priority: 'Haute', amount: null, action: 'Créer', nav: 'factures' },
    { title: 'Inviter votre expert-comptable', priority: 'Basse', amount: null, action: 'Inviter', nav: 'comptable' },
  ].filter(Boolean).slice(0, 5);
  const assistantNotes = [
    openInvoices.length ? `${openInvoices.length} facture(s) attendent une action.` : null,
    tvaEstimee > 0 ? `TVA estimée : ${fmt(tvaEstimee)}.` : null,
    projectionRows.some((r) => r.soldeProjete < 0) ? 'Votre trésorerie pourrait passer sous 0 sur 90 jours.' : null,
    'FacturEasy prépare Chorus Pro, e-reporting et facture électronique sans se présenter comme PDP.',
  ].filter(Boolean);

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <KpiCard icon="💰" label="CA Encaissé" value={fmt(caEncaisse)} variation={12.4} color="#4f46e5" />
        <KpiCard icon="💸" label="Dépenses" value={fmt(totalDep)} variation={-3.1} color="#f59e0b" />
        <KpiCard icon="📈" label="Résultat Net" value={fmt(resultatNet)} variation={18.7} color="#10b981" />
        <KpiCard icon="📋" label="TVA à reverser" value={fmt(tvaReverse)} color="#ef4444" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 24,
          marginBottom: 28,
        }}
      >
        {/* Graphique barres */}
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Évolution 6 mois</h2>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#4f46e5',
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                />
                CA
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#f59e0b',
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                />
                Dépenses
              </span>
            </div>
          </div>
          {hasActivity ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
            {graphData.map((d) => (
              <div
                key={d.mois}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                  gap: 2,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 3,
                    alignItems: 'flex-end',
                    height: '100%',
                  }}
                >
                  <div
                    className="bar-ca"
                    style={{ width: 14, height: `${(d.ca / maxVal) * 100}%` }}
                    title={fmt(d.ca)}
                  />
                  <div
                    className="bar-dep"
                    style={{ width: 14, height: `${(d.depenses / maxVal) * 100}%` }}
                    title={fmt(d.depenses)}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{d.mois}</span>
              </div>
            ))}
          </div>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 10 }}>
              Aucune donnée réelle pour le moment. Créez une facture ou une dépense.
            </div>
          )}
        </div>

        {/* Actions rapides */}
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Actions rapides</h2>
          {[
            { icon: '🧾', label: 'Nouvelle facture', desc: 'Créer et envoyer', nav: 'factures', color: '#4f46e5' },
            { icon: '💸', label: 'Ajouter dépense', desc: 'Saisir une charge', nav: 'depenses', color: '#f59e0b' },
            { icon: '📋', label: 'Télécharger CA3', desc: 'Export TVA', nav: 'tva', color: '#10b981' },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => onNav(a.nav)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: '1.5px solid #e8ecf0',
                background: '#fafafa',
                marginBottom: 10,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = a.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e8ecf0')}
            >
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.label}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 28 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Trésorerie 30 / 60 / 90 jours</h2>
          <table>
            <thead><tr>{['Période', 'Encaissements', 'Dépenses', 'TVA', 'Solde projeté'].map((h) => <th key={h} style={{ padding: 10, fontSize: 12, color: '#64748b' }}>{h}</th>)}</tr></thead>
            <tbody>{projectionRows.map((r) => (
              <tr key={r.days} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10, fontWeight: 700 }}>{r.days} jours</td>
                <td style={{ padding: 10 }}>{fmt(r.encaissements)}</td>
                <td style={{ padding: 10 }}>{fmt(r.depensesPrevues)}</td>
                <td style={{ padding: 10 }}>{fmt(r.tvaPrevue)}</td>
                <td style={{ padding: 10, color: r.soldeProjete < 0 ? '#dc2626' : '#047857', fontWeight: 700 }}>{fmt(r.soldeProjete)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Inbox Finance</h2>
          {priorityActions.map((a) => (
            <button key={a.title} onClick={() => onNav(a.nav)} style={{ width: '100%', textAlign: 'left', padding: 12, border: '1px solid #e5e7eb', background: '#fff', borderRadius: 10, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong style={{ fontSize: 13 }}>{a.title}</strong><span style={{ fontSize: 11, color: a.priority === 'Haute' ? '#dc2626' : '#64748b' }}>{a.priority}</span></div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{a.amount ? fmt(a.amount) + ' · ' : ''}{a.action}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Conformité</h2>
          {[
            ['Facture électronique B2B', 'Données prêtes'],
            ['e-reporting B2C / export', 'Structure préparée'],
            ['Chorus Pro B2G', 'Connexion à configurer'],
            ['Archivage', 'À vérifier'],
            ['Expert-comptable', 'Invitation disponible'],
          ].map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}><span>{k}</span><strong>{v}</strong></div>)}
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Assistant FacturEasy</h2>
          {assistantNotes.map((n) => <div key={n} style={{ background: '#f8fafc', borderRadius: 10, padding: 12, fontSize: 13, color: '#334155', marginBottom: 8 }}>{n}</div>)}
        </div>
      </div>

      {/* Dernières factures */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Dernières factures</h2>
        <table>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
              {['Numéro', 'Client', 'Date', 'TTC', 'Statut'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factures.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Aucune facture réelle créée.
                </td>
              </tr>
            ) : factures.slice(0, 5).map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                  {f.numero}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13 }}>{f.client}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#64748b' }}>
                  {fmtDate(f.date)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{fmt(f.ttc)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <Badge statut={f.statut} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section Factures ─────────────────────────────────────────────────────────
const TVA_RATES = [
  { label: '20%', value: 20 },
  { label: '10%', value: 10 },
  { label: '5.5%', value: 5.5 },
  { label: '2.1%', value: 2.1 },
  { label: '0%', value: 0 },
];

function ModalNouvelleFacture({ onClose, onSave, clients = [] }) {
  const [form, setForm] = useState({
    clientMode: 'existing',
    selectedClientId: '',
    siretClient: '',
    client: '',
    clientEmail: '',
    clientTelephone: '',
    clientAdresse: '',
    description: '',
    montantHT: '',
    tauxTVA: 20,
    numeroEngagement: '',
  });
  const [sireneLoading, setSireneLoading] = useState(false);
  const [sireneHint, setSireneHint] = useState('');

  const montantHT = parseFloat(form.montantHT) || 0;
  const tva = montantHT * Number(form.tauxTVA) / 100;
  const ttc = montantHT + tva;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hasClients = clients.length > 0;

  useEffect(() => {
    if (!hasClients || form.selectedClientId || form.clientMode !== 'existing') return;
    const c = clients[0];
    setForm((f) => ({
      ...f,
      selectedClientId: String(c.id),
      siretClient: c.siret_client || '',
      client: c.nom || '',
      clientEmail: c.email || '',
      clientTelephone: c.telephone || '',
      clientAdresse: c.adresse || '',
    }));
  }, [clients, hasClients, form.selectedClientId, form.clientMode]);

  const applyExistingClient = (id) => {
    const c = clients.find((row) => String(row.id) === String(id));
    if (!c) return setForm((f) => ({ ...f, selectedClientId: id }));
    setForm((f) => ({
      ...f,
      selectedClientId: String(id),
      siretClient: c.siret_client || '',
      client: c.nom || '',
      clientEmail: c.email || '',
      clientTelephone: c.telephone || '',
      clientAdresse: c.adresse || '',
    }));
    setSireneHint('');
  };

  const lookupSirene = async () => {
    if (form.siretClient.length !== 14) return;
    setSireneLoading(true);
    setSireneHint('');
    try {
      const res = await apiCall(`/sirene/${form.siretClient}`);
      if (res.ok) {
        const data = await res.json();
        const nomEntreprise = data.nom || '';
        if (nomEntreprise) {
          setForm((f) => ({ ...f, client: nomEntreprise }));
          setSireneHint(`✓ ${nomEntreprise}${data.ville ? ' — ' + data.ville : ''}`);
        } else {
          setSireneHint('SIRET trouvé mais nom indisponible');
        }
      } else {
        setSireneHint('SIRET non vérifié dans SIRENE — vous pouvez quand même créer la facture si le nom client est saisi.');
      }
    } catch {
      setSireneHint('Impossible de vérifier le SIRET (hors ligne)');
    }
    setSireneLoading(false);
  };

  const handleSave = () => {
    if (!form.client || !form.montantHT) return;
    onSave({
      client_siret: form.siretClient,
      client_nom: form.client,
      description: form.description,
      montant_ht: montantHT,
      tva: Number(form.tauxTVA),
      numero_engagement: form.numeroEngagement,
      create_client: form.clientMode === 'new',
      client_email: form.clientEmail,
      client_telephone: form.clientTelephone,
      client_adresse: form.clientAdresse,
      montantHT,
      tvaMontant: tva,
      ttc,
      tauxTVA: Number(form.tauxTVA),
    });
    onClose();
  };

  return (
    <Modal title="Nouvelle Facture" onClose={onClose}>
      <Field label="Client">
        <select
          style={inputStyle}
          value={form.clientMode === 'new' ? '__new__' : form.selectedClientId}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              setForm((f) => ({
                ...f,
                clientMode: 'new',
                selectedClientId: '',
                siretClient: '',
                client: '',
                clientEmail: '',
                clientTelephone: '',
                clientAdresse: '',
              }));
              setSireneHint('');
              return;
            }
            setForm((f) => ({ ...f, clientMode: 'existing' }));
            applyExistingClient(e.target.value);
          }}
        >
          {hasClients ? clients.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}{c.siret_client ? ` - ${c.siret_client}` : ''}</option>
          )) : <option value="__new__">Aucun client enregistré</option>}
          <option value="__new__">+ Nouveau client</option>
        </select>
      </Field>
      <Field label="SIRET client">
        <div style={{ position: 'relative' }}>
          <input
            style={inputStyle}
            placeholder="98765432100012"
            value={form.siretClient}
            onChange={(e) => {
              setSireneHint('');
              setForm((f) => ({ ...f, siretClient: e.target.value.replace(/\D/g, '').slice(0, 14), clientMode: 'new', selectedClientId: '' }));
            }}
            onBlur={lookupSirene}
            maxLength={14}
          />
          {sireneLoading && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#64748b' }}>
              ⏳
            </span>
          )}
        </div>
        {sireneHint && (
          <div style={{ fontSize: 12, marginTop: 4, color: sireneHint.startsWith('✓') ? '#065f46' : '#b45309' }}>
            {sireneHint}
          </div>
        )}
      </Field>
      <Field label="Nom client *">
        <input style={inputStyle} placeholder="Acme Corp" value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value, clientMode: 'new', selectedClientId: '' }))} />
      </Field>
      {form.clientMode === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Email client">
            <input style={inputStyle} type="email" placeholder="contact@client.fr" value={form.clientEmail} onChange={set('clientEmail')} />
          </Field>
          <Field label="Téléphone client">
            <input style={inputStyle} placeholder="01 23 45 67 89" value={form.clientTelephone} onChange={set('clientTelephone')} />
          </Field>
        </div>
      )}
      {form.clientMode === 'new' && (
        <Field label="Adresse client">
          <textarea style={{ ...inputStyle, minHeight: 64 }} placeholder="Adresse de facturation" value={form.clientAdresse} onChange={set('clientAdresse')} />
        </Field>
      )}
      <Field label="Description">
        <input
          style={inputStyle}
          placeholder="Prestation de développement web"
          value={form.description}
          onChange={set('description')}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Montant HT (€) *">
          <input
            style={inputStyle}
            type="number"
            placeholder="1000"
            value={form.montantHT}
            onChange={set('montantHT')}
          />
        </Field>
        <Field label="Taux TVA">
          <select style={inputStyle} value={form.tauxTVA} onChange={set('tauxTVA')}>
            {TVA_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Numéro d'engagement">
        <input
          style={inputStyle}
          placeholder="ENG-001 (optionnel)"
          value={form.numeroEngagement}
          onChange={set('numeroEngagement')}
        />
      </Field>
      <div
        style={{
          background: '#f8fafc',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}
      >
        {[
          ['HT', fmt(montantHT)],
          ['TVA', fmt(tva)],
          ['TTC', fmt(ttc)],
        ].map(([l, v]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{l}</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: l === 'TTC' ? '#4f46e5' : '#0f172a',
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>
          Annuler
        </Btn>
        <Btn onClick={handleSave} disabled={!form.client || !form.montantHT}>
          Créer la facture
        </Btn>
      </div>
    </Modal>
  );
}

// ─── Modal Avoir ──────────────────────────────────────────────────────────────
function ModalAvoir({ facture, onClose, onCreated }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    apiCall(`/factures/${facture.id}/avoir`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setExisting(d); })
      .catch(() => {});
  }, [facture.id]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await apiCall(`/factures/${facture.id}/avoir`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg(`✓ Avoir ${data.numero || ''} créé avec succès`);
        setExisting(data);
        if (onCreated) onCreated(data);
      } else {
        setMsg(data.error || 'Erreur lors de la création de l\'avoir');
      }
    } catch {
      setMsg('Erreur réseau');
    }
    setLoading(false);
  };

  return (
    <Modal title={`Avoir — ${facture.numero}`} onClose={onClose}>
      <div style={{ marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Facture originale</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{facture.client}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {fmt(facture.montantHT)} HT · {fmt(facture.ttc)} TTC
        </div>
      </div>
      {existing ? (
        <div style={{ background: '#d1fae5', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>
            Avoir existant : {existing.numero}
          </div>
          <div style={{ fontSize: 13, color: '#047857' }}>
            Montant : {fmt(Math.abs(existing.montantHT || 0))} HT · {fmt(Math.abs(existing.ttc || 0))} TTC
          </div>
        </div>
      ) : (
        <div style={{ background: '#fef3c7', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
          Aucun avoir existant pour cette facture. La création d'un avoir annule intégralement la facture originale (montants inversés).
        </div>
      )}
      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#d1fae5' : '#fee2e2', color: msg.startsWith('✓') ? '#065f46' : '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          {msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Fermer</Btn>
        {!existing && (
          <Btn onClick={handleCreate} disabled={loading} variant="danger">
            {loading ? 'Création…' : '➖ Créer l\'avoir'}
          </Btn>
        )}
      </div>
    </Modal>
  );
}

// ─── Modal Relance ────────────────────────────────────────────────────────────
function ModalRelance({ facture, onClose }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleRelance = async () => {
    setLoading(true);
    try {
      const res = await apiCall(`/relances/${facture.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg('✓ Email de relance envoyé au client');
      } else {
        setMsg(data.error || 'Erreur lors de l\'envoi');
      }
    } catch {
      setMsg('Erreur réseau');
    }
    setLoading(false);
  };

  return (
    <Modal title={`Relancer — ${facture.numero}`} onClose={onClose}>
      <div style={{ marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{facture.client}</div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {fmt(facture.ttc)} TTC · Émise le {fmtDate(facture.date)}
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
        Un email de relance sera envoyé automatiquement au contact enregistré pour ce client, lui rappelant la facture en attente de règlement.
      </div>
      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#d1fae5' : '#fee2e2', color: msg.startsWith('✓') ? '#065f46' : '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          {msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Fermer</Btn>
        {!msg.startsWith('✓') && (
          <Btn onClick={handleRelance} disabled={loading}>
            {loading ? 'Envoi…' : '📧 Envoyer la relance'}
          </Btn>
        )}
      </div>
    </Modal>
  );
}

function SectionClients({ showModal, setShowModal }) {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ nom: '', siret_client: '', email: '', telephone: '', adresse: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiCall('/clients');
      if (res.ok) setClients(await res.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setMsg('');
    if (!form.nom.trim()) return setMsg('Nom client requis');
    try {
      const res = await apiCall('/clients', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setClients((rows) => [...rows, data].sort((a, b) => a.nom.localeCompare(b.nom)));
      setForm({ nom: '', siret_client: '', email: '', telephone: '', adresse: '' });
      setShowModal(false);
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>Nom</th>
              <th style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>SIRET</th>
              <th style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>Email</th>
              <th style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>Telephone</th>
              <th style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>Adresse</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: 28, color: '#64748b', textAlign: 'center' }}>Aucun client. Cliquez sur + Nouveau client.</td></tr>
            ) : clients.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>{c.nom}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12 }}>{c.siret_client || '-'}</td>
                <td style={{ padding: '12px 16px' }}>{c.email || '-'}</td>
                <td style={{ padding: '12px 16px' }}>{c.telephone || '-'}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{c.adresse || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="Nouveau client" onClose={() => setShowModal(false)}>
          {msg && <div style={{ color: '#991b1b', background: '#fee2e2', padding: 10, borderRadius: 8, marginBottom: 12 }}>{msg}</div>}
          <Field label="Nom client *"><input style={inputStyle} value={form.nom} onChange={set('nom')} placeholder="Acme Corp" /></Field>
          <Field label="SIRET client"><input style={inputStyle} value={form.siret_client} onChange={(e) => setForm({ ...form, siret_client: e.target.value.replace(/\D/g, '').slice(0, 14) })} placeholder="14 chiffres" /></Field>
          <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={set('email')} placeholder="contact@client.fr" /></Field>
          <Field label="Telephone"><input style={inputStyle} value={form.telephone} onChange={set('telephone')} placeholder="01 23 45 67 89" /></Field>
          <Field label="Adresse"><textarea style={{ ...inputStyle, minHeight: 72 }} value={form.adresse} onChange={set('adresse')} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setShowModal(false)}>Annuler</Btn>
            <Btn onClick={save} disabled={!form.nom.trim()}>Ajouter</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionFactures({ factures, setFactures, showModal, setShowModal }) {
  const [tab, setTab] = useState('TOUTES');
  const [avoirFacture, setAvoirFacture] = useState(null);
  const [relanceFacture, setRelanceFacture] = useState(null);
  const [clients, setClients] = useState([]);
  const tabs = ['TOUTES', 'BROUILLON', 'EMISE', 'EN_COURS', 'ACCEPTEE', 'REJETEE'];
  const filtered = tab === 'TOUTES' ? factures : factures.filter((f) => f.statut === tab);

  const loadClients = useCallback(async () => {
    try {
      const res = await apiCall('/clients');
      if (res.ok) setClients(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const refreshStatut = useCallback(
    async (id) => {
      try {
        const res = await apiCall(`/factures/${id}/statut`, { method: 'PATCH' });
        if (res.ok) {
          const data = await res.json();
          setFactures((fs) => fs.map((f) => (f.id === id ? { ...f, statut: data.statut } : f)));
          return;
        }
      } catch {}
      alert('Statut Chorus indisponible : connexion réelle non établie.');
    },
    [setFactures]
  );

  const handleSave = useCallback(
    async (form) => {
      try {
        if (form.create_client) {
          const clientRes = await apiCall('/clients', {
            method: 'POST',
            body: JSON.stringify({
              nom: form.client_nom,
              siret_client: form.client_siret,
              email: form.client_email,
              telephone: form.client_telephone,
              adresse: form.client_adresse,
            }),
          });
          if (clientRes.ok) {
            const createdClient = await clientRes.json();
            setClients((rows) => [...rows, createdClient].sort((a, b) => a.nom.localeCompare(b.nom)));
          }
        }
        const res = await apiCall('/factures', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const data = await res.json();
          setFactures((fs) => [data, ...fs]);
          return;
        }
      } catch {}
      alert('Facture non créée : serveur ou Chorus indisponible.');
    },
    [setFactures]
  );

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {showModal && (
        <ModalNouvelleFacture onClose={() => setShowModal(false)} onSave={handleSave} clients={clients} />
      )}
      {avoirFacture && (
        <ModalAvoir
          facture={avoirFacture}
          onClose={() => setAvoirFacture(null)}
          onCreated={() => setAvoirFacture(null)}
        />
      )}
      {relanceFacture && (
        <ModalRelance
          facture={relanceFacture}
          onClose={() => setRelanceFacture(null)}
        />
      )}
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          background: '#f1f5f9',
          borderRadius: 10,
          padding: 4,
          width: 'fit-content',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: tab === t ? 700 : 400,
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#4f46e5' : '#64748b',
              cursor: 'pointer',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t === 'TOUTES' ? 'Toutes' : <Badge statut={t} />}
          </button>
        ))}
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          overflow: 'auto',
        }}
      >
        <table style={{ minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8ecf0' }}>
              {['Numéro', 'Client', 'Date', 'Montant HT', 'TVA', 'TTC', 'Statut', 'Actions'].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: '11px 14px',
                      fontSize: 12,
                      color: '#64748b',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 14,
                  }}
                >
                  Aucune facture dans cette catégorie
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
                  {f.numero}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>{f.client}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>
                  {fmtDate(f.date)}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>{fmt(f.montantHT)}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>{fmt(f.tva)}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{fmt(f.ttc)}</td>
                <td style={{ padding: '12px 14px' }}>
                  <Badge statut={f.statut} />
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    <Btn
                      variant="ghost"
                      onClick={() => refreshStatut(f.id)}
                      style={{ padding: '5px 8px', fontSize: 11 }}
                    >
                      🔄
                    </Btn>
                    {['EMISE', 'EN_COURS'].includes(f.statut) && (
                      <Btn
                        variant="ghost"
                        onClick={() => setRelanceFacture(f)}
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        title="Envoyer une relance"
                      >
                        📧
                      </Btn>
                    )}
                    {f.statut === 'ACCEPTEE' && (
                      <Btn
                        variant="ghost"
                        onClick={() => setAvoirFacture(f)}
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        title="Créer un avoir"
                      >
                        ➖ Avoir
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section Revenus ──────────────────────────────────────────────────────────
function ModalRevenuManuel({ onClose, onSave }) {
  const [form, setForm] = useState({
    libelle: '',
    client: '',
    ttc: '',
    tauxTVA: 20,
    date: new Date().toISOString().slice(0, 10),
  });
  const ttcVal = parseFloat(form.ttc) || 0;
  const tva = (ttcVal * Number(form.tauxTVA)) / (100 + Number(form.tauxTVA));
  const ht = ttcVal - tva;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title="Revenu manuel" onClose={onClose}>
      <Field label="Libellé *">
        <input
          style={inputStyle}
          placeholder="Consultance décembre"
          value={form.libelle}
          onChange={set('libelle')}
        />
      </Field>
      <Field label="Client">
        <input
          style={inputStyle}
          placeholder="Nom du client"
          value={form.client}
          onChange={set('client')}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Montant TTC (€)">
          <input
            style={inputStyle}
            type="number"
            placeholder="1200"
            value={form.ttc}
            onChange={set('ttc')}
          />
        </Field>
        <Field label="Taux TVA">
          <select style={inputStyle} value={form.tauxTVA} onChange={set('tauxTVA')}>
            {TVA_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input style={inputStyle} type="date" value={form.date} onChange={set('date')} />
        </Field>
      </div>
      <div
        style={{
          background: '#f8fafc',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: '#64748b',
        }}
      >
        HT: <strong>{fmt(ht)}</strong> · TVA: <strong>{fmt(tva)}</strong>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>
          Annuler
        </Btn>
        <Btn
          onClick={() => {
            onSave({ ...form, montantHT: ht, tva, ttc: ttcVal });
            onClose();
          }}
          disabled={!form.libelle || !form.ttc}
        >
          Enregistrer
        </Btn>
      </div>
    </Modal>
  );
}

function SectionRevenus({ revenus, setRevenus, showModal, setShowModal }) {
  const encaisses = revenus.filter((r) => r.statut === 'ENCAISSE');
  const enAttente = revenus.filter((r) => r.statut === 'EN_ATTENTE');
  const totalEncaisse = encaisses.reduce((s, r) => s + r.ttc, 0);
  const totalAttente = enAttente.reduce((s, r) => s + r.ttc, 0);
  const panier = encaisses.length ? totalEncaisse / encaisses.length : 0;

  const handleSave = async (form) => {
    try {
      const res = await apiCall('/finances/revenus', {
        method: 'POST',
        body: JSON.stringify({
          libelle:           form.libelle || form.client || 'Revenu manuel',
          montant_ttc:       form.ttc,
          tva_taux:          form.tauxTVA,
          date_encaissement: form.date,
          client_nom:        form.client || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevenus((rs) => [normRevenu(data), ...rs]);
        return;
      }
    } catch {}
    alert('Revenu non créé : serveur indisponible.');
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {showModal && <ModalRevenuManuel onClose={() => setShowModal(false)} onSave={handleSave} />}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <KpiCard icon="💰" label="Total encaissé" value={fmt(totalEncaisse)} variation={8.2} color="#10b981" />
        <KpiCard icon="⏳" label="En attente" value={fmt(totalAttente)} color="#f59e0b" />
        <KpiCard icon="🧾" label="Nb revenus" value={encaisses.length} variation={2} color="#4f46e5" />
        <KpiCard icon="📊" label="Panier moyen" value={fmt(panier)} color="#6366f1" />
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          overflow: 'auto',
        }}
      >
        <table style={{ minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8ecf0' }}>
              {['Date', 'Source', 'Client', 'Montant HT', 'TVA', 'TTC', 'Statut'].map((h) => (
                <th
                  key={h}
                  style={{ padding: '11px 14px', fontSize: 12, color: '#64748b', fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {revenus.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>
                  {fmtDate(r.date)}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>{r.source}</td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>{r.client}</td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>{fmt(r.montantHT)}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>{fmt(r.tva)}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{fmt(r.ttc)}</td>
                <td style={{ padding: '12px 14px' }}>
                  <Badge statut={r.statut} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section Dépenses ─────────────────────────────────────────────────────────
const CATEGORIES = [
  'Hébergement',
  'Fournitures',
  'Transport',
  'Logiciels',
  'Restaurant',
  'Marketing',
  'RH',
  'Autre',
];
const CAT_ICONS = {
  Hébergement: '🖥️',
  Fournitures: '📎',
  Transport: '🚆',
  Logiciels: '💻',
  Restaurant: '🍽️',
  Marketing: '📣',
  RH: '👥',
  Autre: '📦',
};

function ModalNouvelleDepense({ onClose, onSave }) {
  const [form, setForm] = useState({
    libelle: '',
    categorie: 'Autre',
    ttc: '',
    tauxTVA: 20,
    date: new Date().toISOString().slice(0, 10),
    justificatif: '',
  });
  const ttcVal = parseFloat(form.ttc) || 0;
  const tva = (ttcVal * Number(form.tauxTVA)) / (100 + Number(form.tauxTVA));
  const ht = ttcVal - tva;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title="Nouvelle Dépense" onClose={onClose}>
      <Field label="Libellé *">
        <input
          style={inputStyle}
          placeholder="Abonnement logiciel"
          value={form.libelle}
          onChange={set('libelle')}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Catégorie">
          <select style={inputStyle} value={form.categorie} onChange={set('categorie')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input style={inputStyle} type="date" value={form.date} onChange={set('date')} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Montant TTC (€) *">
          <input
            style={inputStyle}
            type="number"
            placeholder="120"
            value={form.ttc}
            onChange={set('ttc')}
          />
        </Field>
        <Field label="Taux TVA">
          <select style={inputStyle} value={form.tauxTVA} onChange={set('tauxTVA')}>
            {TVA_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="URL Justificatif">
        <input
          style={inputStyle}
          placeholder="https://…"
          value={form.justificatif}
          onChange={set('justificatif')}
        />
      </Field>
      <div
        style={{
          background: '#f8fafc',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 13,
          color: '#64748b',
        }}
      >
        HT: <strong>{fmt(ht)}</strong> · TVA déductible: <strong>{fmt(tva)}</strong>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>
          Annuler
        </Btn>
        <Btn
          onClick={() => {
            onSave({ ...form, montantHT: ht, tva, ttc: ttcVal });
            onClose();
          }}
          disabled={!form.libelle || !form.ttc}
        >
          Enregistrer
        </Btn>
      </div>
    </Modal>
  );
}

function SectionDepenses({ depenses, setDepenses, showModal, setShowModal }) {
  const total = depenses.reduce((s, d) => s + d.ttc, 0);
  const tvaDed = depenses.reduce((s, d) => s + d.tva, 0);
  const moy = depenses.length ? total / depenses.length : 0;

  const byCat = CATEGORIES.map((c) => {
    const items = depenses.filter((d) => d.categorie === c);
    const montant = items.reduce((s, d) => s + d.ttc, 0);
    return { cat: c, montant, pct: total ? (montant / total) * 100 : 0 };
  })
    .filter((c) => c.montant > 0)
    .sort((a, b) => b.montant - a.montant);

  const handleSave = async (form) => {
    try {
      const res = await apiCall('/finances/depenses', {
        method: 'POST',
        body: JSON.stringify({
          libelle:         form.libelle,
          montant_ttc:     form.ttc,
          tva_taux:        form.tauxTVA,
          date_depense:    form.date,
          justificatif_url: form.justificatif || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDepenses((ds) => [normDepense(data), ...ds]);
        return;
      }
    } catch {}
    alert('Dépense non créée : serveur indisponible.');
  };

  const handleDelete = async (id) => {
    try {
      await apiCall(`/finances/depenses/${id}`, { method: 'DELETE' });
    } catch {}
    setDepenses((ds) => ds.filter((d) => d.id !== id));
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {showModal && (
        <ModalNouvelleDepense onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <KpiCard icon="💸" label="Total dépenses" value={fmt(total)} variation={-5.3} color="#ef4444" />
        <KpiCard icon="📋" label="TVA déductible" value={fmt(tvaDed)} color="#4f46e5" />
        <KpiCard icon="🗂️" label="Nb dépenses" value={depenses.length} color="#f59e0b" />
        <KpiCard icon="📊" label="Charge moyenne" value={fmt(moy)} color="#6366f1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
        {/* Répartition catégories */}
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            alignSelf: 'start',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Par catégorie</h2>
          {byCat.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>Aucune dépense enregistrée</p>
          )}
          {byCat.map((c) => (
            <div key={c.cat} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{CAT_ICONS[c.cat] || '📦'}</span>
                  {c.cat}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {fmt(c.montant)}
                </span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                <div className="progress-fill" style={{ width: `${c.pct}%`, background: '#ef4444' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Table dépenses */}
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            overflow: 'auto',
          }}
        >
          <table style={{ minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8ecf0' }}>
                {['Date', 'Libellé', 'Catégorie', 'Montant HT', 'TVA', 'TTC', ''].map((h, i) => (
                  <th
                    key={i}
                    style={{ padding: '11px 14px', fontSize: 12, color: '#64748b', fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depenses.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>
                    {fmtDate(d.date)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{d.libelle}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12 }}>
                    <span
                      style={{
                        background: '#f1f5f9',
                        padding: '3px 8px',
                        borderRadius: 6,
                        color: '#374151',
                      }}
                    >
                      {d.categorie}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{fmt(d.montantHT)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>
                    {fmt(d.tva)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{fmt(d.ttc)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      onClick={() => handleDelete(d.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 16,
                        color: '#ef4444',
                        padding: '2px 6px',
                        borderRadius: 6,
                      }}
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section TVA ──────────────────────────────────────────────────────────────
const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function SectionTVA({ factures, depenses, company }) {
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [ca3Loading, setCa3Loading] = useState(false);
  const [ca3Msg, setCa3Msg] = useState('');
  const [tvaHistory, setTvaHistory] = useState([]);

  useEffect(() => {
    if (!company?.siret) return;
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    Promise.all(
      months.map((m) =>
        apiCall(`/finances/vat-summary/${company.siret}?mois=${m}`)
          .then((r) => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then((results) => {
      setTvaHistory(results.filter(Boolean).map((r) => ({
        periode: r.periode,
        collectee: r.tva_collectee,
        deductible: r.tva_deductible,
        montant: r.tva_a_reverser,
        statut: r.tva_a_reverser > 0 ? 'A_REVERSER' : 'DECLAREE',
      })));
    });
  }, [company]);

  const exportCA3 = async () => {
    if (!company?.siret) { setCa3Msg('SIRET introuvable'); return; }
    setCa3Loading(true);
    setCa3Msg('');
    const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;
    try {
      const res = await apiCall(`/finances/ca3/${company.siret}?mois=${moisStr}`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CA3_${moisStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setCa3Msg('✓ Fichier CA3 téléchargé');
      } else {
        const err = await res.json().catch(() => ({}));
        setCa3Msg(err.error || 'Erreur lors de l\'export');
      }
    } catch {
      setCa3Msg('Erreur réseau');
    }
    setCa3Loading(false);
  };

  // Filtrage par période sélectionnée
  const tvaCollectee = factures
    .filter((f) => {
      if (f.statut !== 'ACCEPTEE') return false;
      const d = new Date(f.date_emission || f.date);
      return d.getFullYear() === annee && d.getMonth() + 1 === mois;
    })
    .reduce((s, f) => s + (f.tva || (f.montant_ttc - f.montant_ht) || 0), 0);
  const tvaDeductible = depenses
    .filter((d) => {
      const date = new Date(d.date_depense || d.date);
      return date.getFullYear() === annee && date.getMonth() + 1 === mois;
    })
    .reduce((s, d) => s + (d.tva || (d.montant_ttc - d.montant_ht) || 0), 0);
  const tvaReverse = tvaCollectee - tvaDeductible;

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {/* Sélecteur période */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
        <select
          style={{ ...inputStyle, width: 140 }}
          value={mois}
          onChange={(e) => setMois(Number(e.target.value))}
        >
          {MOIS_LABELS.map((m, i) => (
            <option key={i + 1} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          style={{ ...inputStyle, width: 100 }}
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
        >
          {[2022, 2023, 2024, 2025, 2026].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Btn
          onClick={exportCA3}
          disabled={ca3Loading}
          style={{ background: '#10b981', color: '#fff' }}
        >
          {ca3Loading ? '⏳ Export…' : '📥 Exporter CA3'}
        </Btn>
        {ca3Msg && (
          <span style={{ fontSize: 13, color: ca3Msg.startsWith('✓') ? '#065f46' : '#991b1b', fontWeight: 600 }}>
            {ca3Msg}
          </span>
        )}
      </div>

      {/* 3 grandes cards TVA */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
          marginBottom: 32,
        }}
      >
        {[
          {
            label: 'TVA Collectée',
            value: tvaCollectee,
            color: '#10b981',
            bg: '#d1fae5',
            icon: '📈',
            desc: 'Sur factures acceptées',
          },
          {
            label: 'TVA Déductible',
            value: tvaDeductible,
            color: '#4f46e5',
            bg: '#e0e7ff',
            icon: '📉',
            desc: 'Sur vos dépenses',
          },
          {
            label: 'TVA à Reverser',
            value: tvaReverse,
            color: tvaReverse > 0 ? '#ef4444' : '#10b981',
            bg: tvaReverse > 0 ? '#fee2e2' : '#d1fae5',
            icon: '💳',
            desc:
              tvaReverse > 0
                ? "À déclarer à l'administration"
                : 'Crédit TVA',
          },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: c.bg,
              borderRadius: 16,
              padding: '28px 24px',
              border: `2px solid ${c.color}30`,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{c.icon}</div>
            <div style={{ fontSize: 13, color: c.color, fontWeight: 600, marginBottom: 6 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: c.color }}>{fmt(c.value)}</div>
            <div style={{ fontSize: 12, color: c.color + 'aa', marginTop: 8 }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Formule visuelle */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '20px 28px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, color: '#10b981', fontSize: 20 }}>{fmt(tvaCollectee)}</span>
        <span style={{ color: '#94a3b8', fontSize: 22 }}>−</span>
        <span style={{ fontWeight: 700, color: '#4f46e5', fontSize: 20 }}>{fmt(tvaDeductible)}</span>
        <span style={{ color: '#94a3b8', fontSize: 22 }}>=</span>
        <span
          style={{
            fontWeight: 800,
            color: tvaReverse > 0 ? '#ef4444' : '#10b981',
            fontSize: 22,
          }}
        >
          {fmt(tvaReverse)}
        </span>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          TVA collectée − TVA déductible = TVA à reverser
        </span>
      </div>

      {/* Historique déclarations */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Historique des déclarations
        </div>
        <table>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8ecf0' }}>
              {['Période', 'TVA Collectée', 'TVA Déductible', 'Montant', 'Statut'].map((h) => (
                <th
                  key={h}
                  style={{ padding: '11px 16px', fontSize: 12, color: '#64748b', fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tvaHistory.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{row.periode}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#10b981' }}>
                  {fmt(row.collectee)}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#4f46e5' }}>
                  {fmt(row.deductible)}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>
                  {fmt(row.montant)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge statut={row.statut} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section Récurrentes ──────────────────────────────────────────────────────
const FREQ_LABELS = {
  MENSUEL: 'Mensuel', BIMESTRIEL: 'Bimestriel', TRIMESTRIEL: 'Trimestriel',
  SEMESTRIEL: 'Semestriel', ANNUEL: 'Annuel',
};

function ModalNouveauModele({ onClose, onSave }) {
  const [form, setForm] = useState({
    client: '', description: '', montantHT: '', tauxTVA: 20, frequence: 'MENSUEL',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ht = parseFloat(form.montantHT) || 0;
  const tva = ht * Number(form.tauxTVA) / 100;

  const handleSave = () => {
    if (!form.client || !form.montantHT) return;
    onSave({ ...form, montantHT: ht, tva, ttc: ht + tva, tauxTVA: Number(form.tauxTVA) });
    onClose();
  };

  return (
    <Modal title="Nouveau modèle récurrent" onClose={onClose}>
      <Field label="Client *">
        <input style={inputStyle} placeholder="Acme Corp" value={form.client} onChange={set('client')} />
      </Field>
      <Field label="Description">
        <input style={inputStyle} placeholder="Abonnement maintenance" value={form.description} onChange={set('description')} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Montant HT (€) *">
          <input style={inputStyle} type="number" placeholder="500" value={form.montantHT} onChange={set('montantHT')} />
        </Field>
        <Field label="Taux TVA">
          <select style={inputStyle} value={form.tauxTVA} onChange={set('tauxTVA')}>
            {TVA_RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Fréquence">
        <select style={inputStyle} value={form.frequence} onChange={set('frequence')}>
          {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#64748b' }}>
        {fmt(ht)} HT + {fmt(tva)} TVA = <strong style={{ color: '#4f46e5' }}>{fmt(ht + tva)} TTC</strong> · {FREQ_LABELS[form.frequence]}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
        <Btn onClick={handleSave} disabled={!form.client || !form.montantHT}>Créer le modèle</Btn>
      </div>
    </Modal>
  );
}

function SectionRecurrentes({ showModal, setShowModal, company }) {
  const [modeles, setModeles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.siret) return;
    apiCall(`/factures/recurrentes`)
      .then((r) => r.ok ? r.json() : [])
      .then(setModeles)
      .catch(() => setModeles([]))
      .finally(() => setLoading(false));
  }, [company]);

  const handleSave = async (form) => {
    try {
      const res = await apiCall('/factures/recurrentes', {
        method: 'POST',
        body: JSON.stringify({ ...form, siret: company?.siret }),
      });
      if (res.ok) {
        const data = await res.json();
        setModeles((m) => [data, ...m]);
        return;
      }
    } catch {}
    // Fallback local
    setModeles((m) => [{
      id: Date.now(), ...form, actif: true,
      prochaine_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    }, ...m]);
  };

  const toggleActif = async (id, actif) => {
    try {
      const res = await apiCall(`/factures/recurrentes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ actif: !actif }),
      });
      if (res.ok) {
        setModeles((m) => m.map((r) => r.id === id ? { ...r, actif: !actif } : r));
        return;
      }
    } catch {}
    setModeles((m) => m.map((r) => r.id === id ? { ...r, actif: !actif } : r));
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {showModal && (
        <ModalNouveauModele onClose={() => setShowModal(false)} onSave={handleSave} />
      )}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Chargement…</div>
      ) : modeles.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: '48px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔁</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Aucun modèle récurrent</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Créez un modèle pour générer automatiquement vos factures périodiques.</div>
          <Btn onClick={() => setShowModal(true)}>+ Créer un modèle</Btn>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'auto' }}>
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8ecf0' }}>
                {['Client', 'Description', 'Montant HT', 'Fréquence', 'Prochaine date', 'Statut', 'Action'].map((h) => (
                  <th key={h} style={{ padding: '11px 14px', fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modeles.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: r.actif ? 1 : 0.55 }}>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{r.client}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>{r.description || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{fmt(r.montant_ht || r.montantHT)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>{FREQ_LABELS[r.frequence] || r.frequence}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>{fmtDate(r.prochaine_date)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ background: r.actif ? '#d1fae5' : '#f1f5f9', color: r.actif ? '#065f46' : '#64748b', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      {r.actif ? 'Actif' : 'Pausé'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <Btn
                      variant={r.actif ? 'ghost' : 'success'}
                      onClick={() => toggleActif(r.id, r.actif)}
                      style={{ padding: '5px 10px', fontSize: 12 }}
                    >
                      {r.actif ? '⏸ Pause' : '▶ Activer'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Config plans Stripe ──────────────────────────────────────────────────────
const PLANS_CONFIG = {
  gratuit:  { label: 'Gratuit',  price: 0,   color: '#64748b', bg: '#f1f5f9' },
  solo:     { label: 'Solo',     price: 14,  color: '#0891b2', bg: '#e0f2fe' },
  pro:      { label: 'Pro',      price: 34,  color: '#4f46e5', bg: '#ede9fe' },
  equipe:   { label: 'Équipe',   price: 69,  color: '#7c3aed', bg: '#f3e8ff' },
  business: { label: 'Business', price: 149, color: '#dc2626', bg: '#fee2e2' },
};
const UPGRADE_PLANS = ['solo', 'pro', 'equipe', 'business'];

// ─── Section Paramètres ───────────────────────────────────────────────────────
function SectionParametres({ company }) {
  const [form, setForm] = useState({
    siret:     company?.siret     || '',
    nom:       company?.nom       || '',
    email:     company?.email     || '',
    telephone: company?.telephone || '',
    adresse:   company?.adresse   || '',
  });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Plan & essai — chargés depuis /auth/me
  const [planInfo, setPlanInfo]             = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState('');
  const [portalLoading, setPortalLoading]   = useState(false);

  // Charger les vraies données depuis l'API
  useEffect(() => {
    if (!company?.siret) return;
    apiCall(`/entreprises/${company.siret}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setForm({
          siret:     data.siret     || company.siret,
          nom:       data.nom       || company.nom,
          email:     data.email     || '',
          telephone: data.telephone || '',
          adresse:   data.adresse   || '',
        });
      })
      .catch(() => {});

    // Plan + trial depuis /auth/me
    apiCall('/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPlanInfo(data); })
      .catch(() => {});
  }, [company]);

  const handleUpgrade = async (plan) => {
    setUpgradeLoading(plan);
    try {
      const res = await apiCall('/stripe/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else alert(data.error || 'Erreur Stripe');
    } catch { alert('Erreur réseau'); }
    setUpgradeLoading('');
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await apiCall('/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) window.open(data.url, '_blank');
      else alert(data.error || 'Portail indisponible');
    } catch { alert('Erreur réseau'); }
    setPortalLoading(false);
  };

  const handleSave = async () => {
    try {
      // POST /entreprises fait un upsert (siret unique)
      await apiCall('/entreprises', {
        method: 'POST',
        body: JSON.stringify({ siret: form.siret, nom: form.nom, email: form.email }),
      });
    } catch {}
    localStorage.setItem('fe_company', JSON.stringify({ siret: form.siret, nom: form.nom, email: form.email }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Infos entreprise */}
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '28px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
            Informations entreprise
          </h2>
          <Field label="SIRET">
            <input
              style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }}
              value={form.siret}
              readOnly
            />
          </Field>
          <Field label="Nom de l'entreprise">
            <input style={inputStyle} value={form.nom} onChange={set('nom')} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Email">
              <input style={inputStyle} type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Téléphone">
              <input style={inputStyle} value={form.telephone} onChange={set('telephone')} />
            </Field>
          </div>
          <Field label="Adresse">
            <input style={inputStyle} value={form.adresse} onChange={set('adresse')} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Btn onClick={handleSave}>Sauvegarder</Btn>
            {saved && (
              <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>✓ Sauvegardé</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Abonnement */}
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '24px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Abonnement</h2>
              {planInfo && (() => {
                const plan   = planInfo.plan || 'gratuit';
                const cfg    = PLANS_CONFIG[plan] || PLANS_CONFIG.gratuit;
                const isTrialing = planInfo.trial_ends_at && new Date(planInfo.trial_ends_at) > new Date();
                return (
                  <span style={{ background: isTrialing ? '#fef9c3' : cfg.bg, color: isTrialing ? '#854d0e' : cfg.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    {isTrialing ? '⏳ Essai' : (plan === 'gratuit' ? 'Gratuit' : 'Actif')}
                  </span>
                );
              })()}
            </div>

            {planInfo ? (() => {
              const plan = planInfo.plan || 'gratuit';
              const cfg  = PLANS_CONFIG[plan] || PLANS_CONFIG.gratuit;
              const trialEnd = planInfo.trial_ends_at ? new Date(planInfo.trial_ends_at) : null;
              const isTrialing = trialEnd && trialEnd > new Date();
              const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)) : 0;

              return (
                <>
                  <div style={{ fontSize: 26, fontWeight: 800, color: cfg.color, marginBottom: 4 }}>
                    {cfg.label}
                  </div>
                  {cfg.price > 0 ? (
                    <div style={{ fontSize: 18, color: '#0f172a', fontWeight: 600, marginBottom: 8 }}>
                      {cfg.price} €{' '}
                      <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}>/ mois HT</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Sans engagement</div>
                  )}
                  {isTrialing && (
                    <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#854d0e', marginBottom: 12 }}>
                      🎁 Essai gratuit — encore <strong>{daysLeft} jour{daysLeft > 1 ? 's' : ''}</strong> (fin le {trialEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })})
                    </div>
                  )}
                  {/* Boutons upgrade vers les plans supérieurs */}
                  {UPGRADE_PLANS.filter((p) => PLANS_CONFIG[p].price > (cfg.price || 0)).map((p) => {
                    const c = PLANS_CONFIG[p];
                    return (
                      <button
                        key={p}
                        onClick={() => handleUpgrade(p)}
                        disabled={upgradeLoading === p}
                        style={{ display: 'block', width: '100%', marginBottom: 8, padding: '9px 14px', background: c.bg, color: c.color, border: `1px solid ${c.color}30`, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                      >
                        {upgradeLoading === p ? '…' : `↑ Passer en ${c.label} — ${c.price} €/mois`}
                      </button>
                    );
                  })}
                  {/* Portail Stripe uniquement si abonnement actif */}
                  {plan !== 'gratuit' && (
                    <Btn variant="ghost" onClick={handlePortal} style={{ marginTop: 4 }}>
                      {portalLoading ? '…' : 'Gérer l\'abonnement →'}
                    </Btn>
                  )}
                </>
              );
            })() : (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Chargement…</div>
            )}
          </div>

          {/* Accès API Chorus Pro */}
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '24px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
              Accès API Chorus Pro
            </h2>
            <ChorusStatus />
          </div>

          {/* Expert-comptable */}
          <InviteComptable company={company} />
        </div>
      </div>
    </div>
  );
}

// ─── InviteComptable ──────────────────────────────────────────────────────────
function InviteComptable({ company }) {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  const handleInvite = async () => {
    setLoading(true);
    setToken('');
    setMsg('');
    try {
      const res = await apiCall('/auth/invite-comptable', {
        method: 'POST',
        body: JSON.stringify({ siret: company?.siret }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token || '');
        setMsg('✓ Lien d\'invitation généré (valide 7 jours)');
      } else {
        setMsg(data.error || 'Erreur lors de la génération');
      }
    } catch {
      setMsg('Erreur réseau');
    }
    setLoading(false);
  };

  const copyLink = () => {
    const link = `${window.location.origin}/login-comptable?token=${token}`;
    navigator.clipboard.writeText(link).then(() => setMsg('✓ Lien copié dans le presse-papiers'));
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>👤 Expert-comptable</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
        Donnez accès en lecture seule à votre comptable. Il pourra consulter vos factures, revenus et dépenses sans pouvoir les modifier.
      </p>
      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#d1fae5' : '#fee2e2', color: msg.startsWith('✓') ? '#065f46' : '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          {msg}
        </div>
      )}
      {token && (
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 12, color: '#374151' }}>
          {`${window.location.origin}/login-comptable?token=${token}`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={handleInvite} disabled={loading} variant="ghost">
          {loading ? 'Génération…' : '🔗 Générer le lien d\'invitation'}
        </Btn>
        {token && (
          <Btn onClick={copyLink} variant="success">
            📋 Copier le lien
          </Btn>
        )}
      </div>
    </div>
  );
}

// ─── Onboarding Wizard ────────────────────────────────────────────────────────
function SectionComptable({ company }) {
  const [exportMsg, setExportMsg] = useState('');
  const handleExport = async () => {
    setExportMsg('');
    try {
      await downloadApiFile('/exports/factures.csv', `factures_${company?.siret || 'export'}.csv`);
      setExportMsg('Export téléchargé.');
    } catch (e) {
      setExportMsg(e.message || 'Export impossible.');
    }
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px', display: 'grid', gap: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Espace expert-comptable</h2>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, maxWidth: 720 }}>
          Invitez votre comptable en lecture seule. Il peut consulter factures, dépenses et TVA sans modifier vos données.
        </p>
      </div>
      <InviteComptable company={company} />
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Exports</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>CSV factures pour suivi comptable simple.</p>
        <Btn onClick={handleExport}>Télécharger factures CSV</Btn>
        {exportMsg && <div style={{ marginTop: 10, fontSize: 13, color: exportMsg.includes('impossible') ? '#dc2626' : '#047857' }}>{exportMsg}</div>}
      </div>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, fontSize: 13, color: '#475569' }}>
        Accès prévu : factures, dépenses, TVA et exports. Mutations bloquées côté API pour le rôle comptable.
      </div>
    </div>
  );
}

const ONBOARDING_STEPS = [
  { key: 'video',    icon: '🎬', title: 'Regarder la vidéo de bienvenue', desc: '2 min pour comprendre FacturEasy et Chorus Pro', cta: 'Voir la vidéo →', link: 'https://factureasy.fr/guides' },
  { key: 'chorus',   icon: '🔗', title: 'Connecter Chorus Pro', desc: 'Renseignez votre SIRET dans les Paramètres pour activer la connexion', cta: 'Accéder aux Paramètres', nav: 'parametres' },
  { key: 'facture',  icon: '🧾', title: 'Créer votre première facture', desc: 'Moins de 2 minutes. Elle sera transmise automatiquement au Portail Public de Facturation', cta: 'Créer une facture', nav: 'factures' },
];

const PRODUCT_ONBOARDING_STEPS = [
  { key: 'entreprise', icon: '🏢', title: 'Mon entreprise', desc: 'Vérifier SIRET, email, TVA et activité.', cta: 'Ouvrir paramètres', nav: 'parametres' },
  { key: 'objectif',   icon: '🎯', title: 'Mon objectif', desc: 'Facturer, suivre trésorerie, préparer 2026 ou inviter comptable.', cta: 'Voir cockpit', nav: 'dashboard' },
  { key: 'clients',    icon: '👥', title: 'Mes clients', desc: 'Créer un client maintenant ou importer plus tard.', cta: 'Créer client', nav: 'clients' },
  { key: 'facture',    icon: '🧾', title: 'Ma première facture', desc: 'Créer une facture brouillon, envoyée ou payée.', cta: 'Créer facture', nav: 'factures' },
  { key: 'cockpit',    icon: '📊', title: 'Mon cockpit', desc: 'Voir actions prioritaires, cashflow et conformité.', cta: 'Ouvrir cockpit', nav: 'dashboard' },
];

function OnboardingWizard({ company, onClose, onNav }) {
  const saved = JSON.parse(localStorage.getItem('fe_onboarding') || '{}');
  const [done, setDone] = useState(saved);

  const markDone = (key) => {
    const next = { ...done, [key]: true };
    setDone(next);
    localStorage.setItem('fe_onboarding', JSON.stringify(next));
  };

  const allDone = PRODUCT_ONBOARDING_STEPS.every((s) => done[s.key]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="fade-in" style={{ background: '#fff', borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 500, boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💼</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            Bienvenue, {company?.nom?.split(' ')[0] || 'chez vous'} !
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
            3 étapes pour émettre votre première facture électronique.<br />
            Tout est expliqué — aucun appel nécessaire.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {PRODUCT_ONBOARDING_STEPS.map((step, i) => {
            const isComplete = done[step.key];
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 14, background: isComplete ? '#f0fdf4' : '#f8fafc', borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${isComplete ? '#86efac' : '#e2e8f0'}` }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isComplete ? '#4ade80' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isComplete ? 18 : 14, flexShrink: 0, fontWeight: 700, color: isComplete ? '#fff' : '#64748b' }}>
                  {isComplete ? '✓' : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{step.icon} {step.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{step.desc}</div>
                </div>
                {(!isComplete || step.nav || step.link) && (
                  <button
                    onClick={() => {
                      markDone(step.key);
                      if (step.nav) { onNav(step.nav); onClose(); }
                      else if (step.link) window.open(step.link, '_blank');
                    }}
                    style={{
                      background: isComplete ? '#fff' : '#4f46e5',
                      color: isComplete ? '#4f46e5' : '#fff',
                      border: isComplete ? '1px solid #c7d2fe' : 'none',
                      borderRadius: 8,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {isComplete ? (step.nav ? 'Ouvrir' : 'Revoir') : step.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {PRODUCT_ONBOARDING_STEPS.filter((s) => done[s.key]).length}/{PRODUCT_ONBOARDING_STEPS.length} étapes complètes
          </span>
          <button onClick={onClose} style={{ background: allDone ? '#4f46e5' : '#f1f5f9', color: allDone ? '#fff' : '#374151', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {allDone ? '🎉 Commencer →' : 'Passer pour l\'instant'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Statut Chorus Pro (dynamique) ───────────────────────────────────────────
function ChorusStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setStatus(d?.chorus || { process_ok: Boolean(d?.ok), configured: false, connected: false }))
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'checking') return (
    <div style={{ padding: '14px', background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#64748b' }}>
      Vérification de la connexion Chorus Pro…
    </div>
  );
  if (status.connected) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: '#d1fae5', borderRadius: 10 }}>
      <span style={{ fontSize: 20 }}>✅</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>Connexion Chorus Pro établie</div>
        <div style={{ fontSize: 12, color: '#047857' }}>Identifiants vérifiés avec le portail</div>
      </div>
    </div>
  );
  if (status.process_ok) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: '#e0f2fe', borderRadius: 10 }}>
      <span style={{ fontSize: 20 }}>ℹ️</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#075985' }}>Processus Chorus prêt — connexion non établie</div>
        <div style={{ fontSize: 12, color: '#0369a1' }}>Mode test local : aucune société réelle ni identifiants Chorus Pro vérifiés.</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: '#fef3c7', borderRadius: 10 }}>
      <span style={{ fontSize: 20 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>Non configuré</div>
        <div style={{ fontSize: 12, color: '#b45309' }}>Identifiants Chorus Pro à renseigner dans les paramètres Railway</div>
      </div>
    </div>
  );
}


// ─── Section Plans & abonnement ──────────────────────────────────────────────
function RegulatoryEventsPanel() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/regulatory-events?limit=20')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', gridColumn: '1 / -1' }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Historique conformité</h3>
      {loading ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Chargement…</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Aucun événement réglementaire pour le moment.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>{ev.channel}</strong>
                <span style={{ fontSize: 11, color: ev.status === 'SENT' ? '#047857' : '#475569', fontWeight: 800 }}>{ev.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Facture #{ev.invoice_id || '-'} · {ev.created_at ? fmtDate(ev.created_at) : ''}</div>
              {ev.error_message && <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{ev.error_message}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionChorus({ company, onNav }) {
  return (
    <div className="fade-in" style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Connexion Chorus Pro</h2>
        <ChorusStatus />
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          <div style={{ padding: 16, background: '#fff7ed', borderRadius: 10, border: '1px solid #fed7aa' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>Important</div>
            <div style={{ fontSize: 14, color: '#9a3412' }}>Ajouter un vrai client ne connecte pas Chorus Pro. Il faut des identifiants API Chorus Pro réels et une société vérifiée côté portail.</div>
          </div>
          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>SIRET entreprise</div>
            <div style={{ fontSize: 14, color: '#475569' }}>{company?.siret || 'Non renseigné'}</div>
          </div>
          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Transmission</div>
            <div style={{ fontSize: 14, color: '#475569' }}>Les factures créées ici sont préparées pour dépôt Chorus Pro.</div>
          </div>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Actions</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <Btn onClick={() => onNav('factures')}>Créer une facture</Btn>
          <Btn variant="ghost" onClick={() => onNav('parametres')}>Ouvrir paramètres</Btn>
        </div>
      </div>
      <RegulatoryEventsPanel />
    </div>
  );
}

function SectionPlans({ company }) {
  const [planInfo, setPlanInfo] = useState(null);
  const [loading, setLoading] = useState('');
  const [stripeError, setStripeError] = useState('');

  useEffect(() => {
    apiCall('/auth/me').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setPlanInfo(d); }).catch(() => {});
  }, [company]);

  const plans = [
    { key: 'solo',     label: 'Solo',     price: 14,  color: '#0891b2', bg: '#e0f2fe', features: ['1 utilisateur','50 factures/mois','Relances auto','Export CA3 TVA','Support email'] },
    { key: 'pro',      label: 'Pro',      price: 34,  color: '#4f46e5', bg: '#ede9fe', features: ['3 utilisateurs','Illimité','Factures récurrentes','Accès comptable','Support prioritaire'], popular: true },
    { key: 'equipe',   label: 'Équipe',   price: 69,  color: '#7c3aed', bg: '#f3e8ff', features: ['10 utilisateurs','Multi-sites','Chorus Pro direct','API accès','SLA 99,5%'] },
    { key: 'business', label: 'Business', price: 149, color: '#dc2626', bg: '#fee2e2', features: ['Illimité','Chorus Pro direct','SLA 99,9%','Onboarding dédié','Support téléphone'] },
  ];

  const currentPlan = planInfo?.plan || 'gratuit';
  const isTrialing  = planInfo?.trial_ends_at && new Date(planInfo.trial_ends_at) > new Date();
  const trialEnd    = planInfo?.trial_ends_at ? new Date(planInfo.trial_ends_at) : null;
  const daysLeft    = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : 0;

  const handleSelect = async (planKey) => {
    setLoading(planKey);
    setStripeError('');
    try {
      const res = await apiCall('/stripe/create-checkout-session', { method: 'POST', body: JSON.stringify({ plan: planKey }) });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setStripeError(data.error || 'Erreur lors de la création de la session de paiement');
    } catch (e) {
      setStripeError('Impossible de joindre le serveur de paiement');
    }
    setLoading('');
  };

  const handlePortal = async () => {
    setLoading('portal');
    setStripeError('');
    try {
      const res = await apiCall('/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setStripeError(data.error || 'Erreur portail de facturation');
    } catch (e) {
      setStripeError('Impossible de joindre le serveur de paiement');
    }
    setLoading('');
  };

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      {/* Erreur Stripe */}
      {stripeError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 18px', marginBottom: 20, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span> {stripeError}
        </div>
      )}
      {/* Bandeau plan actuel */}
      {planInfo && (
        <div style={{ background: isTrialing ? '#ede9fe' : '#f0fdf4', border: `1.5px solid ${isTrialing ? '#7c3aed' : '#16a34a'}`, borderRadius: 12, padding: '16px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isTrialing ? '#7c3aed' : '#16a34a', marginBottom: 4 }}>
              {isTrialing ? `⏳ Essai en cours — ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restants` : `✓ Plan actuel : ${currentPlan}`}
            </div>
            {isTrialing && trialEnd && (
              <div style={{ fontSize: 12, color: '#64748b' }}>Fin d'essai : {trialEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            )}
          </div>
          {planInfo.stripe_customer_id && (
            <button onClick={handlePortal} disabled={loading === 'portal'} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {loading === 'portal' ? 'Redirection…' : '⚙️ Gérer mon abonnement'}
            </button>
          )}
        </div>
      )}

      {/* Grille plans */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          return (
            <div key={plan.key} style={{ background: '#fff', borderRadius: 16, border: isCurrent ? `2px solid ${plan.color}` : plan.popular ? `1.5px solid ${plan.color}60` : '1px solid #e2e8f0', padding: '24px 20px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {plan.popular && !isCurrent && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>Le plus populaire</div>
              )}
              {isCurrent && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>✓ Plan actuel</div>
              )}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: plan.color, background: plan.bg, display: 'inline-block', padding: '3px 12px', borderRadius: 20, marginBottom: 10 }}>{plan.label}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{plan.price}€<span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>/mois</span></div>
                {!planInfo?.stripe_customer_id && <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginTop: 4 }}>✓ 60 jours offerts · Aucun prélèvement</div>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#10b981', fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div style={{ textAlign: 'center', padding: '10px', background: plan.bg, borderRadius: 8, fontSize: 13, fontWeight: 600, color: plan.color }}>Plan actif</div>
              ) : (
                <button onClick={() => handleSelect(plan.key)} disabled={!!loading} style={{ background: plan.color, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', width: '100%', opacity: loading ? 0.7 : 1 }}>
                  {loading === plan.key ? 'Redirection…' : `Choisir ${plan.label}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Section Catalogue ────────────────────────────────────────────────────────
function SectionCatalogue({ showModal, setShowModal }) {
  const [articles, setArticles] = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [pg, setPg]             = useState(1);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState({ reference:'', nom:'', description:'', prix_ht:'', tva_taux:'20', unite:'unité', code_comptable:'' });
  const [importModal, setImportModal] = useState(false);
  const [csvText, setCsvText]   = useState('');
  const [importResult, setImportResult] = useState(null);
  const [msg, setMsg]           = useState('');
  const LIMIT = 20;

  const load = useCallback(async (q = search, p = pg) => {
    setLoading(true);
    try {
      const r = await apiCall(`/catalogue?search=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT}`);
      if (r.ok) { const d = await r.json(); setArticles(d.data||[]); setTotal(d.total||0); }
    } catch {}
    setLoading(false);
  }, [search, pg]);

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ reference:'', nom:'', description:'', prix_ht:'', tva_taux:'20', unite:'unité', code_comptable:'' });
    setShowModal(true);
  };
  const openEdit = (a) => {
    setEditItem(a);
    setForm({ reference:a.reference||'', nom:a.nom||'', description:a.description||'', prix_ht:String(a.prix_ht||''), tva_taux:String(a.tva_taux||'20'), unite:a.unite||'unité', code_comptable:a.code_comptable||'' });
    setShowModal(true);
  };
  const handleSave = async () => {
    if (!form.nom || form.prix_ht==='') return setMsg('Nom et prix HT requis');
    setMsg('');
    const body = { ...form, prix_ht:parseFloat(form.prix_ht), tva_taux:parseFloat(form.tva_taux||20) };
    const r = editItem
      ? await apiCall(`/catalogue/${editItem.id}`, { method:'PUT', body:JSON.stringify(body) })
      : await apiCall('/catalogue', { method:'POST', body:JSON.stringify(body) });
    if (r.ok) { setShowModal(false); setMsg(editItem?'✓ Article mis à jour':'✓ Article créé'); load(search, pg); }
    else { const d=await r.json(); setMsg(d.error||'Erreur'); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Archiver cet article ?')) return;
    await apiCall(`/catalogue/${id}`, { method:'DELETE' });
    load(search, pg);
  };
  const handleImport = async () => {
    setImportResult(null);
    const r = await apiCall('/catalogue/import', { method:'POST', body:JSON.stringify({ csv:csvText }) });
    const d = await r.json();
    setImportResult(d);
    if (r.ok && d.created>0) load(search, pg);
  };
  const fmtP = (n) => parseFloat(n||0).toFixed(2);

  return (
    <div className="fade-in" style={{ padding:'28px 32px' }}>
      {msg && <div style={{ background:msg.startsWith('✓')?'#d1fae5':'#fee2e2', color:msg.startsWith('✓')?'#065f46':'#991b1b', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:13 }}>{msg}</div>}

      <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input style={{ ...inputStyle, flex:1, minWidth:200, maxWidth:380 }} placeholder="Rechercher par nom, référence…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPg(1); load(e.target.value,1); }} />
        <Btn variant="ghost" onClick={() => setImportModal(true)}>⬆ Importer CSV</Btn>
        <Btn onClick={openCreate}>+ Nouvel article</Btn>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Chargement…</div>
      ) : articles.length===0 ? (
        <div style={{ background:'#fff', borderRadius:12, padding:'48px 32px', textAlign:'center', color:'#94a3b8', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🗂️</div>
          <div style={{ fontWeight:600, color:'#374151', marginBottom:8 }}>Catalogue vide</div>
          <div style={{ fontSize:13 }}>Ajoutez vos articles et services pour les réutiliser dans vos devis.</div>
          <div style={{ marginTop:16 }}><Btn onClick={openCreate}>+ Créer le premier article</Btn></div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
          <table style={{ width:'100%' }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Référence','Nom / Description','Unité','Prix HT','TVA','Compte',''].map((h) => (
                  <th key={h} style={{ padding:'12px 16px', fontSize:12, fontWeight:600, color:'#64748b', textAlign:h==='Prix HT'?'right':'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((a,i) => (
                <tr key={a.id} style={{ borderBottom:'1px solid #f1f5f9', background:i%2?'#fafafa':'#fff' }}>
                  <td style={{ padding:'12px 16px', fontSize:13, color:'#64748b' }}>{a.reference||'—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{a.nom}</div>
                    {a.description && <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{a.description.slice(0,60)}{a.description.length>60?'…':''}</div>}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13 }}>{a.unite}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, textAlign:'right' }}>{fmtP(a.prix_ht)} €</td>
                  <td style={{ padding:'12px 16px', fontSize:13 }}>{a.tva_taux} %</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#64748b' }}>{a.code_comptable||'—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <Btn variant="ghost" style={{ padding:'5px 10px', fontSize:12 }} onClick={() => openEdit(a)}>✏️</Btn>
                      <Btn variant="danger" style={{ padding:'5px 10px', fontSize:12 }} onClick={() => handleDelete(a.id)}>🗑</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total>LIMIT && (
            <div style={{ padding:'12px 16px', display:'flex', gap:8, alignItems:'center', borderTop:'1px solid #e2e8f0' }}>
              <Btn variant="ghost" style={{ padding:'5px 12px' }} disabled={pg===1} onClick={() => { const p=pg-1; setPg(p); load(search,p); }}>←</Btn>
              <span style={{ fontSize:13, color:'#64748b' }}>Page {pg} / {Math.ceil(total/LIMIT)}</span>
              <Btn variant="ghost" style={{ padding:'5px 12px' }} disabled={pg>=Math.ceil(total/LIMIT)} onClick={() => { const p=pg+1; setPg(p); load(search,p); }}>→</Btn>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={editItem?'Modifier l\'article':'Nouvel article'} onClose={() => setShowModal(false)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <Field label="Nom *"><input style={inputStyle} value={form.nom} onChange={(e) => setForm({...form,nom:e.target.value})} placeholder="Conseil en stratégie" /></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Référence"><input style={inputStyle} value={form.reference} onChange={(e) => setForm({...form,reference:e.target.value})} placeholder="REF-001" /></Field>
              <Field label="Unité"><input style={inputStyle} value={form.unite} onChange={(e) => setForm({...form,unite:e.target.value})} placeholder="heure / unité / forfait" /></Field>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Prix HT (€) *"><input style={inputStyle} type="number" step="0.01" min="0" value={form.prix_ht} onChange={(e) => setForm({...form,prix_ht:e.target.value})} placeholder="150.00" /></Field>
              <Field label="TVA (%)">
                <select style={inputStyle} value={form.tva_taux} onChange={(e) => setForm({...form,tva_taux:e.target.value})}>
                  <option value="0">0 % (exonéré)</option><option value="2.1">2,1 %</option>
                  <option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option>
                </select>
              </Field>
            </div>
            <Field label="Description"><textarea style={{ ...inputStyle, resize:'vertical', minHeight:72 }} value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} placeholder="Description optionnelle…" /></Field>
            <Field label="Code comptable"><input style={inputStyle} value={form.code_comptable} onChange={(e) => setForm({...form,code_comptable:e.target.value})} placeholder="706100" /></Field>
            {msg && !msg.startsWith('✓') && <div style={{ color:'#dc2626', fontSize:13 }}>{msg}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <Btn variant="ghost" onClick={() => setShowModal(false)}>Annuler</Btn>
              <Btn onClick={handleSave}>{editItem?'Enregistrer':'Créer'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {importModal && (
        <Modal title="Importer un catalogue CSV" onClose={() => { setImportModal(false); setImportResult(null); setCsvText(''); }}>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:12, lineHeight:1.7 }}>
            Collez votre CSV ci-dessous (séparateur <code>;</code>) :<br />
            <code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4, fontSize:12 }}>reference;nom;description;prix_ht;tva_taux;unite;code_comptable</code>
          </div>
          <textarea style={{ ...inputStyle, minHeight:200, fontFamily:'monospace', fontSize:12, resize:'vertical' }}
            placeholder={"REF001;Conseil horaire;;150.00;20;heure;706100\nREF002;Formation;;1200.00;20;jour;706200"}
            value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          {importResult && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:importResult.ok?'#d1fae5':'#fee2e2', fontSize:13, color:importResult.ok?'#065f46':'#991b1b' }}>
              {importResult.ok ? `✓ ${importResult.created} article(s) importé(s) sur ${importResult.total_lignes} ligne(s).` : importResult.error}
              {importResult.errors?.length>0 && <div style={{ marginTop:6, fontSize:12 }}>{importResult.errors.map((e,i) => <div key={i}>⚠️ Ligne {e.ligne} : {e.raison}</div>)}</div>}
            </div>
          )}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
            <Btn variant="ghost" onClick={() => { setImportModal(false); setImportResult(null); setCsvText(''); }}>Fermer</Btn>
            <Btn onClick={handleImport} disabled={!csvText.trim()}>Importer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── Section Devis ────────────────────────────────────────────────────────────
function SectionDevis({ showModal, setShowModal, company }) {
  const [devisList, setDevisList] = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [pg, setPg]               = useState(1);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [detail, setDetail]       = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [msg, setMsg]             = useState('');
  const EF = { client_nom:'', client_siret:'', client_email:'', objet:'', date_validite:'', notes:'' };
  const EL = { description:'', quantite:'1', prix_unitaire_ht:'', tva_taux:'20', unite:'unité', catalogue_id:'' };
  const [form, setForm]    = useState(EF);
  const [lignes, setLignes] = useState([{...EL}]);
  const LIMIT = 15;
  const fmtE = (n) => parseFloat(n||0).toLocaleString('fr-FR',{minimumFractionDigits:2})+' €';
  const SC = { BROUILLON:{bg:'#f1f5f9',color:'#475569'}, ENVOYE:{bg:'#dbeafe',color:'#1d4ed8'}, ACCEPTE:{bg:'#d1fae5',color:'#065f46'}, REFUSE:{bg:'#fee2e2',color:'#991b1b'}, FACTURE:{bg:'#ede9fe',color:'#5b21b6'}, EXPIRE:{bg:'#fef3c7',color:'#92400e'} };

  const load = useCallback(async (statut=filtreStatut, p=pg) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page:p, limit:LIMIT, ...(statut?{statut}:{}) });
      const r = await apiCall(`/devis?${qs}`);
      if (r.ok) { const d=await r.json(); setDevisList(d.data||[]); setTotal(d.total||0); }
    } catch {}
    setLoading(false);
  }, [filtreStatut, pg]);

  useEffect(() => {
    load();
    apiCall('/catalogue?limit=200').then(r=>r.ok?r.json():null).then(d=>{ if(d) setCatalogue(d.data||[]); }).catch(()=>{});
  }, []);

  const addLigne = () => setLignes(l=>[...l,{...EL}]);
  const remLigne = (i) => setLignes(l=>l.filter((_,idx)=>idx!==i));
  const updLigne = (i,field,val) => setLignes(prev=>{
    const n=[...prev]; n[i]={...n[i],[field]:val};
    if(field==='catalogue_id'&&val){ const a=catalogue.find(x=>String(x.id)===String(val)); if(a) n[i]={...n[i],description:a.nom,prix_unitaire_ht:String(a.prix_ht),tva_taux:String(a.tva_taux),unite:a.unite,catalogue_id:val}; }
    return n;
  });

  const totalHT  = lignes.reduce((s,l)=>s+(parseFloat(l.quantite||0)*parseFloat(l.prix_unitaire_ht||0)),0);
  const totalTTC = lignes.reduce((s,l)=>{ const ht=parseFloat(l.quantite||0)*parseFloat(l.prix_unitaire_ht||0); return s+ht*(1+parseFloat(l.tva_taux||20)/100); },0);

  const handleCreate = async () => {
    if (!form.client_nom) return setMsg('Nom client requis');
    if (lignes.some(l=>!l.description||!l.prix_unitaire_ht)) return setMsg('Chaque ligne doit avoir une description et un prix');
    setMsg('');
    const body = { ...form, lignes:lignes.map((l,i)=>({ description:l.description, quantite:parseFloat(l.quantite||1), prix_unitaire_ht:parseFloat(l.prix_unitaire_ht||0), tva_taux:parseFloat(l.tva_taux||20), unite:l.unite, catalogue_id:l.catalogue_id||null, ordre:i })) };
    const r = await apiCall('/devis',{method:'POST',body:JSON.stringify(body)});
    if (r.ok) { setShowModal(false); setMsg('✓ Devis créé'); setForm(EF); setLignes([{...EL}]); load(); }
    else { const d=await r.json(); setMsg(d.error||'Erreur'); }
  };

  const changeStatut = async (id, statut) => {
    const r = await apiCall(`/devis/${id}/statut`,{method:'PATCH',body:JSON.stringify({statut})});
    if (r.ok) { setMsg(`✓ Statut → ${statut}`); load(); if(detail?.id===id){ const rd=await apiCall(`/devis/${id}`); if(rd.ok) setDetail(await rd.json()); } }
    else { const d=await r.json(); setMsg(d.error||'Erreur'); }
  };

  const convertir = async (id) => {
    if (!window.confirm('Convertir ce devis en facture ? Action irréversible.')) return;
    const r = await apiCall(`/devis/${id}/convertir`,{method:'POST'});
    const d = await r.json();
    if (r.ok) { setMsg(`✓ Facture ${d.facture.numero} créée`); setDetail(null); load(); }
    else { setMsg(d.error||'Erreur conversion'); }
  };

  const deleteDevis = async (id) => {
    if (!window.confirm('Supprimer ce brouillon ?')) return;
    const r = await apiCall(`/devis/${id}`,{method:'DELETE'});
    if (r.ok) { setMsg('✓ Supprimé'); setDetail(null); load(); }
  };

  const openDetail = async (id) => {
    const r=await apiCall(`/devis/${id}`);
    if(r.ok){ setDetail(await r.json()); setShowModal(false); }
  };

  return (
    <div className="fade-in" style={{ padding:'28px 32px' }}>
      {msg && <div style={{ background:msg.startsWith('✓')?'#d1fae5':'#fee2e2', color:msg.startsWith('✓')?'#065f46':'#991b1b', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:13 }}>{msg}</div>}

      {/* Filtres */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        {['','BROUILLON','ENVOYE','ACCEPTE','REFUSE','FACTURE','EXPIRE'].map(s=>(
          <button key={s||'all'} onClick={()=>{ setFiltreStatut(s); setPg(1); load(s,1); }}
            style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', fontSize:12, fontWeight:600, cursor:'pointer',
              borderColor:filtreStatut===s?'#4f46e5':'#e2e8f0', background:filtreStatut===s?'#4f46e5':'#fff', color:filtreStatut===s?'#fff':'#64748b' }}>
            {s||'Tous'}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <Btn onClick={()=>{ setForm(EF); setLignes([{...EL}]); setShowModal(true); }}>+ Nouveau devis</Btn>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Chargement…</div>
      ) : devisList.length===0 ? (
        <div style={{ background:'#fff', borderRadius:12, padding:'48px 32px', textAlign:'center', color:'#94a3b8', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
          <div style={{ fontWeight:600, color:'#374151', marginBottom:8 }}>Aucun devis</div>
          <div style={{ fontSize:13 }}>Créez votre premier devis et convertissez-le en facture en un clic.</div>
          <div style={{ marginTop:16 }}><Btn onClick={()=>{ setForm(EF); setLignes([{...EL}]); setShowModal(true); }}>+ Nouveau devis</Btn></div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
          <table style={{ width:'100%' }}>
            <thead><tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
              {['Numéro','Client','Objet','HT','TTC','Statut','Date',''].map(h=>(
                <th key={h} style={{ padding:'12px 16px', fontSize:12, fontWeight:600, color:'#64748b', textAlign:['HT','TTC'].includes(h)?'right':'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{devisList.map((d,i)=>{
              const sc=SC[d.statut]||SC.BROUILLON;
              return (
                <tr key={d.id} style={{ borderBottom:'1px solid #f1f5f9', background:i%2?'#fafafa':'#fff', cursor:'pointer' }} onClick={()=>openDetail(d.id)}>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, color:'#4f46e5' }}>{d.numero}</td>
                  <td style={{ padding:'12px 16px', fontSize:13 }}>{d.client_nom}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#64748b' }}>{(d.objet||'').slice(0,35)}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, textAlign:'right' }}>{fmtE(d.montant_ht)}</td>
                  <td style={{ padding:'12px 16px', fontSize:13, fontWeight:600, textAlign:'right' }}>{fmtE(d.montant_ttc)}</td>
                  <td style={{ padding:'12px 16px' }}><span style={{ background:sc.bg, color:sc.color, padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:600 }}>{d.statut}</span></td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#94a3b8' }}>{d.date_emission?new Date(d.date_emission).toLocaleDateString('fr-FR'):'—'}</td>
                  <td style={{ padding:'12px 16px' }} onClick={e=>e.stopPropagation()}>
                    {d.statut==='BROUILLON'&&<div style={{ display:'flex', gap:4 }}>
                      <Btn variant="ghost" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>changeStatut(d.id,'ENVOYE')}>Envoyer</Btn>
                      <Btn variant="danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>deleteDevis(d.id)}>🗑</Btn>
                    </div>}
                    {d.statut==='ENVOYE'&&<div style={{ display:'flex', gap:4 }}>
                      <Btn variant="success" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>changeStatut(d.id,'ACCEPTE')}>✓ Accepté</Btn>
                      <Btn variant="danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>changeStatut(d.id,'REFUSE')}>✕ Refusé</Btn>
                    </div>}
                    {d.statut==='ACCEPTE'&&<Btn style={{ padding:'4px 10px', fontSize:11, background:'#7c3aed', color:'#fff' }} onClick={()=>convertir(d.id)}>→ Facture</Btn>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {total>LIMIT&&(
            <div style={{ padding:'12px 16px', display:'flex', gap:8, alignItems:'center', borderTop:'1px solid #e2e8f0' }}>
              <Btn variant="ghost" style={{ padding:'5px 12px' }} disabled={pg===1} onClick={()=>{ const p=pg-1; setPg(p); load(filtreStatut,p); }}>←</Btn>
              <span style={{ fontSize:13, color:'#64748b' }}>Page {pg} / {Math.ceil(total/LIMIT)}</span>
              <Btn variant="ghost" style={{ padding:'5px 12px' }} disabled={pg>=Math.ceil(total/LIMIT)} onClick={()=>{ const p=pg+1; setPg(p); load(filtreStatut,p); }}>→</Btn>
            </div>
          )}
        </div>
      )}

      {/* Modal création */}
      {showModal&&(
        <Modal title="Nouveau devis" onClose={()=>setShowModal(false)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12, maxHeight:'68vh', overflowY:'auto', paddingRight:4 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Nom client *"><input style={inputStyle} value={form.client_nom} onChange={e=>setForm({...form,client_nom:e.target.value})} placeholder="Acme Corp" /></Field>
              <Field label="SIRET client"><input style={inputStyle} value={form.client_siret} onChange={e=>setForm({...form,client_siret:e.target.value.replace(/\D/g,'').slice(0,14)})} placeholder="14 chiffres" /></Field>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Email client"><input style={inputStyle} type="email" value={form.client_email} onChange={e=>setForm({...form,client_email:e.target.value})} placeholder="contact@client.fr" /></Field>
              <Field label="Valide jusqu'au"><input style={inputStyle} type="date" value={form.date_validite} onChange={e=>setForm({...form,date_validite:e.target.value})} /></Field>
            </div>
            <Field label="Objet"><input style={inputStyle} value={form.objet} onChange={e=>setForm({...form,objet:e.target.value})} placeholder="Prestation de conseil Q3 2026" /></Field>

            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:8 }}>Lignes</div>
              {lignes.map((l,i)=>(
                <div key={i} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  {catalogue.length>0&&(
                    <select style={{ ...inputStyle, marginBottom:6, fontSize:12 }} value={l.catalogue_id||''} onChange={e=>updLigne(i,'catalogue_id',e.target.value)}>
                      <option value="">— Choisir du catalogue —</option>
                      {catalogue.map(a=><option key={a.id} value={a.id}>{a.nom} — {a.prix_ht} €/{a.unite}</option>)}
                    </select>
                  )}
                  <input style={{ ...inputStyle, marginBottom:6 }} placeholder="Description *" value={l.description} onChange={e=>updLigne(i,'description',e.target.value)} />
                  <div style={{ display:'grid', gridTemplateColumns:'80px 130px 100px 80px auto', gap:6, alignItems:'center' }}>
                    <input style={inputStyle} type="number" min="0.001" step="any" placeholder="Qté" value={l.quantite} onChange={e=>updLigne(i,'quantite',e.target.value)} />
                    <input style={inputStyle} type="number" min="0" step="0.01" placeholder="Prix HT *" value={l.prix_unitaire_ht} onChange={e=>updLigne(i,'prix_unitaire_ht',e.target.value)} />
                    <select style={inputStyle} value={l.tva_taux} onChange={e=>updLigne(i,'tva_taux',e.target.value)}>
                      <option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option>
                    </select>
                    <input style={inputStyle} placeholder="Unité" value={l.unite} onChange={e=>updLigne(i,'unite',e.target.value)} />
                    {lignes.length>1&&<Btn variant="danger" style={{ padding:'6px 8px', fontSize:11 }} onClick={()=>remLigne(i)}>✕</Btn>}
                  </div>
                </div>
              ))}
              <Btn variant="ghost" style={{ width:'100%' }} onClick={addLigne}>+ Ajouter une ligne</Btn>
            </div>

            <div style={{ background:'#f8fafc', borderRadius:8, padding:'12px 16px', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'#64748b' }}>Total HT</span><span style={{ fontWeight:600 }}>{totalHT.toFixed(2)} €</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'#64748b' }}>Total TTC</span><span style={{ fontWeight:700, color:'#4f46e5', fontSize:15 }}>{totalTTC.toFixed(2)} €</span>
              </div>
            </div>

            <Field label="Notes"><textarea style={{ ...inputStyle, minHeight:56, resize:'vertical' }} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Conditions, délais…" /></Field>
            {msg&&!msg.startsWith('✓')&&<div style={{ color:'#dc2626', fontSize:13 }}>{msg}</div>}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setShowModal(false)}>Annuler</Btn>
              <Btn onClick={handleCreate}>Créer le devis</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal détail */}
      {detail&&(
        <Modal title={`Devis ${detail.numero}`} onClose={()=>setDetail(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:14, maxHeight:'70vh', overflowY:'auto', paddingRight:4 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:13 }}>
              <div><span style={{ color:'#64748b' }}>Client :</span> <strong>{detail.client_nom}</strong></div>
              <div><span style={{ color:'#64748b' }}>Statut :</span> <span style={{ background:(SC[detail.statut]||SC.BROUILLON).bg, color:(SC[detail.statut]||SC.BROUILLON).color, padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:600 }}>{detail.statut}</span></div>
              {detail.objet&&<div style={{ gridColumn:'1/-1' }}><span style={{ color:'#64748b' }}>Objet :</span> {detail.objet}</div>}
              {detail.client_email&&<div><span style={{ color:'#64748b' }}>Email :</span> {detail.client_email}</div>}
              {detail.date_validite&&<div><span style={{ color:'#64748b' }}>Valide jusqu'au :</span> {new Date(detail.date_validite).toLocaleDateString('fr-FR')}</div>}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:6 }}>LIGNES</div>
              <table style={{ width:'100%', fontSize:12 }}>
                <thead><tr style={{ background:'#f8fafc' }}>
                  {['Description','Qté','Prix HT','TVA','Total HT'].map(h=><th key={h} style={{ padding:'6px 10px', fontWeight:600, color:'#374151', textAlign:h==='Total HT'?'right':'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>{(detail.lignes||[]).map(l=>(
                  <tr key={l.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'6px 10px' }}>{l.description}</td>
                    <td style={{ padding:'6px 10px' }}>{l.quantite} {l.unite}</td>
                    <td style={{ padding:'6px 10px' }}>{parseFloat(l.prix_unitaire_ht).toFixed(2)} €</td>
                    <td style={{ padding:'6px 10px' }}>{l.tva_taux} %</td>
                    <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600 }}>{parseFloat(l.montant_ht).toFixed(2)} €</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'12px 16px', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ color:'#64748b' }}>Total HT</span><span style={{ fontWeight:600 }}>{fmtE(detail.montant_ht)}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#64748b' }}>Total TTC</span><span style={{ fontWeight:700, fontSize:15, color:'#4f46e5' }}>{fmtE(detail.montant_ttc)}</span></div>
            </div>
            {detail.notes&&<div style={{ fontSize:12, color:'#64748b', fontStyle:'italic', padding:'8px 12px', background:'#fffbeb', borderRadius:8 }}>{detail.notes}</div>}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {detail.statut==='BROUILLON'&&<><Btn onClick={()=>{changeStatut(detail.id,'ENVOYE');setDetail(null);}}>📤 Marquer envoyé</Btn><Btn variant="danger" onClick={()=>{deleteDevis(detail.id);}}>🗑 Supprimer</Btn></>}
              {detail.statut==='ENVOYE'&&<><Btn variant="success" onClick={()=>{changeStatut(detail.id,'ACCEPTE');setDetail(null);}}>✓ Accepté</Btn><Btn variant="danger" onClick={()=>{changeStatut(detail.id,'REFUSE');setDetail(null);}}>✕ Refusé</Btn><Btn variant="ghost" onClick={()=>{changeStatut(detail.id,'EXPIRE');setDetail(null);}}>⏰ Expiré</Btn></>}
              {detail.statut==='ACCEPTE'&&<Btn style={{ background:'#7c3aed', color:'#fff' }} onClick={()=>{convertir(detail.id);}}>🧾 Convertir en facture</Btn>}
              {detail.facture_id&&<div style={{ fontSize:12, color:'#5b21b6', background:'#ede9fe', padding:'6px 12px', borderRadius:8 }}>✓ Facture ID #{detail.facture_id}</div>}
              <Btn variant="ghost" onClick={()=>setDetail(null)} style={{ marginLeft:'auto' }}>Fermer</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── Écran sélection de plan (affiché après le premier login) ────────────────
function PlanSelectionScreen({ company, onSkip }) {
  const [loading, setLoading] = useState('');
  const [error, setError]     = useState('');

  const plans = [
    {
      key: 'solo',
      label: 'Solo',
      price: '14€',
      color: '#0891b2',
      bg: '#e0f2fe',
      features: ['1 utilisateur', '50 factures/mois', 'Relances automatiques', 'Export CA3 TVA'],
    },
    {
      key: 'pro',
      label: 'Pro',
      price: '34€',
      color: '#4f46e5',
      bg: '#ede9fe',
      features: ['3 utilisateurs', 'Factures illimitées', 'Factures récurrentes', 'Accès comptable'],
      popular: true,
    },
    {
      key: 'equipe',
      label: 'Équipe',
      price: '69€',
      color: '#7c3aed',
      bg: '#f3e8ff',
      features: ['10 utilisateurs', 'Multi-établissements', 'Support prioritaire', 'API accès'],
    },
    {
      key: 'business',
      label: 'Business',
      price: '149€',
      color: '#dc2626',
      bg: '#fee2e2',
      features: ['Illimité', 'Chorus Pro direct', 'SLA 99,9%', 'Onboarding dédié'],
    },
  ];

  const handleSelect = async (planKey) => {
    setLoading(planKey);
    setError('');
    try {
      const res  = await apiCall('/stripe/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Erreur lors de la création de la session Stripe');
        setLoading('');
      }
    } catch (e) {
      setError('Impossible de joindre le serveur');
      setLoading('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      {/* En-tête */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#4f46e5', marginBottom: 8 }}>⚡ FacturEasy</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Bienvenue, {company?.nom} 👋
        </div>
        <div style={{ fontSize: 15, color: '#64748b', maxWidth: 480, margin: '0 auto' }}>
          Choisissez votre plan — tous incluent <strong style={{ color: '#4f46e5' }}>60 jours d'essai gratuit</strong>, sans carte bancaire requise pour commencer.
        </div>
      </div>

      {/* Grille plans */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, width: '100%', maxWidth: 860, marginBottom: 24 }}>
        {plans.map((plan) => (
          <div
            key={plan.key}
            style={{
              background: '#fff',
              borderRadius: 16,
              border: plan.popular ? `2px solid ${plan.color}` : '1px solid #e2e8f0',
              padding: '24px 20px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {plan.popular && (
              <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                Le plus populaire
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: plan.color, background: plan.bg, display: 'inline-block', padding: '3px 12px', borderRadius: 20, marginBottom: 8 }}>{plan.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{plan.price}<span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}>/mois</span></div>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 4 }}>✓ 60 jours offerts — aucun prélèvement</div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {plan.features.map((f) => (
                <li key={f} style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSelect(plan.key)}
              disabled={!!loading}
              style={{
                background: loading === plan.key ? '#e2e8f0' : plan.color,
                color: loading === plan.key ? '#94a3b8' : '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '11px 0',
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%',
                transition: 'opacity 0.15s',
              }}
            >
              {loading === plan.key ? 'Redirection…' : `Choisir ${plan.label}`}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: '#dc2626', background: '#fee2e2', borderRadius: 8, padding: '10px 16px', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Skip */}
      <button
        onClick={onSkip}
        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
      >
        Continuer sans plan pour l'instant (plan gratuit)
      </button>
    </div>
  );
}

// ─── Aliases composants (noms normalisés) ────────────────────────────────────
const LoginPage          = LoginScreen;
const OnboardingChecklist = OnboardingWizard;

function SectionTresorerie({ factures, revenus, depenses }) {
  const totalEncaisse = revenus.reduce((s, r) => s + parseFloat(r.montant_ttc || 0), 0);
  const totalDepense  = depenses.reduce((s, d) => s + parseFloat(d.ttc || 0), 0);
  const solde         = totalEncaisse - totalDepense;
  const fmt = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 28 }}>
        <KpiCard label="Encaissé" value={fmt(totalEncaisse)} color="#10b981" />
        <KpiCard label="Décaissé"  value={fmt(totalDepense)}  color="#ef4444" />
        <KpiCard label="Solde net" value={fmt(solde)}         color={solde >= 0 ? '#4f46e5' : '#ef4444'} />
      </div>
      <div style={{ background:'#fff', borderRadius:12, padding:24, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
        <p style={{ color:'#64748b', fontSize:14 }}>
          Graphique de trésorerie — disponible prochainement.
        </p>
      </div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────
function SectionTresorerieCockpit({ factures = [], revenus = [], depenses = [] }) {
  const totalEncaisse = revenus.reduce((s, r) => s + Number(r.ttc || r.montant_ttc || 0), 0);
  const facturesPrevues = factures
    .filter((f) => !['ACCEPTEE', 'PAYEE', 'ANNULEE'].includes(f.statut))
    .reduce((s, f) => s + Number(f.ttc || 0), 0);
  const totalDepense = depenses.reduce((s, d) => s + Number(d.ttc || 0), 0);
  const tvaEstimee = Math.max(0, factures.reduce((s, f) => s + Number(f.tva || 0), 0) - depenses.reduce((s, d) => s + Number(d.tva || 0), 0));
  const soldeActuel = totalEncaisse - totalDepense;
  const fmtMoney = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const rows = [30, 60, 90].map((days) => {
    const prudence = days === 30 ? 0.9 : days === 60 ? 0.75 : 0.6;
    const encaissements = facturesPrevues * prudence;
    const depensesPrevues = totalDepense * (days / 30);
    const solde = soldeActuel + encaissements - depensesPrevues - tvaEstimee;
    return { days, encaissements, depensesPrevues, tvaEstimee, solde };
  });

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard icon="💰" label="Solde estimé" value={fmtMoney(soldeActuel)} color={soldeActuel >= 0 ? '#4f46e5' : '#ef4444'} />
        <KpiCard icon="📥" label="À encaisser" value={fmtMoney(facturesPrevues)} color="#10b981" />
        <KpiCard icon="📤" label="Dépenses base" value={fmtMoney(totalDepense)} color="#ef4444" />
        <KpiCard icon="📋" label="TVA estimée" value={fmtMoney(tvaEstimee)} color="#f59e0b" />
      </div>
      {rows.some((r) => r.solde < 0) && (
        <div style={{ background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca', borderRadius:12, padding:16, marginBottom:20, fontSize:14, fontWeight:700 }}>
          Alerte trésorerie : solde projeté négatif possible sous 90 jours.
        </div>
      )}
      <div style={{ background:'#fff', borderRadius:12, padding:24, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'auto' }}>
        <h2 style={{ fontSize:16, fontWeight:800, marginBottom:14 }}>Projection 30 / 60 / 90 jours</h2>
        <table style={{ minWidth:760 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {['Période','Encaissements probables','Dépenses prévues','TVA prévue','Solde projeté'].map((h) => (
                <th key={h} style={{ padding:'11px 14px', fontSize:12, color:'#64748b', fontWeight:700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.days} style={{ borderTop:'1px solid #f1f5f9' }}>
                <td style={{ padding:'13px 14px', fontWeight:800 }}>{r.days} jours</td>
                <td style={{ padding:'13px 14px' }}>{fmtMoney(r.encaissements)}</td>
                <td style={{ padding:'13px 14px' }}>{fmtMoney(r.depensesPrevues)}</td>
                <td style={{ padding:'13px 14px' }}>{fmtMoney(r.tvaEstimee)}</td>
                <td style={{ padding:'13px 14px', color:r.solde < 0 ? '#dc2626' : '#047857', fontWeight:800 }}>{fmtMoney(r.solde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop:14, fontSize:12, color:'#64748b' }}>
          Calcul simple : factures non payées, revenus, dépenses et TVA estimée. Banque plus tard.
        </div>
      </div>
    </div>
  );
}

function PublicLanding({ onStart }) {
  return (
    <iframe
      title="FacturEasy accueil"
      src="/landing-home.html"
      style={{ width: '100%', height: '100vh', border: 0, display: 'block' }}
    />
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif", color: '#0f172a' }}>
      <header style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5' }}>💼 FacturEasy</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={onStart} style={{ border: '1px solid #c7d2fe', background: '#fff', color: '#4f46e5', padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Espace client</button>
          <button onClick={onStart} style={{ border: 'none', background: '#4f46e5', color: '#fff', padding: '10px 18px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Créer mon compte client</button>
        </div>
      </header>
      <main>
        <section style={{ maxWidth: 1120, margin: '0 auto', padding: '80px 32px 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', background: '#ede9fe', color: '#4f46e5', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 800, marginBottom: 22 }}>Réforme facturation électronique 2026</div>
            <h1 style={{ fontSize: 48, lineHeight: 1.08, letterSpacing: '-0.5px', margin: '0 0 20px', fontWeight: 900 }}>Facturation Chorus Pro et trésorerie PME, sans usine à gaz.</h1>
            <p style={{ fontSize: 18, color: '#64748b', lineHeight: 1.7, margin: '0 0 30px', maxWidth: 640 }}>
              Créez votre espace client, ajoutez vos informations entreprise, puis préparez factures, devis, TVA et suivi Chorus Pro depuis un seul tableau de bord.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={onStart} style={{ border: 'none', background: '#4f46e5', color: '#fff', padding: '15px 24px', borderRadius: 12, fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>Créer mon compte client</button>
              <a href="#fonctionnalites" style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '14px 22px', borderRadius: 12, fontWeight: 800 }}>Voir fonctionnalités</a>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 20px 60px rgba(79,70,229,.14)', overflow: 'hidden' }}>
            <div style={{ background: '#4f46e5', color: '#fff', padding: '14px 18px', fontSize: 13, fontWeight: 800 }}>Tableau de bord FacturEasy</div>
            <div style={{ padding: 22, display: 'grid', gap: 14 }}>
              {[
                ['Factures', 'Émission, statuts, relances'],
                ['Clients', 'Carnet clients avant facture'],
                ['Chorus Pro', 'Processus prêt, connexion non établie en local'],
                ['TVA', 'Suivi collectée / déductible'],
              ].map(([title, text]) => (
                <div key={title} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '14px 16px', border: '1px solid #f1f5f9', borderRadius: 12, background: '#fafafa' }}>
                  <strong>{title}</strong>
                  <span style={{ color: '#64748b', fontSize: 13, textAlign: 'right' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="fonctionnalites" style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '44px 32px' }}>
          <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {[
              ['1', 'Créer espace client', 'Inscription entreprise avant accès privé.'],
              ['2', 'Ajouter clients', 'Carnet clients dans votre espace, après connexion.'],
              ['3', 'Créer facture', 'Facture ou devis basé sur vos clients.'],
              ['4', 'Suivre conformité', 'Chorus Pro affiché en mode test local.'],
            ].map(([n, title, text]) => (
              <div key={title} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
                <div style={{ width: 30, height: 30, borderRadius: 15, background: '#ede9fe', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, marginBottom: 10 }}>{n}</div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
                <div style={{ color: '#64748b', fontSize: 14 }}>{text}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [company, setCompany] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [showModal, setShowModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [showLogin, setShowLogin] = useState(() => window.location.pathname === '/app' || new URLSearchParams(window.location.search).has('email'));
  const [factures, setFactures] = useState([]);
  const [revenus, setRevenus] = useState([]);
  const [depenses, setDepenses] = useState([]);

  // Restaurer session depuis localStorage
  useEffect(() => {
    const stored = localStorage.getItem('fe_company');
    if (stored && localStorage.getItem('fe_token')) {
      try {
        setCompany(JSON.parse(stored));
      } catch {}
    }
  }, []);

  // Afficher l'onboarding au premier login (si les étapes ne sont pas toutes faites)
  useEffect(() => {
    if (!company || showPlanSelection) return;
    const saved = JSON.parse(localStorage.getItem('fe_onboarding') || '{}');
    const allDone = PRODUCT_ONBOARDING_STEPS.every((s) => saved[s.key]);
    if (!allDone) setShowOnboarding(true);
  }, [company, showPlanSelection]);

  // Charger données depuis l'API (fallback mock si erreur)
  useEffect(() => {
    if (!company) return;
    const load = async () => {
      try {
        const [rF, rR, rD] = await Promise.all([
          apiCall('/factures'),
          apiCall('/finances/revenus'),
          apiCall('/finances/depenses'),
        ]);
        if (rF.ok) setFactures((await rF.json()).map(normFacture));
        if (rR.ok) setRevenus((await rR.json()).map(normRevenu));
        if (rD.ok) setDepenses((await rD.json()).map(normDepense));
      } catch {}
    };
    load();
  }, [company]);

  const handleLogin = async (entreprise) => {
    setCompany(entreprise);
    setPage('dashboard');
    // Vérifier si l'utilisateur a déjà choisi un plan Stripe
    // Si stripe_customer_id est null → premier login → proposer le choix du plan
    try {
      const res  = await apiCall('/auth/me');
      const data = res.ok ? await res.json() : null;
      if (data && !data.stripe_customer_id) {
        setShowPlanSelection(true);
      }
    } catch {}
  };

  const handleLogout = () => {
    localStorage.removeItem('fe_token');
    localStorage.removeItem('fe_company');
    setCompany(null);
    setPage('dashboard');
    setFactures([]);
    setRevenus([]);
    setDepenses([]);
  };

  const handleNav = (nextPage) => {
    setShowOnboarding(false);
    setShowModal(false);
    setPage(nextPage);
  };

  const renderContent = () => {
    switch (page) {
      case 'dashboard':
        return <SectionDashboard factures={factures} revenus={revenus} depenses={depenses} company={company} showModal={showModal} setShowModal={setShowModal} onNav={handleNav} />;
      case 'clients':
        return <SectionClients showModal={showModal} setShowModal={setShowModal} />;
      case 'factures':
        return <SectionFactures factures={factures} setFactures={setFactures} company={company} showModal={showModal} setShowModal={setShowModal} />;
      case 'chorus':
        return <SectionChorus company={company} onNav={handleNav} />;
      case 'revenus':
        return <SectionRevenus revenus={revenus} setRevenus={setRevenus} company={company} showModal={showModal} setShowModal={setShowModal} />;
      case 'depenses':
        return <SectionDepenses depenses={depenses} setDepenses={setDepenses} company={company} showModal={showModal} setShowModal={setShowModal} />;
      case 'tva':
        return <SectionTVA factures={factures} depenses={depenses} company={company} />;
      case 'devis':
        return <SectionDevis company={company} showModal={showModal} setShowModal={setShowModal} />;
      case 'catalogue':
        return <SectionCatalogue showModal={showModal} setShowModal={setShowModal} />;
      case 'recurrentes':
        return <SectionRecurrentes company={company} showModal={showModal} setShowModal={setShowModal} />;
      case 'tresorerie':
        return <SectionTresorerieCockpit factures={factures} revenus={revenus} depenses={depenses} />;
      case 'plans':
        return <SectionPlans company={company} />;
      case 'comptable':
        return <SectionComptable company={company} />;
      case 'parametres':
        return <SectionParametres company={company} />;
      default:
        return <SectionDashboard factures={factures} revenus={revenus} depenses={depenses} company={company} showModal={showModal} setShowModal={setShowModal} onNav={handleNav} />;
    }
  };

  if (!company) {
    return showLogin ? <LoginPage onLogin={handleLogin} /> : <PublicLanding onStart={() => setShowLogin(true)} />;
  }

  if (showPlanSelection) {
    return (
      <PlanSelectionScreen
        company={company}
        onSkip={() => setShowPlanSelection(false)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#4f46e5' }}>⚡ FacturEasy</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{company.nom}</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 12px',
                marginBottom: 2,
                borderRadius: 8,
                border: 'none',
                background: page === item.key ? '#ede9fe' : 'transparent',
                color: page === item.key ? '#4f46e5' : '#64748b',
                fontWeight: page === item.key ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Onboarding toggle */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setShowOnboarding(true)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
          >
            🚀 Guide démarrage
          </button>
        </div>

        {/* Logout */}
        <div style={{ padding: '8px 16px' }}>
          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {PAGE_META[page]?.title || 'Dashboard'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 1 }}>
              {PAGE_META[page]?.subtitle || ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {PAGE_META[page]?.cta && (
              <Btn onClick={() => setShowModal(true)}>
                {PAGE_META[page].cta}
              </Btn>
            )}
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {renderContent()}
        </div>
      </main>

      {/* Onboarding overlay */}
      {showOnboarding && (
        <OnboardingChecklist
          company={company}
          onClose={() => setShowOnboarding(false)}
          onNav={handleNav}
        />
      )}
    </div>
  );
}
