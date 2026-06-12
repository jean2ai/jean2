import type { ClientMessage } from '../shared';
import type { OAuthRedirectStrategy } from '../shared-types/oauth';

export class ProvidersNamespace {
  constructor(private send: (msg: ClientMessage) => void) {}

  connect(provider: string, redirectStrategy?: OAuthRedirectStrategy): void {
    this.send({ type: 'provider.connect', provider, redirectStrategy });
  }

  disconnect(provider: string): void {
    this.send({ type: 'provider.disconnect', provider });
  }
}
