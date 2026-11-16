'use client';

import { Component, ReactNode } from 'react';

type Props = { children: ReactNode; fallback?: (error: Error) => ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info?.componentStack);
    try {
      if (typeof window !== 'undefined') {
        const payload = {
          message: error?.message,
          stack: error?.stack,
          componentStack: info?.componentStack,
          url: window.location.href,
          ts: new Date().toISOString(),
        };
        window.localStorage.setItem('aetheria_last_error', JSON.stringify(payload));
      }
    } catch {}
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div style={{ padding: 24, color: '#fca5a5', background: '#0b0f1a', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171' }}>Ocorreu um erro</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.9 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '8px 16px', background: '#f59e0b', color: '#0b0f1a', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
