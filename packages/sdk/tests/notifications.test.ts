import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { HttpClient } from '../src/transport/http';
import { NotificationsNamespace } from '../src/namespaces/notifications';
import { NotificationsRestNamespace } from '../src/rest/notifications';
import type { ClientMessage } from '../src/shared';
import type { WebPushSubscriptionInput } from '../src/shared-types/notification';

const originalFetch = globalThis.fetch;

function createMockHttp(fetchImpl: (url: string, init: RequestInit) => Promise<Response>): HttpClient {
  globalThis.fetch = mock(fetchImpl) as typeof fetch;
  return new HttpClient({ url: 'https://example.com', token: 'test-token' });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('NotificationsNamespace', () => {
  test('sends a notification acknowledgement', () => {
    let sent: ClientMessage | null = null;
    const namespace = new NotificationsNamespace((message) => {
      sent = message;
    });

    namespace.acknowledge('message:msg-1:completed', 'session-1');

    expect(sent).toEqual({
      type: 'notification.acknowledge',
      eventId: 'message:msg-1:completed',
      sessionId: 'session-1',
    });
  });
});

describe('NotificationsRestNamespace', () => {
  let capturedUrl: string;
  let capturedInit: RequestInit;

  beforeEach(() => {
    capturedUrl = '';
    capturedInit = {} as RequestInit;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getConfig', () => {
    test('GET /notifications/config with correct method and path', async () => {
      const http = createMockHttp(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse({
          available: true,
          vapidPublicKey: 'BPub_key_here',
          permissionTimeoutMs: 1800000,
        });
      });

      const ns = new NotificationsRestNamespace(http);
      const result = await ns.getConfig();

      expect(capturedUrl).toBe('https://example.com/api/notifications/config');
      expect(capturedInit.method).toBe('GET');
      expect(result.available).toBe(true);
      expect(result.vapidPublicKey).toBe('BPub_key_here');
      expect(result.permissionTimeoutMs).toBe(1800000);
    });

    test('forwards abort signal', async () => {
      const http = createMockHttp(async (_url, init) => {
        capturedInit = init;
        return jsonResponse({ available: true, vapidPublicKey: 'key', permissionTimeoutMs: 1000 });
      });

      const controller = new AbortController();
      const ns = new NotificationsRestNamespace(http);
      await ns.getConfig({ signal: controller.signal });

      expect(capturedInit.signal).toBe(controller.signal);
    });
  });

  describe('upsertSubscription', () => {
    test('PUT /notifications/subscriptions with full body and method', async () => {
      const http = createMockHttp(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse({
          subscription: {
            id: 'sub-123',
            clientId: 'client-1',
            clientServerId: 'srv-1',
            clientOrigin: 'https://app.example.com',
            expirationTime: null,
            preferences: { completion: true, permission: true },
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        });
      });

      const subscription: WebPushSubscriptionInput = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        expirationTime: null,
        keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
      };

      const ns = new NotificationsRestNamespace(http);
      const result = await ns.upsertSubscription({
        clientId: 'client-1',
        clientServerId: 'srv-1',
        clientOrigin: 'https://app.example.com',
        subscription,
        preferences: { completion: true, permission: true },
      });

      expect(capturedUrl).toBe('https://example.com/api/notifications/subscriptions');
      expect(capturedInit.method).toBe('PUT');
      const body = JSON.parse(capturedInit.body as string);
      expect(body.clientId).toBe('client-1');
      expect(body.clientServerId).toBe('srv-1');
      expect(body.clientOrigin).toBe('https://app.example.com');
      expect(body.subscription.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc');
      expect(body.subscription.keys.p256dh).toBe('p256dh-val');
      expect(body.subscription.keys.auth).toBe('auth-val');
      expect(body.preferences.completion).toBe(true);
      expect(body.preferences.permission).toBe(true);
      expect(result.subscription.id).toBe('sub-123');
      expect(result.subscription.preferences.completion).toBe(true);
    });

    test('response does not include endpoint or encryption keys', async () => {
      const http = createMockHttp(async () => {
        return jsonResponse({
          subscription: {
            id: 'sub-123',
            clientId: 'client-1',
            clientServerId: 'srv-1',
            clientOrigin: 'https://app.example.com',
            expirationTime: null,
            preferences: { completion: true, permission: true },
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        });
      });

      const ns = new NotificationsRestNamespace(http);
      const result = await ns.upsertSubscription({
        clientId: 'client-1',
        clientServerId: 'srv-1',
        clientOrigin: 'https://app.example.com',
        subscription: {
          endpoint: 'https://push.example.com/abc',
          expirationTime: null,
          keys: { p256dh: 'p', auth: 'a' },
        },
        preferences: { completion: true, permission: true },
      });

      const record = result.subscription as Record<string, unknown>;
      expect(record).not.toHaveProperty('endpoint');
      expect(record).not.toHaveProperty('keys');
    });
  });

  describe('updatePreferences', () => {
    test('PATCH /notifications/subscriptions/:id with preferences only', async () => {
      const http = createMockHttp(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse({
          subscription: {
            id: 'sub-123',
            clientId: 'client-1',
            clientServerId: 'srv-1',
            clientOrigin: 'https://app.example.com',
            expirationTime: null,
            preferences: { completion: false, permission: true },
            createdAt: 1700000000000,
            updatedAt: 1700000000001,
          },
        });
      });

      const ns = new NotificationsRestNamespace(http);
      await ns.updatePreferences('sub-123', {
        preferences: { completion: false, permission: true },
      });

      expect(capturedUrl).toBe('https://example.com/api/notifications/subscriptions/sub-123');
      expect(capturedInit.method).toBe('PATCH');
      const body = JSON.parse(capturedInit.body as string);
      expect(body.preferences.completion).toBe(false);
      expect(body.preferences.permission).toBe(true);
      expect(body).not.toHaveProperty('clientId');
      expect(body).not.toHaveProperty('subscription');
    });

    test('encodes subscription id in path', async () => {
      const http = createMockHttp(async (url) => {
        capturedUrl = url;
        return jsonResponse({
          subscription: {
            id: 'a/b',
            clientId: 'c',
            clientServerId: 's',
            clientOrigin: 'o',
            expirationTime: null,
            preferences: { completion: true, permission: true },
            createdAt: 1,
            updatedAt: 1,
          },
        });
      });

      const ns = new NotificationsRestNamespace(http);
      await ns.updatePreferences('a/b', {
        preferences: { completion: true, permission: true },
      });

      expect(capturedUrl).toContain('/notifications/subscriptions/a%2Fb');
    });
  });

  describe('deleteSubscription', () => {
    test('DELETE /notifications/subscriptions/:id', async () => {
      const http = createMockHttp(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse({ success: true });
      });

      const ns = new NotificationsRestNamespace(http);
      const result = await ns.deleteSubscription('sub-123');

      expect(capturedUrl).toBe('https://example.com/api/notifications/subscriptions/sub-123');
      expect(capturedInit.method).toBe('DELETE');
      expect(result.success).toBe(true);
    });
  });

  describe('authorization header', () => {
    test('all methods include bearer token', async () => {
      const http = createMockHttp(async (_url, init) => {
        capturedInit = init;
        return jsonResponse({ success: true });
      });

      const ns = new NotificationsRestNamespace(http);
      await ns.deleteSubscription('sub-1');

      const headers = capturedInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });
});
