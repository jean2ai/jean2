import {
  getDeliveriesDueForRetry,
  markDeliveryDelivered,
  markDeliveryFailed,
  markDeliveryRetryable,
  markDeliveryExhausted,
  getPushSubscriptionForDispatch,
  deleteAllOldDeliveries,
} from '@/store/web-push';
import type { PushDeliveryRow } from '@/store/web-push';
import { sendWebPush } from './credentials';
import type { NotificationEventType, Jean2PushPayloadV1 } from '@jean2/sdk';

const RETRY_INTERVAL_MS = 120_000; // 2 minutes
const PUSH_TTL_SECONDS = 2419200; // 28 days max
const RETRY_BACKOFF_MS = 120_000; // 2 minutes

let retryInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Build the privacy-safe push payload for a retry attempt.
 * Reconstructs from stored delivery metadata.
 */
function buildPayload(
  delivery: PushDeliveryRow,
  subscription: NonNullable<ReturnType<typeof getPushSubscriptionForDispatch>>,
): Jean2PushPayloadV1 {
  const route = `/server/${subscription.client_server_id}/workspace/session/${delivery.event_id.includes('permission:') ? '' : delivery.event_id}`;
  // For retries we need the session ID, which is not stored on the delivery row.
  // We parse it from the event ID pattern:
  //   message:<messageId>:completed -> need sessionId from subscription context
  //   permission:<requestId> -> route to root session
  // Since we don't have sessionId on the delivery row, we use a minimal route
  // that opens the root session. This is a known limitation of the retry path;
  // the first delivery attempt has the correct deep-link route.
  return {
    version: 1,
    eventId: delivery.event_id,
    type: delivery.event_type as NotificationEventType,
    serverId: subscription.client_server_id,
    sessionId: '',
    createdAt: delivery.created_at,
    route,
  };
}

/**
 * Attempt to re-deliver a single pending_retry delivery.
 */
async function retryDelivery(delivery: PushDeliveryRow): Promise<void> {
  const subscription = getPushSubscriptionForDispatch(delivery.subscription_id);
  if (!subscription) {
    // Subscription was deleted (e.g. 404 cleanup). Mark as permanently failed.
    markDeliveryFailed(delivery.event_id, delivery.subscription_id, 'Subscription no longer exists');
    return;
  }

  const payload = buildPayload(delivery, subscription);
  const payloadStr = JSON.stringify(payload);

  try {
    const result = await sendWebPush({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      payload: payloadStr,
      ttl: PUSH_TTL_SECONDS,
    });

    if (result.success) {
      markDeliveryDelivered(delivery.event_id, delivery.subscription_id);
      return;
    }

    if (result.statusCode === 404 || result.statusCode === 410) {
      markDeliveryFailed(delivery.event_id, delivery.subscription_id, `HTTP ${result.statusCode}`);
      return;
    }

    if (delivery.attempt_count + 1 >= 5) {
      markDeliveryExhausted(delivery.event_id, delivery.subscription_id);
      return;
    }

    const nextAttempt = Date.now() + RETRY_BACKOFF_MS * (delivery.attempt_count + 1);
    markDeliveryRetryable(
      delivery.event_id,
      delivery.subscription_id,
      `HTTP ${result.statusCode}`,
      nextAttempt,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (delivery.attempt_count + 1 >= 5) {
      markDeliveryExhausted(delivery.event_id, delivery.subscription_id);
      return;
    }
    const nextAttempt = Date.now() + RETRY_BACKOFF_MS * (delivery.attempt_count + 1);
    markDeliveryRetryable(delivery.event_id, delivery.subscription_id, message, nextAttempt);
  }
}

async function tick(): Promise<void> {
  const now = Date.now();
  const dueDeliveries = getDeliveriesDueForRetry(now);
  if (dueDeliveries.length === 0) return;

  for (const delivery of dueDeliveries) {
    try {
      await retryDelivery(delivery);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[web-push] Retry tick error for ${delivery.event_id}: ${message}`);
    }
  }
}

/**
 * Start the push delivery retry loop.
 * Runs on a 2-minute interval, re-dispatching deliveries marked as
 * 'pending_retry' whose next_attempt_at has passed.
 */
export function startPushRetryScheduler(): void {
  if (retryInterval) return;
  console.log('[web-push] Starting delivery retry scheduler (120s interval)');
  retryInterval = setInterval(() => {
    void tick().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[web-push] Retry scheduler tick error: ${message}`);
    });
  }, RETRY_INTERVAL_MS);

  // Run an immediate tick on startup to retry deliveries left from a crash/restart
  void tick().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[web-push] Startup retry tick error: ${message}`);
  });
}

/**
 * Stop the push delivery retry loop.
 */
export function stopPushRetryScheduler(): void {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log('[web-push] Stopped delivery retry scheduler');
  }
}

/**
 * Clean up old delivery records and expired subscriptions.
 * Called at server startup. Deletes delivery records older than 30 days.
 */
export function cleanupPushData(): void {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const deleted = deleteAllOldDeliveries(thirtyDaysAgo);
  if (deleted > 0) {
    console.log(`[web-push] Cleaned up ${deleted} old delivery record(s)`);
  }
}
