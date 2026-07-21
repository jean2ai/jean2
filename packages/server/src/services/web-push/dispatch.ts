import { getTerminalNotificationEventId } from '@jean2/sdk';
import type { AssistantMessage, Session, Jean2PushPayloadV1, NotificationEventType } from '@jean2/sdk';
import {
  listEnabledSubscriptionsForEvent,
  reserveDelivery,
  markDeliveryDelivered,
  markDeliveryFailed,
  markDeliveryRetryable,
  deleteStaleSubscription,
  type PushSubscriptionRow,
} from '@/store/web-push';
import { sendWebPush } from './credentials';
import { getSession } from '@/store/sessions';
import { getScheduledJob } from '@/store/scheduled-jobs';

const PUSH_DISPATCH_DELAY_MS = 3_000;
const PUSH_TTL_SECONDS = 2419200; // 28 days max

/**
 * Determine whether a session is eligible for scheduled-event notifications.
 *
 * - Normal sessions (no metadata.scheduledJobId) are always eligible.
 * - Scheduled sessions are eligible only when their job exists and has
 *   notificationsEnabled set to true. A missing job record fails closed.
 */
function canNotifyForSession(session: Session | null): boolean {
  if (!session) {
    return false;
  }

  const scheduledJobId = session.metadata?.scheduledJobId;
  if (scheduledJobId === undefined || scheduledJobId === null) {
    return true;
  }

  if (typeof scheduledJobId !== 'string' || scheduledJobId === '') {
    return false;
  }

  const job = getScheduledJob(scheduledJobId);
  return job?.notificationsEnabled === true;
}

interface PendingNotificationDispatch {
  sessionId: string;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingTerminalDispatches = new Map<string, PendingNotificationDispatch>();

/**
 * Build the privacy-safe push payload for a single subscription.
 * The route is constructed per-subscription using its client_server_id.
 */
function buildPayload(
  subscription: PushSubscriptionRow,
  eventId: string,
  eventType: NotificationEventType,
  sessionId: string,
): Jean2PushPayloadV1 {
  const route = `/server/${subscription.client_server_id}/workspace/session/${sessionId}`;
  return {
    version: 1,
    eventId,
    type: eventType,
    serverId: subscription.client_server_id,
    sessionId,
    createdAt: Date.now(),
    route,
  };
}

/**
 * Dispatch a notification event to all enabled subscriptions.
 *
 * Reserves delivery rows atomically before sending to guarantee idempotency.
 * Sends pushes asynchronously with fully contained errors: push failure never
 * rejects the caller or alters session/message/ask state.
 */
export async function dispatchNotification(input: {
  eventId: string;
  eventType: NotificationEventType;
  sessionId: string;
}): Promise<void> {
  const { eventId, eventType, sessionId } = input;

  const subscriptions = listEnabledSubscriptionsForEvent(eventType);
  if (subscriptions.length === 0) {
    console.info(`[web-push] No enabled subscriptions for ${eventType}`, { eventId });
    return;
  }

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const isNew = reserveDelivery({
        eventId,
        subscriptionId: sub.id,
        eventType,
      });
      if (!isNew) {
        return; // Already dispatched or reserved
      }

      const payload = buildPayload(sub, eventId, eventType, sessionId);
      const payloadStr = JSON.stringify(payload);

      try {
        const result = await sendWebPush({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
          payload: payloadStr,
          ttl: PUSH_TTL_SECONDS,
        });

        if (result.success) {
          markDeliveryDelivered(eventId, sub.id);
          console.info('[web-push] Delivery succeeded', {
            eventId,
            eventType,
            subscriptionId: sub.id,
          });
          return;
        }

        const hasInvalidVapidToken = result.statusCode === 403
          && result.body?.includes('BadJwtToken') === true;

        // Invalid endpoints and subscriptions tied to obsolete VAPID keys
        // cannot recover without a new browser subscription.
        if (result.statusCode === 404 || result.statusCode === 410 || hasInvalidVapidToken) {
          deleteStaleSubscription(sub.id);
          console.warn('[web-push] Removed stale subscription', {
            eventId,
            eventType,
            subscriptionId: sub.id,
            statusCode: result.statusCode,
            reason: hasInvalidVapidToken ? 'invalid_vapid_token' : 'invalid_endpoint',
          });
          return;
        }

        // Network errors, 429, and 5xx responses are transient.
        if (result.statusCode === 0 || result.statusCode === 429 || result.statusCode >= 500) {
          const error = result.statusCode === 0
            ? result.body ?? 'Web Push network error'
            : `HTTP ${result.statusCode}`;
          const nextAttempt = Date.now() + 60_000;
          markDeliveryRetryable(eventId, sub.id, error, nextAttempt);
          console.warn('[web-push] Delivery scheduled for retry', {
            eventId,
            eventType,
            subscriptionId: sub.id,
            statusCode: result.statusCode,
            error,
          });
          return;
        }

        // Other 4xx responses are permanent failures.
        const error = `HTTP ${result.statusCode}: ${result.body ?? ''}`;
        markDeliveryFailed(eventId, sub.id, error);
        console.warn('[web-push] Delivery failed permanently', {
          eventId,
          eventType,
          subscriptionId: sub.id,
          statusCode: result.statusCode,
          error,
        });
      } catch (err: unknown) {
        // Network error: transient, record for retry
        const message = err instanceof Error ? err.message : String(err);
        const nextAttempt = Date.now() + 60_000;
        markDeliveryRetryable(eventId, sub.id, message, nextAttempt);
        console.warn('[web-push] Delivery scheduled for retry', {
          eventId,
          eventType,
          subscriptionId: sub.id,
          statusCode: 0,
          error: message,
        });
      }
    }),
  );
}

function scheduleTerminalNotification(input: {
  eventId: string;
  eventType: NotificationEventType;
  sessionId: string;
}): void {
  if (pendingTerminalDispatches.has(input.eventId)) {
    return;
  }

  const timeout = setTimeout(() => {
    pendingTerminalDispatches.delete(input.eventId);
    dispatchNotification(input).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[web-push] Terminal message dispatch failed: ${message}`);
    });
  }, PUSH_DISPATCH_DELAY_MS);

  pendingTerminalDispatches.set(input.eventId, {
    sessionId: input.sessionId,
    timeout,
  });
}

export function acknowledgePendingNotification(
  eventId: string,
  sessionId: string,
  clientId: string,
): boolean {
  const pending = pendingTerminalDispatches.get(eventId);
  if (!pending || pending.sessionId !== sessionId) {
    return false;
  }

  clearTimeout(pending.timeout);
  pendingTerminalDispatches.delete(eventId);
  console.info('[web-push] Delivery suppressed by active client', {
    eventId,
    sessionId,
    clientId,
  });
  return true;
}

/**
 * Check whether an assistant message is a top-level terminal message that
 * should produce a completion or failure notification.
 *
 * Excludes subagent messages (parentId set), compaction summaries, and
 * non-terminal statuses.
 */
function shouldNotifyTerminalMessage(
  message: AssistantMessage,
  session: Session | null,
): { eventType: NotificationEventType; eventId: string } | null {
  if (!session) {
    return null;
  }

  // Top-level only: parentId must be null
  if (session.parentId !== null) {
    return null;
  }

  // Assistant role only
  if (message.role !== 'assistant') {
    return null;
  }

  // Exclude compaction summaries and synthetic messages
  if (message.summary || message.mode === 'compaction') {
    return null;
  }

  if (message.status === 'completed') {
    // Scheduled sessions require per-job opt-in
    if (!canNotifyForSession(session)) {
      return null;
    }
    return {
      eventType: 'session_completed',
      eventId: getTerminalNotificationEventId(message.id, 'completed'),
    };
  }

  if (message.status === 'error') {
    // Scheduled sessions require per-job opt-in
    if (!canNotifyForSession(session)) {
      return null;
    }
    return {
      eventType: 'session_failed',
      eventId: getTerminalNotificationEventId(message.id, 'error'),
    };
  }

  return null;
}

/**
 * Trigger a notification for a terminal assistant message.
 *
 * Called immediately after terminal message persistence in chat-handler.ts
 * and child-session.ts. Fire-and-forget: push failure must not alter message
 * or session state.
 */
export function notifyTerminalMessage(
  message: AssistantMessage,
  sessionId: string,
): void {
  const session = getSession(sessionId);
  const result = shouldNotifyTerminalMessage(message, session);
  if (!result) {
    return;
  }

  scheduleTerminalNotification({
    eventId: result.eventId,
    eventType: result.eventType,
    sessionId,
  });
}

/**
 * Dispatch a permission notification only when the ask remains pending and
 * the root session is eligible. Exported separately so the delayed production
 * path and focused tests use the same decision logic.
 */
export async function dispatchPendingPermissionNotification(
  requestId: string,
  rootSessionId: string,
): Promise<void> {
  const { getPermissionRequestByRequestId } = await import('@/store/pending-asks');
  const pending = getPermissionRequestByRequestId(requestId);
  if (!pending || pending.status !== 'pending') {
    return;
  }

  const session = getSession(rootSessionId);
  if (!canNotifyForSession(session)) {
    return;
  }

  await dispatchNotification({
    eventId: `permission:${requestId}`,
    eventType: 'permission_required',
    sessionId: rootSessionId,
  });
}

export function notifyPermissionRequired(
  requestId: string,
  rootSessionId: string,
): void {
  setTimeout(() => {
    dispatchPendingPermissionNotification(requestId, rootSessionId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[web-push] Permission dispatch failed: ${msg}`);
    });
  }, PUSH_DISPATCH_DELAY_MS);
}
