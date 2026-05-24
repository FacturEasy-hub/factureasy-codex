import { Component } from 'react';

// Génère un ID court pour identifier l'erreur auprès du support
function generateErrorId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Reporter vers Sentry si disponible
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.withScope((scope) => {
        scope.setExtras(errorInfo);
        scope.setTag('errorId', this.state.errorId);
        window.Sentry.captureException(error);
      });
    }

    // Log en développement
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary] Erreur capturée :', error, errorInfo);
    }
  }

  handleRetry() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorId } = this.state;
    const { fallback } = this.props;

    // Fallback personnalisé si fourni
    if (fallback) {
      return fallback({ error, errorId, retry: this.handleRetry });
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '48px 32px',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #fee2e2',
          margin: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 16,
            lineHeight: 1,
          }}
        >
          ⚠️
        </div>

        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: 8,
          }}
        >
          Une erreur inattendue s'est produite
        </h2>

        <p
          style={{
            fontSize: 14,
            color: '#64748b',
            maxWidth: 400,
            lineHeight: 1.6,
            marginBottom: 8,
          }}
        >
          L'application a rencontré un problème. Veuillez réessayer ou contacter le support si le problème persiste.
        </p>

        {error && (
          <p
            style={{
              fontSize: 12,
              color: '#94a3b8',
              fontFamily: 'monospace',
              background: '#f8fafc',
              padding: '6px 12px',
              borderRadius: 6,
              marginBottom: 16,
              maxWidth: 500,
              wordBreak: 'break-all',
            }}
          >
            {error.message || String(error)}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#4f46e5',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Réessayer
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#64748b',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Recharger la page
          </button>
        </div>

        {errorId && (
          <p
            style={{
              marginTop: 20,
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            ID d'erreur :{' '}
            <code
              style={{
                background: '#f1f5f9',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
              }}
            >
              {errorId}
            </code>
          </p>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
