/**
 * @file Integrations' half of ADR-049 Decision 4, the host binding: the catalog, the six handlers,
 * the authored risk map and the typed-error mapping live in `@jini-ai/integrations/webhooks/tools`
 * (`buildWebhooksToolRegistrations`). This file supplies what is Tovu's: the route deps (read live,
 * clock converted to epoch milliseconds), the delete's confirmation dialog and its wording
 * (`approvalToolHandler`, `notConfirmedResult`), the search vocabulary and approval policy
 * (`toolMetadata`), and the default surface store.
 */
import { withToolMetadata, type ToolContributor, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { OriginRegistryPort } from "@jini-ai/core/contracts/server/verified-origin";
import { contentReadVocabulary } from "../../contracts/core/tool-metadata/content-read.js";
import {
  buildWebhooksToolRegistrations,
  webhooksDerivedRisk,
  type WebhooksDeleteSteps,
  type WebhooksPackageToolDeps,
} from "@jini-ai/integrations/webhooks/tools";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { ChatDeleteSurfaceDeps } from "#src/contracts/core/chat-delete-grant";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "../../contracts/core/tool-metadata/webhooks.js";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "./ports.js";

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
  return withToolMetadata({ registrations: buildWebhooksToolRegistrations({ deps: toPackageDeps({ routeDeps }), surfaces }, { hostReads: contentReadVocabulary }), metadata: toolMetadata });
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
