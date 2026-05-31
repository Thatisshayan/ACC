import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Sentry browser tracking — only active when VITE_SENTRY_DSN is set
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({ dsn: SENTRY_DSN, environment: import.meta.env.MODE, tracesSampleRate: 0.1 });
  }).catch(() => {});
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh',
          background: '#050508', color: '#e2e8f0',
          fontFamily: 'Inter, system-ui, sans-serif', padding: 24,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.6 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>
            ACC encountered an error
          </div>
          <div style={{
            fontSize: 12, color: '#71717a', maxWidth: 420,
            textAlign: 'center', lineHeight: 1.6, marginBottom: 24,
          }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px', cursor: 'pointer', fontSize: 13,
              background: 'rgba(26,255,140,0.10)', color: '#1aff8c',
              border: '1px solid rgba(26,255,140,0.25)', borderRadius: 10,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
