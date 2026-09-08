/**
 * @file Redirects' half of ADR-049 Decision 4 (SPEC-009): maps `agent-tools.ts`'s wireable 6 of 7
 * catalog entries onto the list/get/hits/create/update/tombstone operations `server/routes/admin/
 * redirects/*.ts` expose, as `ToolRegistration`s. `redirects_import` is deliberately excluded — see
 * `agent-tools.ts`'s own file header for the full reasoning.
 *
 * Authorization shape: none of `createRedirect`/`updateRedirect`/`tombstoneRedirect`
 * (`redirects.ts`) accept an `authorize` dependency at all — `RedirectsWriteDeps` has no such field,
 * so the chokepoint itself never gates. Every admin route therefore calls `authorize()` inline as
 * its own first line, and every handler below does the same via the kit's `requireToolPermission`,
 * mirroring those routes' identical check (ADR-021 §2's single evaluator, located at the handler
 * here rather than inside the domain function).
 */
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireNumber,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { ToolContributor } from "#src/assistant/index";
import {
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import { getRedirectsAgentToolCatalog } from "./agent-tools.js";
import type { RedirectHitSink, RedirectRepoPort } from "./ports.js";
import {
  createRedirect,
  tombstoneRedirect,
  updateRedirect,
  type RedirectsWriteDeps,
} from "./redirects.js";
import { RedirectNotFoundError } from "./types.js";
import type {
  RedirectMatchType,
  RedirectRecord,
  RedirectSource,
  RedirectStatus,
  RedirectStatusCode,
} from "./types.js";

const CATALOG_BY_ID = indexCatalogById(getRedirectsAgentToolCatalog());

/**
 * The exact slice of the route-deps bag Redirects' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface RedirectsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  redirectRepo: RedirectRepoPort;
  redirectHitSink: RedirectHitSink;
  redirectsWriteDeps: RedirectsWriteDeps;
}

/** Model-facing redirect-rule view — drops `workspaceId` (redundant: every call is already scoped
 * to the caller's own workspace) and the actor/lineage-attribution internals
 * (`createdByPrincipal`/`createdByPluginId`/`sourceEntryId`/`fromPathAtCapture`/`toPathAtCapture`)
 * that no wired tool's follow-up call consumes — mirrors `newsletter/tool-registrations.ts`'s
 * `toCampaignToolView`'s identical reasoning for dropping actor attribution. */
function toRedirectToolView(record: RedirectRecord) {
  return {
    id: record.id,
    matchType: record.matchType,
    fromPattern: record.fromPattern,
    toTarget: record.toTarget,
    statusCode: record.statusCode,
    status: record.status,
    override: record.override,
    priority: record.priority,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

const REDIRECTS_TOMBSTONE_TOOL_ID = "redirects_tombstone";

/** The `ui://` URI for one tombstone-confirmation instance — keyed by the exchange id, mirroring
 *  `comments/tool-registrations.ts`'s identical `trashConfirmationUri`. */
function tombstoneConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/redirects-tombstone/${exchangeId}` as UIResourceUri;
}

/**
 * Renders `redirects_tombstone`'s confirmation dialog. Jini's `buildConfirmationSurface` owns HOW
 * the dialog behaves; this only decides WHAT it says.
 *
 * @complexity O(1).
 */
function buildTombstoneConfirmationResource(spec: {
  rule: { fromPattern: string; toTarget: string; status: RedirectStatus };
  exchangeId: string;
}): UIResource {
  const { rule, exchangeId } = spec;
  return buildConfirmationSurface({
    uri: tombstoneConfirmationUri(exchangeId),
    title: "Disable this redirect?",
    description: "The redirect rule will stop matching requests immediately. It is reversible — set status back to 'active' with redirects_update.",
    details: [
      { label: "From", value: rule.fromPattern },
      { label: "To", value: rule.toTarget },
      { label: "Current status", value: rule.status },
    ],
    danger: true,
    confirm: {
      label: "Disable redirect",
      toolName: REDIRECTS_TOMBSTONE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: REDIRECTS_TOMBSTONE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-redirects-tombstone", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration — and note that `redirects_import` appears NOWHERE here, which is
 * itself the strongest of the guards: an unclassified id cannot be wired at all.
 */
export const redirectsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> redirectRepo.list(): read only.
  ["redirects_list", "none"],
  // -> redirectRepo.findById(): read only.
  ["redirects_get", "none"],
  // -> redirectRepo.findById() + redirectHitSink.getStats(): read only.
  ["redirects_get_hits", "none"],
  // -> createRedirect (redirects.ts): validate -> write record + revision in one tx -> enqueue event.
  ["redirects_create", "mutates-durable-state"],
  // -> updateRedirect (redirects.ts): same write shape as create.
  ["redirects_update", "mutates-durable-state"],
  // -> tombstoneRedirect (redirects.ts): status flip + revision write (no-op if already disabled).
  ["redirects_tombstone", "mutates-durable-state"],
]);

/** Redirects catalog entries this pass does not wire, and why — see `agent-tools.ts`'s own file
 * header for the full reasoning. */
const UNWIRED_REDIRECTS_TOOL_IDS = new Set([
  // EXCLUDED BY DESIGN: bulk (1-500 rules) write behind one call — same caution class as
  // Newsletter's excluded newsletter_import_subscriptions.
  "redirects_import",
]);

export function buildRedirectsRegistrations(
  routeDeps: RedirectsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    redirects_list: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect" });

      const rules = await routeDeps.redirectRepo.list({
        workspaceId: routeDeps.workspaceId,
        status: optionalString(input, "status") as RedirectStatus | undefined,
        source: optionalString(input, "source") as RedirectSource | undefined,
        matchType: optionalString(input, "matchType") as RedirectMatchType | undefined,
      });
      return { rules: rules.map(toRedirectToolView) };
    },

    redirects_get: async (ctx) => {
      const id = requireString(requireInputRecord(ctx.input), "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);
      return { rule: toRedirectToolView(rule) };
    },

    redirects_get_hits: async (ctx) => {
      const id = requireString(requireInputRecord(ctx.input), "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);

      const stats = await routeDeps.redirectHitSink.getStats({ workspaceId: routeDeps.workspaceId, redirectId: id });
      return { stats: stats ?? { redirectId: id, workspaceId: routeDeps.workspaceId, hitCount: 0, lastHitAt: undefined } };
    },

    redirects_create: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect" });

      const { record } = await createRedirect({
        deps: routeDeps.redirectsWriteDeps,
        input: {
          workspaceId: routeDeps.workspaceId,
          matchType: requireString(input, "matchType") as RedirectMatchType,
          fromPattern: requireString(input, "fromPattern"),
          toTarget: requireString(input, "toTarget"),
          statusCode: requireNumber(input, "statusCode") as RedirectStatusCode,
          override: optionalBoolean(input, "override"),
          priority: optionalNumber(input, "priority"),
          actorId: ctx.principal.id,
        },
      });
      return { rule: toRedirectToolView(record) };
    },

    redirects_update: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect", entityId: id });

      const { record } = await updateRedirect({
        deps: routeDeps.redirectsWriteDeps,
        input: {
          workspaceId: routeDeps.workspaceId,
          id,
          matchType: optionalString(input, "matchType") as RedirectMatchType | undefined,
          fromPattern: optionalString(input, "fromPattern"),
          toTarget: optionalString(input, "toTarget"),
          statusCode: optionalNumber(input, "statusCode") as RedirectStatusCode | undefined,
          status: optionalString(input, "status") as RedirectStatus | undefined,
          override: optionalBoolean(input, "override"),
          priority: optionalNumber(input, "priority"),
          actorId: ctx.principal.id,
        },
      });
      return { rule: toRedirectToolView(record) };
    },

    /**
     * The MCP-UI-gated tombstone — migrated onto the shared held-open confirmation exchange
     * (2026-09-08, ADS-memory/reports/2026-09-08-delete-confirmation-build.md). `tombstoneRedirect`
     * is idempotent (a second call against an already-disabled rule is a no-op — see this file's own
     * header/`redirectsDerivedRisk` comment), so there is no staleness window to re-check the way
     * `content_post_delete` needs one: whatever the row looks like at confirm time, tombstoning it
     * again is always safe.
     */
    redirects_tombstone: async (ctx) => {
      const id = requireString(requireInputRecord(ctx.input), "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.redirects.manage", entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);

      if (!ctx.emitSurface) {
        throw new Error(
          "redirects_tombstone: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a destructive tombstone cannot be gated here. Nothing was changed."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: REDIRECTS_TOMBSTONE_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildTombstoneConfirmationResource({
        rule: { fromPattern: rule.fromPattern, toTarget: rule.toTarget, status: rule.status },
        exchangeId: exchange.id,
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        if (!outcome.confirmed) {
          if (outcome.reason === "declined") {
            return { tombstoned: false, cancelled: true, rule: toRedirectToolView(rule) };
          }
          return {
            tombstoned: false,
            cancelled: false,
            reason: outcome.reason,
            note:
              outcome.reason === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was changed."
                : "The confirmation dialog was closed because the run ended. Nothing was changed.",
          };
        }

        const { record } = await tombstoneRedirect({
          deps: routeDeps.redirectsWriteDeps,
          input: { workspaceId: routeDeps.workspaceId, id, actorId: ctx.principal.id },
        });
        return { tombstoned: true, cancelled: false, rule: toRedirectToolView(record) };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  return buildDomainRegistrations({
    domain: "redirects",
    catalogModule: "redirects/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: redirectsDerivedRisk,
    unwiredToolIds: UNWIRED_REDIRECTS_TOOL_IDS,
  });
}

/**
 * Contributes Redirects' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildRedirectsRegistrations`/
 * `redirectsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 of the
 * rollout — no sibling domain still statically wired through `assistant` imports `redirects`, so this
 * one-directional `redirects -> assistant` call closes no new cycle).
 */
export function contributeRedirectsTools(): ToolContributor {
  return { domain: "redirects", build: buildRedirectsRegistrations, risk: redirectsDerivedRisk };
}
