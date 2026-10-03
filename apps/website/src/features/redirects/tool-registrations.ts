import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
/**
 * @file Redirects' half of ADR-049 Decision 4 (SPEC-009): maps `agent-tools.ts`'s 7 catalog entries
 * onto the list/get/hits/create/update/tombstone/import operations `server/routes/admin/
 * redirects/*.ts` expose, as `ToolRegistration`s. All 7 are wired (2026-09-24: `redirects_import`
 * joined the other 6 — see `agent-tools.ts`'s own file header for why).
 *
 * Authorization shape: none of `createRedirect`/`updateRedirect`/`tombstoneRedirect`
 * (`redirects.ts`) accept an `authorize` dependency at all — `RedirectsWriteDeps` has no such field,
 * so the chokepoint itself never gates. Every admin route therefore calls `authorize()` inline as
 * its own first line, and every handler below does the same via the kit's `requireToolPermission`,
 * mirroring those routes' identical check (ADR-021 §2's single evaluator, located at the handler
 * here rather than inside the domain function).
 */
import { buildDomainRegistrations, indexCatalogById, isRecord, optionalBoolean, optionalNumber, optionalString, requireInputRecord, requireNumber, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { type AuthorizeFn, requireToolPermission } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import type { ToolContributor } from "#src/assistant/index";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import { getRedirectsAgentToolCatalog } from "./agent-tools.js";
import type { RedirectHitSink, RedirectRepoPort } from "./ports.js";
import {
  createRedirect,
  importRedirects,
  tombstoneRedirect,
  updateRedirect,
  MAX_IMPORT_BATCH_SIZE,
  type RedirectsWriteDeps,
} from "./redirects.js";
import { RedirectNotFoundError } from "./types.js";
import type {
  CreateRedirectInput,
  RedirectMatchType,
  RedirectRecord,
  RedirectSource,
  RedirectStatus,
  RedirectStatusCode,
} from "./types.js";

const CATALOG_BY_ID = indexCatalogById({ catalog: getRedirectsAgentToolCatalog() });

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

/** See `trash/trash-item-tool.ts`'s identical constant's doc — duplicated here rather than
 *  imported, the same "structurally typed, no `features/trash` import" convention this domain's
 *  `TombstoneRedirectRequired.input.pluginId` already follows. */
const ASSISTANT_ACTOR_PLUGIN_ID = "assistant";

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
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
  // -> importRedirects (redirects.ts): createRedirect in a loop, one call each — same write shape
  //    as redirects_create, N times, with a per-item try/catch (EC-08).
  ["redirects_import", "mutates-durable-state"],
]);

export function buildRedirectsRegistrations(
  routeDeps: RedirectsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    redirects_list: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect" });

      const rules = await routeDeps.redirectRepo.list({
        workspaceId: routeDeps.workspaceId,
        status: optionalString({ input: input, key: "status" }) as RedirectStatus | undefined,
        source: optionalString({ input: input, key: "source" }) as RedirectSource | undefined,
        matchType: optionalString({ input: input, key: "matchType" }) as RedirectMatchType | undefined,
      });
      return { rules: rules.map(toRedirectToolView) };
    },

    redirects_get: async (ctx) => {
      const id = requireString({ input: requireInputRecord({ input: ctx.input }), key: "id" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);
      return { rule: toRedirectToolView(rule) };
    },

    redirects_get_hits: async (ctx) => {
      const id = requireString({ input: requireInputRecord({ input: ctx.input }), key: "id" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);

      const stats = await routeDeps.redirectHitSink.getStats({ workspaceId: routeDeps.workspaceId, redirectId: id });
      return { stats: stats ?? { redirectId: id, workspaceId: routeDeps.workspaceId, hitCount: 0, lastHitAt: undefined } };
    },

    redirects_create: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect" });

      const { record } = await createRedirect({
        deps: routeDeps.redirectsWriteDeps,
        input: {
          workspaceId: routeDeps.workspaceId,
          matchType: requireString({ input: input, key: "matchType" }) as RedirectMatchType,
          fromPattern: requireString({ input: input, key: "fromPattern" }),
          toTarget: requireString({ input: input, key: "toTarget" }),
          statusCode: requireNumber({ input: input, key: "statusCode" }) as RedirectStatusCode,
          override: optionalBoolean({ input: input, key: "override" }),
          priority: optionalNumber({ input: input, key: "priority" }),
          actorId: ctx.principal.id,
        },
      });
      return { rule: toRedirectToolView(record) };
    },

    redirects_update: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const id = requireString({ input: input, key: "id" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect", entityId: id });

      const { record } = await updateRedirect({
        deps: routeDeps.redirectsWriteDeps,
        input: {
          workspaceId: routeDeps.workspaceId,
          id,
          matchType: optionalString({ input: input, key: "matchType" }) as RedirectMatchType | undefined,
          fromPattern: optionalString({ input: input, key: "fromPattern" }),
          toTarget: optionalString({ input: input, key: "toTarget" }),
          statusCode: optionalNumber({ input: input, key: "statusCode" }) as RedirectStatusCode | undefined,
          status: optionalString({ input: input, key: "status" }) as RedirectStatus | undefined,
          override: optionalBoolean({ input: input, key: "override" }),
          priority: optionalNumber({ input: input, key: "priority" }),
          actorId: ctx.principal.id,
        },
      });
      return { rule: toRedirectToolView(record) };
    },

    /** Reversibly tombstones the redirect after authorization; repeated tombstoning is a no-op. */
    redirects_tombstone: async (ctx) => {
      const id = requireString({ input: requireInputRecord({ input: ctx.input }), key: "id" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect", entityId: id });

      const rule = await routeDeps.redirectRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);

      const { record } = await tombstoneRedirect({
        deps: routeDeps.redirectsWriteDeps,
        input: { workspaceId: routeDeps.workspaceId, id, actorId: ctx.principal.id, pluginId: ASSISTANT_ACTOR_PLUGIN_ID },
      });
      return { tombstoned: true, cancelled: false, rule: toRedirectToolView(record) };

    },

    // Wired 2026-09-24 (tool-design audit F2/F3, dispatch item 3) — see `agent-tools.ts`'s file
    // header for why the earlier "mass autonomous change" exclusion no longer holds. No confirmation
    // gate: same reversible, single-chokepoint risk envelope as `redirects_create`, just N rows.
    redirects_import: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.redirects.manage" }, { entityType: "redirect" });

      if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPORT_BATCH_SIZE) {
        throw new ToolInputError({ message: `'rules' (array of 1-${MAX_IMPORT_BATCH_SIZE} items) is required` });
      }

      const rules: CreateRedirectInput[] = input.rules.map((raw, index) => {
        const candidate = { value: raw };
        if (!isRecord(candidate)) throw new ToolInputError({ message: `rules[${index}] must be an object` });
        const rule = candidate.value;
        return {
          workspaceId: routeDeps.workspaceId,
          matchType: requireString({ input: rule, key: "matchType" }) as RedirectMatchType,
          fromPattern: requireString({ input: rule, key: "fromPattern" }),
          toTarget: requireString({ input: rule, key: "toTarget" }),
          statusCode: requireNumber({ input: rule, key: "statusCode" }) as RedirectStatusCode,
          override: optionalBoolean({ input: rule, key: "override" }),
          priority: optionalNumber({ input: rule, key: "priority" }),
          actorId: ctx.principal.id,
        };
      });

      const { created, failed } = await importRedirects({
        deps: routeDeps.redirectsWriteDeps,
        input: { workspaceId: routeDeps.workspaceId, actorId: ctx.principal.id, rules },
      });
      return { created: created.map(toRedirectToolView), failed };
    },
  };

  return buildDomainRegistrations({
    domain: "redirects",
    catalogModule: "redirects/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: redirectsDerivedRisk,
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
