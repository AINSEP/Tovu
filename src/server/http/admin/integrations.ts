import type { WebhookDeliveryRecord, WebhookSubscriptionRecord } from "#src/integrations/index";

/**
 * @file Admin HTTP response DTOs for the `integrations` webhook subsystem (ADR-036).
 *
 * Purpose:
 * Projects `WebhookSubscriptionRecord`/`WebhookDeliveryRecord` (the internal, repo-shaped rows)
 * into the JSON the admin UI consumes, mirroring `./posts.ts`'s `toAdminPostResponse` role.
 *
 * How it relates to the project:
 * - Called by `../../routes/admin/integrations/*` route registrars, never by feature code.
 * - No signing secret ever flows through here: `WebhookSubscriptionRecord` has no secret field
 *   to begin with (ADR-036 §5 derive-not-store — only `secretVersion`/`previousSecretVersion`,
 *   which name a generation, not the key material itself), so there is nothing to redact. This
 *   comment exists precisely so a future field addition to the record gets the same scrutiny.
 *
 * Architectural role:
 * Pure projection functions. No I/O, no business rules — those stay in `../../../integrations`.
 */

export interface AdminWebhookDeliverySummary {
  id: string;
  status: WebhookDeliveryRecord["status"];
  attempts: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface AdminWebhookSubscriptionResponse {
  id: string;
  label: string;
  targetUrl: string;
  topics: string[];
  status: WebhookSubscriptionRecord["status"];
  secretVersion: number;
  previousSecretVersion: number | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  /** Most recent delivery attempt for this subscription, or `null` if none has fired yet. */
  lastDelivery: AdminWebhookDeliverySummary | null;
}

export interface AdminWebhookDeliveryResponse {
  id: string;
  subscriptionId: string;
  eventId: string;
  topic: string;
  status: WebhookDeliveryRecord["status"];
  attempts: number;
  nextAttemptAt: string;
  lastResponseStatus: number | null;
  lastError: string | null;
  signedWithVersion: number | null;
  createdAt: string;
  deliveredAt: string | null;
  deadAt: string | null;
}

/**
 * Project a subscription row + its (already-resolved) most recent delivery into the admin list
 * response shape. Never emits secret material — see the file header.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminSubscriptionResponse(required: {
  subscription: WebhookSubscriptionRecord;
  lastDelivery: WebhookDeliveryRecord | null;
}): AdminWebhookSubscriptionResponse {
  const { subscription, lastDelivery } = required;
  return {
    id: subscription.id,
    label: subscription.label,
    targetUrl: subscription.targetUrl,
    topics: [...subscription.topics],
    status: subscription.status,
    secretVersion: subscription.secretVersion,
    previousSecretVersion: subscription.previousSecretVersion,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    disabledAt: subscription.disabledAt,
    lastDelivery: lastDelivery ? toAdminDeliverySummary(lastDelivery) : null,
  };
}

/**
 * Project a delivery row into the compact summary shown inline on the subscription list.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminDeliverySummary(delivery: WebhookDeliveryRecord): AdminWebhookDeliverySummary {
  return {
    id: delivery.id,
    status: delivery.status,
    attempts: delivery.attempts,
    lastResponseStatus: delivery.lastResponseStatus,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt,
    deliveredAt: delivery.deliveredAt,
  };
}

/**
 * Project a delivery row into the full detail shape shown in the per-subscription delivery log.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function toAdminDeliveryResponse(delivery: WebhookDeliveryRecord): AdminWebhookDeliveryResponse {
  return {
    id: delivery.id,
    subscriptionId: delivery.subscriptionId,
    eventId: delivery.eventId,
    topic: delivery.topic,
    status: delivery.status,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt,
    lastResponseStatus: delivery.lastResponseStatus,
    lastError: delivery.lastError,
    signedWithVersion: delivery.signedWithVersion,
    createdAt: delivery.createdAt,
    deliveredAt: delivery.deliveredAt,
    deadAt: delivery.deadAt,
  };
}
