import { describe, expect, test } from 'bun:test';
import { TypedEventEmitter } from '../src/emitter';
import { routeServerMessage } from '../src/types/server-messages';
import type { SdkEventMap } from '../src/types/server-messages';

interface ProviderStatusEvent {
  provider: string;
  connected: boolean;
  authorizationUrl?: string;
  error?: string;
  reauthRequired?: boolean;
}

describe('provider status message routing', () => {
  test('preserves the reauthentication status', () => {
    const emitter = new TypedEventEmitter<SdkEventMap>();
    let received: ProviderStatusEvent | undefined;

    emitter.on('provider.status', (
      provider,
      connected,
      authorizationUrl,
      error,
      reauthRequired,
    ) => {
      received = {
        provider,
        connected,
        authorizationUrl,
        error,
        reauthRequired,
      };
    });

    routeServerMessage(emitter, {
      type: 'provider.status',
      provider: 'gmail',
      connected: false,
      error: 'Reconnect Gmail to continue.',
      reauthRequired: true,
    });

    expect(received).toEqual({
      provider: 'gmail',
      connected: false,
      authorizationUrl: undefined,
      error: 'Reconnect Gmail to continue.',
      reauthRequired: true,
    });
  });
});
