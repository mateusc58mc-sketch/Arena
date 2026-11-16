'use client';

/**
 * ModelBoundary — captura falhas de carregamento/parse de modelos 3D dentro da
 * cena e troca por um fallback (nunca derruba a arena). `resetKey` permite
 * tentar de novo quando a raça/asset muda.
 */

import { Component, type ReactNode } from 'react';

type Props = {
  fallback: ReactNode;
  resetKey?: unknown;
  children: ReactNode;
};

type State = { failed: boolean };

export default class ModelBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
