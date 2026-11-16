'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onError: (message: string) => void;
};

type State = {
  hasError: boolean;
};

/**
 * Captura erros de WebGL/GLTF na cena 3D e mostra uma mensagem clara
 * na tela (em vez de ficar travado em "carregando").
 */
export default class ArenaErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const message =
      error?.message ||
      `Erro ao iniciar a arena 3D${info?.componentStack ? ' (veja o console)' : ''}`;
    console.error('[arena] erro na cena 3D:', error, info?.componentStack);
    this.props.onError(message);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
