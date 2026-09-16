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
import { ToolInputError } from "@jini-ai/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { ToolContributor } from "#src/assistant/index";
import {
  forbiddenRule,
  withModelFacingErrors,
  type ModelFacingErrorRule,
} from "#src/contracts/core/model-facing-tool-errors";
import {
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import type { OriginRegistryPort } from "../../features/origin/index.js";
import { getWebhooksAgentToolCatalog } from "./agent-tools.js";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "./ports.js";
import {
  createSubscription,
  deleteSubscription,
  pauseSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
} from "./subscriptions.js";
import type { WebhookDeliveryRecord, WebhookSubscriptionRecord } from "./types.js";

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

const WEBHOOKS_DELETE_TOOL_ID = "webhooks_delete_subscription";

/** The `ui://` URI for one delete-confirmation instance — keyed by the exchange id, mirroring
 *  `comments/tool-registrations.ts`'s identical `trashConfirmationUri`. */
function deleteConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/webhooks-delete-subscription/${exchangeId}` as UIResourceUri;
}

/**
 * Renders `webhooks_delete_subscription`'s confirmation dialog. Jini's `buildConfirmationSurface`
 * owns HOW the dialog behaves; this only decides WHAT it says. The warning is unconditional (unlike
 * `content_post_delete`'s status-gated one) because `webhooks_delete_subscription` is classified
 * `deletes-durable-state` precisely because there is no un-disable path anywhere in this domain — see
 * `webhooksDerivedRisk`'s own comment on that entry.
 *
 * @complexity O(1).
 */
function buildDeleteConfirmationResource(spec: {
  subscription: { label: string; targetUrl: string; status: string };
  exchangeId: string;
}): UIResource {
  const { subscription, exchangeId } = spec;
  return buildConfirmationSurface({
    uri: deleteConfirmationUri(exchangeId),
    title: "Delete this webhook subscription?",
    description: "The subscription will stop receiving deliveries.",
    details: [
      { label: "Label", value: subscription.label },
      { label: "Target URL", value: subscription.targetUrl },
      { label: "Current status", value: subscription.status },
    ],
    warning: "There is no un-delete for a webhook subscription — reconnecting it means creating a new one, with a new signing secret.",
    danger: true,
    confirm: {
      label: "Delete subscription",
      toolName: WEBHOOKS_DELETE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: WEBHOOKS_DELETE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-webhooks-delete-subscription", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
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

/**
 * The Integrations errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism and for why
 * this list is an ALLOWLIST rather than a blanket unwrap.
 *
 * Reviewed against this domain's secret handling before listing anything, because Integrations is
 * the one domain in this sweep that holds credential material at all. Nothing on this list can
 * carry it: `WebhookSubscriptionValidationError` is raised only by `subscriptions.ts`'s own
 * label/topics/target_url checks (every construction site interpolates the CALLER's submitted
 * `targetUrl` or nothing at all), and `WebhookSubscriptionNotFoundError` interpolates the caller's
 * own id. The HMAC signing secret is never stored and never named by either class — it is derived
 * at delivery time by `KeyringPort.deriveSigningSecret` and lives entirely in `signing.ts`/
 * `keyring.env.ts`, whose errors (`RootKeyFileAlreadyExistsError` among them) are deliberately
 * ABSENT here: they are operator/installation faults naming real filesystem paths, exactly the
 * class of internals this allowlist exists to keep redacted.
 *
 * `WebhookDeliveryVetoedError` (`delivery.ts`) is absent for a different reason — it is raised on
 * the OUTBOUND send path, which no tool in this catalog calls, so listing it would be speculative.
 */
const WEBHOOKS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule("WEBHOOKS"),
  { error: WebhookSubscriptionNotFoundError, code: "WEBHOOKS_SUBSCRIPTION_NOT_FOUND" },
  { error: WebhookSubscriptionValidationError, code: "WEBHOOKS_VALIDATION_FAILED" },
];

export function buildWebhooksRegistrations(
  routeDeps: IntegrationsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
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

    /**
     * The MCP-UI-gated delete — migrated onto the shared held-open confirmation exchange
     * (2026-09-08, ADS-memory/reports/2026-09-08-delete-confirmation-build.md). No separate
     * staleness re-check: `deleteSubscription` performs its own fresh existence lookup at write
     * time (confirmed by reading it in full — no `expectedVersion`/optimistic-concurrency field
     * anywhere in its input), so whatever the row looks like at confirm time is exactly what gets
     * deleted, or a fresh `WebhookSubscriptionNotFoundError` if it is gone by then.
     */
    webhooks_delete_subscription: async (ctx) => {
      const subscriptionId = requireString(requireInputRecord(ctx.input), "subscriptionId");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.integrations.manage",
        entityType: "webhook_subscription",
        entityId: subscriptionId,
      });

      const existing = await routeDeps.webhookSubscriptionRepo.findById({ workspaceId: routeDeps.workspaceId, id: subscriptionId });
      if (!existing) throw new WebhookSubscriptionNotFoundError(`webhook subscription '${subscriptionId}' was not found`);

      if (!ctx.emitSurface) {
        // A `ToolInputError`, not a bare `Error`: that marker is the only thing keeping this out of
        // the `errorKind: 'internal'` bucket the delegated-tool transport SEC-005-redacts, and a
        // model that is told only "500" here will retry a delete that can never succeed in this
        // context. The message names no internals — only the missing capability and the fact that
        // nothing was deleted, which is exactly what the caller needs to stop and ask a human.
        throw new ToolInputError(
          "WEBHOOKS_NO_CONFIRMATION_CHANNEL: webhooks_delete_subscription: this execution context has " +
            "no interactive confirmation channel (no emitSurface), so a destructive delete cannot be " +
            "gated here. Nothing was deleted."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: WEBHOOKS_DELETE_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildDeleteConfirmationResource({
        subscription: { label: existing.label, targetUrl: existing.targetUrl, status: existing.status },
        exchangeId: exchange.id,
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        if (!outcome.confirmed) {
          if (outcome.reason === "declined") {
            return { deleted: false, cancelled: true, subscription: toSubscriptionToolView(existing, null) };
          }
          return {
            deleted: false,
            cancelled: false,
            reason: outcome.reason,
            note:
              outcome.reason === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was deleted."
                : "The confirmation dialog was closed because the run ended. Nothing was deleted.",
          };
        }

        const { subscription } = await deleteSubscription({
          deps: { clock: routeDeps.clock, repo: routeDeps.webhookSubscriptionRepo, idGenerator: routeDeps.idGen, isAllowedTarget },
          input: { workspaceId: routeDeps.workspaceId, id: subscriptionId },
        });
        return { deleted: true, cancelled: false, subscription: toSubscriptionToolView(subscription, null) };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  return buildDomainRegistrations({
    domain: "integrations",
    catalogModule: "webhooks/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    // The whole map at once, so no handler can be the one that forgot — see
    // `withModelFacingErrors`' own doc for why a per-call-site reshape is the defect this avoids.
    handlers: withModelFacingErrors(handlers, WEBHOOKS_MODEL_FACING_ERRORS),
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
export function contributeWebhooksTools(): ToolContributor {
  return { domain: "integrations", build: buildWebhooksRegistrations, risk: webhooksDerivedRisk };
}
