import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function apiFetch(path, token) {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

// ─── Widget Flux de Trésorerie ────────────────────────────────────────────────
export function WidgetFluxTresorerie({ siret, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const annee = new Date().getFullYear();
    setLoading(true);
    setError(null);
    apiFetch(`/rapports/flux-tresorerie?annee=${annee}`, token)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siret, token]);

  const card = (label, value, days) => {
    const isPos = value >= 0;
    return (
      <div
        key={days}
        style={{
          flex: 1,
          background: isPos ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${isPos ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10,
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          Solde à {days}j
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: isPos ? '#15803d' : '#dc2626',
          }}
        >
          {fmt(value)}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{label}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>💧</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Flux de Trésorerie Prévisionnel
        </h3>
      </div>

      {loading && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Chargement…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          Impossible de charger les données : {error}
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'flex', gap: 12 }}>
          {card('Prévision 30 jours', data.solde_30j ?? data.solde30j ?? 0, 30)}
          {card('Prévision 60 jours', data.solde_60j ?? data.solde60j ?? 0, 60)}
          {card('Prévision 90 jours', data.solde_90j ?? data.solde90j ?? 0, 90)}
        </div>
      )}

      {!loading && !error && !data && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Aucune donnée disponible pour cette période.
        </div>
      )}
    </div>
  );
}

// ─── Widget Entonnoir Factures ────────────────────────────────────────────────
const STATUT_CONFIG = {
  Brouillon:  { color: '#94a3b8', bg: '#f1f5f9' },
  Envoyée:    { color: '#2563eb', bg: '#dbeafe' },
  Payée:      { color: '#15803d', bg: '#dcfce7' },
  'En retard':{ color: '#dc2626', bg: '#fee2e2' },
};

export function WidgetEntonnoirFactures({ siret, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch('/rapports/entonnoir-factures', token)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siret, token]);

  const totalCount = data
    ? Object.values(data).reduce((s, v) => s + (v.count ?? v.nb ?? 0), 0)
    : 0;

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>📊</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Entonnoir Factures
        </h3>
      </div>

      {loading && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Chargement…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          Impossible de charger les données : {error}
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(data).map(([statut, vals]) => {
            const count = vals.count ?? vals.nb ?? 0;
            const montant = vals.montant ?? vals.total ?? 0;
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            const cfg = STATUT_CONFIG[statut] || { color: '#64748b', bg: '#f1f5f9' };
            return (
              <div key={statut}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: cfg.color,
                      background: cfg.bg,
                      padding: '2px 8px',
                      borderRadius: 8,
                    }}
                  >
                    {statut}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {count} facture{count !== 1 ? 's' : ''} — {fmt(montant)}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: '#f1f5f9',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: cfg.color,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && !data && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Aucune donnée disponible.
        </div>
      )}
    </div>
  );
}

// ─── Widget Top Clients ───────────────────────────────────────────────────────
export function WidgetTopClients({ siret, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch('/rapports/top-clients?limit=5', token)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(Array.isArray(json) ? json : json.clients ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siret, token]);

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>🏆</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Top 5 Clients
        </h3>
      </div>

      {loading && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Chargement…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          Impossible de charger les données : {error}
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((client, i) => {
            const nom = client.nom ?? client.client_nom ?? client.name ?? `Client ${i + 1}`;
            const ca = client.ca_ht ?? client.ca ?? client.total_ht ?? 0;
            const nbFactures = client.nb_factures ?? client.count ?? 0;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: i === 0 ? '#fffbeb' : '#fafafa',
                  borderRadius: 8,
                  border: `1px solid ${i === 0 ? '#fde68a' : '#f1f5f9'}`,
                }}
              >
                <span style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>
                  {MEDAL[i] || `#${i + 1}`}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {nom}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                    {nbFactures} facture{nbFactures !== 1 ? 's' : ''}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#4f46e5',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmt(ca)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (!data || data.length === 0) && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
          Aucun client trouvé.
        </div>
      )}
    </div>
  );
}

// ─── Widget Alerte E-Reporting ────────────────────────────────────────────────
export function WidgetEreportingAlert({ siret, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const now = new Date();
    const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setLoading(true);
    setError(null);
    apiFetch(`/e-reporting?periode=${periode}`, token)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [siret, token]);

  // Détermine si le mois est couvert
  const isOk =
    data &&
    (data.transmis === true ||
      data.statut === 'TRANSMIS' ||
      (Array.isArray(data) && data.length > 0 && data.every((d) => d.statut === 'TRANSMIS')));

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>📡</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          E-Reporting
        </h3>
      </div>

      {loading && (
        <div style={{ color: '#94a3b8', fontSize: 13, padding: '4px 0' }}>
          Vérification…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          Impossible de vérifier l'état e-reporting : {error}
        </div>
      )}

      {!loading && !error && isOk && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        >
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>
              E-reporting à jour
            </div>
            <div style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>
              Déclaration du mois transmise avec succès
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !isOk && data !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c2410c' }}>
              Déclaration e-reporting du mois non transmise
            </div>
            <div style={{ fontSize: 12, color: '#ea580c', marginTop: 2 }}>
              Pensez à transmettre votre déclaration avant la fin du mois.
            </div>
          </div>
        </div>
      )}

      {!loading && !error && data === null && (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          Aucune information disponible pour ce mois.
        </div>
      )}
    </div>
  );
}
