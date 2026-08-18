/**
 * @file Integrations' half of ADR-049 Decision 4: maps `agent-tools.ts`'s 5 catalog entries onto
 * the list/create/pause/delete/deliveries operations `server/routes/admin/integrations/*.ts`
 * expose, as `ToolRegistration`s. See `agent-tools.ts`'s own file header for the two whole classes
 * of operation deliberately absent (subscription update; signing-secret rotation/generation/
 * reveal).
 *
 * Authorization shape: none of `createSubscription`/`pauseSubscription`/`deleteSubscription`
 * (`subscriptions.ts`) accept an `authorize` dependency at all — `WebhookSubscriptionDeps` has no
 * such field, so the domain functions never gate themselves. Every admin route therefore calls
 * `authorize()` inline as its own first line (`create.ts`'s own comment: "checked directly via
 * authorize() — mirrors members/disable.ts's pattern since subscription mutations are a direct
 * feature call, not routed through the SPEC-001 command gateway"), and every handler below does the
 * same via the kit's `requireToolPermission`.
 */
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  optionalBoolean,
  optionalNumber,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { registerToolContributor } from "#src/assistant/index";
import type { OriginRegistryPort } from "../origin";
import { getWebhooksAgentToolCatalog } from "./agent-tools";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "./ports";
import {
  createSubscription,
  deleteSubscription,
  pauseSubscription,
  WebhookSubscriptionNotFoundError,
} from "./subscriptions";
import type { WebhookDeliveryRecord, WebhookSubscriptionRecord } from "./types";

const CATALOG_BY_ID = indexCatalogById(getWebhooksAgentToolCatalog());

/**
 * The exact slice of the route-deps bag Integrations' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface IntegrationsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  originRegistry: OriginRegistryPort;
}

/**
 * Bound on how many of a subscription's most recent deliveries are read to compute the
 * "last delivery" summary shown per row in `webhooks_list_subscriptions`. Duplicated from
 * `routes/admin/integrations/list.ts`'s own `LAST_DELIVERY_LOOKUP_LIMIT` (a literal, not logic —
 * importing from `server/routes` would invert this codebase's ports/adapters direction, the same
 * reasoning `features/settings/tool-registrations.ts`'s header gives for duplicating
 * `resolveUserLayerReadTarget`).
 */
const LAST_DELIVERY_LOOKUP_LIMIT = 50;

/** Default/cap for `webhooks_get_deliveries`' `limit` — duplicated from
 * `routes/admin/integrations/deliveries.ts`'s own constants, same reasoning as above. */
const DEFAULT_DELIVERIES_LIMIT = 50;
const MAX_DELIVERIES_LIMIT = 200;

function clampDeliveriesLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return DEFAULT_DELIVERIES_LIMIT;
  return Math.min(Math.floor(requested), MAX_DELIVERIES_LIMIT);
}

/** Most recent delivery by `createdAt`, computed here rather than assumed from repo return order —
 * `WebhookDeliveryRepoPort.listBySubscription` makes no ordering guarantee (mirrors
 * `server/http/admin/integrations.ts`'s route-layer helper of the same name/shape, duplicated
 * rather than imported for the same ports/adapters reason as the constants above). */
function mostRecentDelivery(deliveries: readonly WebhookDeliveryRecord[]): WebhookDeliveryRecord | null {
  if (deliveries.length === 0) return null;
  return deliveries.reduce((latest, candidate) => (candidate.createdAt > latest.createdAt ? candidate : latest));
}

/** Model-facing subscription view — drops `ownerPrincipalId`/`createdByPrincipalId`/
 * `createdByPluginId` (attribution internals no wired tool's follow-up call consumes; mirrors
 * `newsletter/tool-registrations.ts`'s identical reasoning for dropping actor attribution). Never
 * includes a secret value — `WebhookSubscriptionRecord` has no secret field to begin with (see
 * `agent-tools.ts`'s file header). */
function toSubscriptionToolView(subscription: WebhookSubscriptionRecord, lastDelivery: WebhookDeliveryRecord | null) {
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
    lastDelivery: lastDelivery ? toDeliveryToolView(lastDelivery) : null,
  };
}

/** Model-facing delivery view — drops `workspaceId` (redundant: every call is already scoped to
 * the caller's own workspace). */
function toDeliveryToolView(delivery: WebhookDeliveryRecord) {
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

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const webhooksDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> webhookSubscriptionRepo.listByWorkspace() + webhookDeliveryRepo.listBySubscription() (bounded,
  //    per subscription): reads only.
  ["webhooks_list_subscriptions", "none"],
  // -> webhookSubscriptionRepo.findById() + webhookDeliveryRepo.listBySubscription(): reads only.
  ["webhooks_get_deliveries", "none"],
  // -> createSubscription (subscriptions.ts): validates + repo.insert().
  ["webhooks_create_subscription", "mutates-durable-state"],
  // -> pauseSubscription (subscriptions.ts): status flip + repo.save().
  ["webhooks_pause_subscription", "mutates-durable-state"],
  // -> deleteSubscription (subscriptions.ts): soft-delete status flip + repo.save(). Never
  //    row-deletes, but classified `deletes-durable-state` (not `mutates-durable-state`): no
  //    un-disable/reactivate path exists anywhere in this domain, so there is no agent-reachable
  //    undo — the same standard `content_post_delete` is classified under.
  ["webhooks_delete_subscription", "deletes-durable-state"],
]);

export function buildWebhooksRegistrations(routeDeps: IntegrationsToolDeps): ToolRegistration[] {
  const isAllowedTarget = (url: string) => routeDeps.originRegistry.isAllowedEgressTarget({ workspaceId: routeDeps.workspaceId }, url);

  const handlers: Record<string, ToolHandler> = {
    webhooks_list_subscriptions: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.integrations.manage", entityType: "webhook_subscription" });

      const subscriptions = await routeDeps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: routeDeps.workspaceId });
      const views = await Promise.all(
        subscriptions.map(async (subscription) => {
          const recentDeliveries = await routeDeps.webhookDeliveryRepo.listBySubscription({
            workspaceId: routeDeps.workspaceId,
            subscriptionId: subscription.id,
            limit: LAST_DELIVERY_LOOKUP_LIMIT,
          });
          return toSubscriptionToolView(subscription, mostRecentDelivery(recentDeliveries));
        }),
      );
      return { subscriptions: views };
    },

    webhooks_get_deliveries: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const subscriptionId = requireString(input, "subscriptionId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.integrations.manage",
        entityType: "webhook_subscription",
        entityId: subscriptionId,
      });

      const subscription = await routeDeps.webhookSubscriptionRepo.findById({ workspaceId: routeDeps.workspaceId, id: subscriptionId });
      if (!subscription) throw new WebhookSubscriptionNotFoundError(`webhook subscription '${subscriptionId}' was not found`);

      const deliveries = await routeDeps.webhookDeliveryRepo.listBySubscription({
        workspaceId: routeDeps.workspaceId,
        subscriptionId,
        limit: clampDeliveriesLimit(optionalNumber(input, "limit")),
      });
      const newestFirst = [...deliveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { deliveries: newestFirst.map(toDeliveryToolView) };
    },

    webhooks_create_subscription: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.integrations.manage", entityType: "webhook_subscription" });

      const rawTopics = input.topics;
      const { subscription } = await createSubscription({
        deps: { clock: routeDeps.clock, repo: routeDeps.webhookSubscriptionRepo, idGenerator: routeDeps.idGen, isAllowedTarget },
        input: {
          workspaceId: routeDeps.workspaceId,
          // Mirrors `create.ts`'s own dev-mode placeholder: this codebase has no per-agent-run
          // owner-principal concept yet, so the owner is the same run principal the permission
          // check above already authorized (never a caller-supplied id).
          ownerPrincipalId: ctx.principal.id,
          createdByPrincipalId: ctx.principal.id,
          label: requireString(input, "label"),
          targetUrl: requireString(input, "targetUrl"),
          topics: Array.isArray(rawTopics) ? rawTopics.map(String) : [],
        },
      });
      return { subscription: toSubscriptionToolView(subscription, null) };
    },

    webhooks_pause_subscription: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const subscriptionId = requireString(input, "subscriptionId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.integrations.manage",
        entityType: "webhook_subscription",
        entityId: subscriptionId,
      });

      const { subscription } = await pauseSubscription(
        {
          deps: { clock: routeDeps.clock, repo: routeDeps.webhookSubscriptionRepo, idGenerator: routeDeps.idGen, isAllowedTarget },
          input: { workspaceId: routeDeps.workspaceId, id: subscriptionId },
        },
        { paused: optionalBoolean(input, "paused") ?? true },
      );
      return { subscription: toSubscriptionToolView(subscription, null) };
    },

    webhooks_delete_subscription: async (ctx) => {
      const subscriptionId = requireString(requireInputRecord(ctx.input), "subscriptionId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.integrations.manage",
        entityType: "webhook_subscription",
        entityId: subscriptionId,
      });

      const { subscription } = await deleteSubscription({
        deps: { clock: routeDeps.clock, repo: routeDeps.webhookSubscriptionRepo, idGenerator: routeDeps.idGen, isAllowedTarget },
        input: { workspaceId: routeDeps.workspaceId, id: subscriptionId },
      });
      return { subscription: toSubscriptionToolView(subscription, null) };
    },
  };

  return buildDomainRegistrations({
    domain: "integrations",
    catalogModule: "webhooks/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: webhooksDerivedRisk,
  });
}

/**
 * Contributes Integrations' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWebhooksRegistrations`/
 * `webhooksDerivedRisk` by name; this is the seam that replaced it (Stage 2 batch 2).
 *
 * The original ordering theory for this batch (convert `source-control`/`deployments`/`media`
 * first, since they were believed to import `integrations`, removing `assistant`'s indirect path
 * into it) turned out not to be the operative risk: all three of those domains' imports of
 * `src/webhooks` are `import type` only (erased from the runtime graph `check:architecture`'s
 * cycle/SCC metric is computed on), and all three were reverted this batch anyway for an UNRELATED
 * cycle (through `features/vendor-credentials`/`widgets`, not `integrations`). Re-verified directly
 * instead: the only VALUE importers of `src/webhooks` anywhere in the tree are `server/app.ts`
 * and `server/modules/integrations.ts` (both server-layer, never reachable from `assistant`), so a
 * one-directional `integrations -> assistant` registry edge closes no cycle — confirmed via
 * `check:architecture` (cycles/SCC stayed at 0 after this edit).
 *
 * `domain: "integrations"` below is the tool-contribution-registry's own key for this module —
 * deliberately NOT renamed to "webhooks" alongside the tool IDs above. That key is live subject
 * matter for a concurrent session's in-flight registry rollout (see `tool-contribution-registry.
 * test.ts`'s currently-failing DOMAIN_SLICES collision checks); changing it here risked colliding
 * with work this task was told not to touch. Flagged for the coordinator, not decided here.
 */
export function contributeWebhooksTools(): void {
  registerToolContributor({ domain: "integrations", build: buildWebhooksRegistrations, risk: webhooksDerivedRisk });
}
