import type { Hono } from 'hono';
import { validate } from './validate';
import {
  upsertPushSubscription,
  updatePushSubscriptionPreferences,
  deletePushSubscription,
} from '@/store';
import { getVapidCredentials, isWebPushAvailable } from '@/services/web-push/credentials';
import { getPermissionTimeoutMs } from '@/env';
import { NotFoundError } from '@/utils/http-errors';
import { upsertSubscriptionSchema, updateSubscriptionPreferencesSchema } from './schemas';

export function registerNotificationRoutes(app: Hono): void {
  /**
   * GET /api/notifications/config
   * Returns public notification configuration: VAPID public key and
   * the configurable permission timeout.
   */
  app.get('/api/notifications/config', (c) => {
    const available = isWebPushAvailable();
    const creds = available ? getVapidCredentials() : null;

    return c.json({
      available,
      vapidPublicKey: creds?.publicKey ?? '',
      permissionTimeoutMs: getPermissionTimeoutMs(),
    });
  });

  /**
   * PUT /api/notifications/subscriptions
   * Authenticated upsert using endpoint uniqueness.
   */
  app.put(
    '/api/notifications/subscriptions',
    validate('json', upsertSubscriptionSchema),
    (c) => {
      const body = c.req.valid('json');
      const subscription = upsertPushSubscription({
        clientId: body.clientId,
        clientServerId: body.clientServerId,
        clientOrigin: body.clientOrigin,
        subscription: {
          endpoint: body.subscription.endpoint,
          expirationTime: body.subscription.expirationTime ?? null,
          keys: {
            p256dh: body.subscription.keys.p256dh,
            auth: body.subscription.keys.auth,
          },
        },
        preferences: body.preferences,
      });
      return c.json({ subscription });
    },
  );

  /**
   * PATCH /api/notifications/subscriptions/:id
   * Update only event preferences for a subscription.
   */
  app.patch(
    '/api/notifications/subscriptions/:id',
    validate('json', updateSubscriptionPreferencesSchema),
    (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');
      const subscription = updatePushSubscriptionPreferences(id, body.preferences);
      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }
      return c.json({ subscription });
    },
  );

  /**
   * DELETE /api/notifications/subscriptions/:id
   * Delete the server registration. Idempotent.
   */
  app.delete('/api/notifications/subscriptions/:id', (c) => {
    const id = c.req.param('id');
    deletePushSubscription(id);
    return c.json({ success: true });
  });
}
