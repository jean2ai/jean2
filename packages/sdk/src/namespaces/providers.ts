import type { ClientMessage } from '../shared';

export class ProvidersNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  connect(provider: string): void {
    this.send({ type: 'provider.connect', provider });
  }

  disconnect(provider: string): void {
    this.send({ type: 'provider.disconnect', provider });
  }
}
