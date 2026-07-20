import type { HttpClient } from '../transport/http';
import type {
  GetNotificationConfigResponse,
  UpsertSubscriptionResponse,
  UpdateSubscriptionPreferencesResponse,
  DeleteSubscriptionResponse,
} from '../types/rest-responses';
import type {
  NotificationPreferences,
  WebPushSubscriptionInput,
} from '../shared-types/notification';

interface GetConfigOptions {
  signal?: AbortSignal;
}

interface UpsertSubscriptionOptions {
  clientId: string;
  clientServerId: string;
  clientOrigin: string;
  subscription: WebPushSubscriptionInput;
  preferences: NotificationPreferences;
  signal?: AbortSignal;
}

interface UpdatePreferencesOptions {
  preferences: NotificationPreferences;
  signal?: AbortSignal;
}

interface DeleteOptions {
  signal?: AbortSignal;
}

export class NotificationsRestNamespace {
  constructor(private http: HttpClient) {}

  /**
   * GET /api/notifications/config
   * Returns public notification configuration (VAPID public key, timeouts).
   */
  async getConfig(options?: GetConfigOptions): Promise<GetNotificationConfigResponse> {
    return this.http.get('/notifications/config', { signal: options?.signal });
  }

  /**
   * PUT /api/notifications/subscriptions
   * Authenticated upsert using endpoint uniqueness.
   */
  async upsertSubscription(
    options: UpsertSubscriptionOptions,
  ): Promise<UpsertSubscriptionResponse> {
    const { signal, ...body } = options;
    return this.http.put('/notifications/subscriptions', body, { signal });
  }

  /**
   * PATCH /api/notifications/subscriptions/:id
   * Update only event preferences for a subscription.
   */
  async updatePreferences(
    id: string,
    options: UpdatePreferencesOptions,
  ): Promise<UpdateSubscriptionPreferencesResponse> {
    const { signal, ...body } = options;
    return this.http.patch(`/notifications/subscriptions/${encodeURIComponent(id)}`, body, {
      signal,
    });
  }

  /**
   * DELETE /api/notifications/subscriptions/:id
   * Delete the server registration.
   */
  async deleteSubscription(id: string, options?: DeleteOptions): Promise<DeleteSubscriptionResponse> {
    return this.http.delete(`/notifications/subscriptions/${encodeURIComponent(id)}`, {
      signal: options?.signal,
    });
  }
}
