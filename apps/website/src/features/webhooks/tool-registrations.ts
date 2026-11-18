/**
 * @file Integrations' half of ADR-049 Decision 4: maps `agent-tools.ts`'s 6 catalog entries onto
 * the list/create/pause/delete/deliveries operations `server/routes/admin/integrations/*.ts`
 * expose, as `ToolRegistration`s. The owner's 2026-10-09 update authorization supersedes that catalog's historical update
 * exclusion; signing-secret rotation/generation/reveal remains excluded.
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
  ToolPermissionDeniedError,
  buildDomainRegistrations,
  indexCatalogById,
  withToolMetadata,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolContributor,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import { forbiddenRule, withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
import { versionConflictRule } from "@jini-ai/core/optimistic-concurrency";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { WebhookSubscriptionNotFoundError, WebhookSubscriptionValidationError } from "@jini-ai/integrations/webhooks";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { ChatDeleteSurfaceDeps } from "#src/contracts/core/chat-delete-grant";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/webhooks.js";
import { getWebhooksAgentToolCatalog } from "./agent-tools.js";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "./ports.js";
import {
  webhooksCreateSubscriptionHandler,
  webhooksDeleteSubscriptionHandler,
  webhooksGetDeliveriesHandler,
  webhooksListSubscriptionsHandler,
  webhooksPauseSubscriptionHandler,
  webhooksUpdateSubscriptionHandler,
} from "./tool-handlers.js";
import type { WebhooksDeleteSteps, WebhooksPackageToolDeps, WebhooksToolSurfaces } from "./tool-handlers.types.js";

const CATALOG_BY_ID = indexCatalogById({ catalog: getWebhooksAgentToolCatalog() });

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

const WEBHOOKS_DELETE_TOOL_ID = "webhooks_delete_subscription";

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
  // Existing updateSubscription validates replacement fields and the outbound origin before save.
  ["webhooks_update_subscription", "mutates-durable-state"],
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
 * `keyring.env.ts`, whose errors (`SiteKeyFileAlreadyExistsError` among them) are deliberately
 * ABSENT here: they are operator/installation faults naming real filesystem paths, exactly the
 * class of internals this allowlist exists to keep redacted.
 *
 * `WebhookDeliveryVetoedError` (`delivery.ts`) is absent for a different reason — it is raised on
 * the OUTBOUND send path, which no tool in this catalog calls, so listing it would be speculative.
 */
const WEBHOOKS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  versionConflictRule({ readToolId: "content_read.webhook_subscription" }),
  forbiddenRule({ domainPrefix: "WEBHOOKS", error: ToolPermissionDeniedError }),
  { error: WebhookSubscriptionNotFoundError, code: "WEBHOOKS_SUBSCRIPTION_NOT_FOUND" },
  { error: WebhookSubscriptionValidationError, code: "WEBHOOKS_VALIDATION_FAILED" },
];

/**
 * The webhook tool registrations over the package-side deps: handlers, authored risk map and the
 * typed-error mapping. The host's search vocabulary and approval policy are bound afterwards by
 * `buildWebhooksRegistrations`.
 */
export function buildWebhooksToolRegistrations(
  { deps, surfaces }: { deps: WebhooksPackageToolDeps; surfaces: WebhooksToolSurfaces },
  _optional = {},
): ToolRegistration[] {
  const args = { deps, surfaces };
  const handlers: Record<string, ToolHandler> = {
    webhooks_list_subscriptions: webhooksListSubscriptionsHandler(args),
    webhooks_get_deliveries: webhooksGetDeliveriesHandler(args),
    webhooks_create_subscription: webhooksCreateSubscriptionHandler(args),
    webhooks_update_subscription: webhooksUpdateSubscriptionHandler(args),
    webhooks_pause_subscription: webhooksPauseSubscriptionHandler(args),
    webhooks_delete_subscription: webhooksDeleteSubscriptionHandler(args),
  };

  return buildDomainRegistrations({
    domain: "integrations",
    catalogModule: "webhooks/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    // The whole map at once, so no handler can be the one that forgot — see
    // `withModelFacingErrors`' own doc for why a per-call-site reshape is the defect this avoids.
    handlers: withModelFacingErrors({ handlers, rules: WEBHOOKS_MODEL_FACING_ERRORS }),
    derivedRisk: webhooksDerivedRisk,
  });
}

/**
 * The delete's confirmation as the host runs it: Tovu's approval handler with Tovu's dialog
 * wording. The package supplies what is prepared, what runs after a confirm and what the model
 * is told when nothing was confirmed.
 */
function confirmWebhookDelete(steps: WebhooksDeleteSteps, _optional = {}): ToolHandler {
  return approvalToolHandler({ surfaces: steps.surfaces,
    prepare: steps.prepare,
    /**
     * Describes `webhooks_delete_subscription`'s confirmation dialog. Jini's approval owner
     * owns HOW the dialog behaves; this only decides WHAT it says. The warning is unconditional (unlike
     * `content_post_delete`'s status-gated one) because `webhooks_delete_subscription` is classified
     * `deletes-durable-state` precisely because there is no un-disable path anywhere in this domain — see
     * `webhooksDerivedRisk`'s own comment on that entry.
     *
     * @complexity O(1).
     */
    describe: ({ prepared: { existing } }) => ({
      toolId: WEBHOOKS_DELETE_TOOL_ID, errorCode: "WEBHOOKS",
      title: "Delete this webhook subscription?", description: "The subscription will stop receiving deliveries.",
      details: [{ label: "Count", value: "1" }, { label: "Webhook", value: `${existing.label} (${existing.id})` }, { label: "Target origin", value: new URL(existing.targetUrl).origin }, { label: "Topics", value: existing.topics.join(", ") }, { label: "Current status", value: existing.status }],
      warning: "There is no un-delete for a webhook subscription — reconnecting it means creating a new one, with a new signing secret.",
      danger: true, confirmLabel: "Delete subscription",
    }),
    run: steps.run,
  }, { flag: "deleted", batch: true, declined: steps.declined });
}

/** The package-side deps for one set of route deps: the clock is converted to epoch milliseconds,
 * and the confirmation dialog, its wording and its not-confirmed result are the host's.
 * The route deps bag is a live object (a host can swap its authorizer or repos after the
 * registrations are built), so every field is read from it at call time, never copied here. */
function toPackageDeps({ routeDeps }: { routeDeps: IntegrationsToolDeps }, _optional = {}): WebhooksPackageToolDeps {
  return {
    get authorize() { return routeDeps.authorize; },
    get workspaceId() { return routeDeps.workspaceId; },
    clock: { nowMs: () => Date.parse(routeDeps.clock.nowIso()) },
    get idGen() { return routeDeps.idGen; },
    get webhookSubscriptionRepo() { return routeDeps.webhookSubscriptionRepo; },
    get webhookDeliveryRepo() { return routeDeps.webhookDeliveryRepo; },
    get originRegistry() { return routeDeps.originRegistry; },
    confirmDelete: confirmWebhookDelete,
    notConfirmedResult,
  };
}

export function buildWebhooksRegistrations(
  routeDeps: IntegrationsToolDeps,
  surfaces: ChatDeleteSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return withToolMetadata({ registrations: buildWebhooksToolRegistrations({ deps: toPackageDeps({ routeDeps }), surfaces }), metadata: toolMetadata });
}

/**
 * Contributes Integrations' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWebhooksRegistrations`/
 * `webhooksDerivedRisk` by name; this is the seam that replaced it (Stage 2 batch 2).
 *
 * The original ordering theory for this batch (convert `source-control`/`deployments`/`media`
 * first, since they were believed to import `integrations`, removing `assistant`'s indirect path
 * into it) turned out not to be the operative risk: all three of those domains' imports of
 * `src/webhooks` are `import type` only (erased from the runtime graph `check:architecture`'s
 * cycle/SCC metric is computed on), and all three were reverted this batch anyway for an UNRELATED
 * cycle (through `features/vendor-credentials`/`widgets`, not `integrations`). Re-verified directly
 * instead: the only VALUE importers of `src/webhooks` anywhere in the tree are `server/runtime/composition/app.ts`
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
export function contributeWebhooksTools(): ToolContributor<IntegrationsToolDeps, AssistantSurfaceDeps> {
  return { domain: "integrations", build: buildWebhooksRegistrations, risk: webhooksDerivedRisk };
}
