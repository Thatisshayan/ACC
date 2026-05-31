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
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: '#00ff88', padding: 32 }}>
        <div style={{ maxWidth: 540, textAlign: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: '0.2em', opacity: 0.5, marginBottom: 12 }}>ACC — RUNTIME ERROR</div>
          <div style={{ color: '#ff4444', fontSize: 14, marginBottom: 16, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => window.location.reload()} style={{ border: '1px solid #00ff8840', background: '#00ff8810', color: '#00ff88', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>Reload</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
