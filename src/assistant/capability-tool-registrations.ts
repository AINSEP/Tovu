import {
  buildDomainRegistrations,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireString,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import { buildCapabilityCatalogQuery, type CapabilityCatalogQuery } from "./capability-catalog-query.js";
import { listCapabilitySources, type CapabilitySourceContext } from "./capability-source-registry.js";
import { registerToolContributor } from "./tool-contribution-registry.js";

/**
 * @file `capability_search` + `capability_get` — the one pair of native tools every registered
 * `CapabilitySource` (`capability-source-registry.ts`) feeds, instead of each source declaring its
 * own tool ids. `features/agent-plugins/capability-source.ts` is the first (and today, only) source;
 * a future one (a preview-only MCP server, say) registers into the same seam and is discoverable
 * through this SAME pair with no edit here.
 *
 * **No boot-path wiring, no HTTP routes.** Nothing in `agent-daemon-server.ts` builds the catalog
 * eagerly, and there is no `/api/capabilities/search` mirroring `@jini-ai/http-kit`'s
 * `/api/tools/search` — these are native `ToolRegistration`s, discovered the same way every other
 * tool is, via `capability_search` itself. This is what keeps this slice's scope to exactly what it
 * is: a searchable/gettable discovery surface, not a second capability-execution path.
 *
 * **Lazy, memoized as a shared IN-FLIGHT PROMISE, not a boolean flag.** `ToolContributor.build` stays
 * synchronous (it returns two ordinary `ToolRegistration`s immediately), but gathering cards from
 * every registered source is inherently async — each `CapabilitySource.list(ctx)` is a `Promise`.
 * The gather therefore happens lazily, inside the handlers' closures, on the first REAL call, and the
 * in-flight `Promise` itself (not a `built: boolean` flag set only after it resolves) is what is
 * cached: two calls arriving before the first gather has resolved both see the SAME pending promise
 * and await it together, rather than a boolean-flag race letting a second call start a redundant
 * second gather before the first one has had a chance to set the flag.
 *
 * **Never `process.env.TOVU_WORKSPACE`.** `buildCapabilityToolRegistrations(routeDeps)` captures
 * `routeDeps.workspaceId` — structurally present on `AssistantToolRegistryDeps` via
 * `PluginsToolDeps.workspaceId` (`features/plugin-runtime/tool-registrations.ts`), so this file needs
 * no edit to that 24-type intersection — and threads it into every source's `list({ workspaceId })`
 * call. Reading `process.env.TOVU_WORKSPACE` instead would be correct in the spawned agent daemon
 * (`daemon-supervisor.ts` sets it on every spawn) and WRONG in the in-process BYOK path
 * (`createAssistantByokModule`, `server/modules/assistant-byok.ts`), which never sets that variable
 * at all and would silently fall back to the default workspace — listing capabilities that belong to
 * a workspace this call is not actually operating in. Because "one process serves exactly one
 * workspace" is a real, load-bearing, but UNENFORCED invariant of both boot paths (`agent-
 * daemon-server.ts:295-296`, `index.ts:273`), the memoized build below asserts it explicitly: a
 * second call scoped to a DIFFERENT `workspaceId` than the one the catalog was built for fails loudly
 * instead of silently serving stale-workspace results.
 *
 * **Failure isolation.** One source failing to `list()` (a filesystem error, a malformed digest deep
 * enough to escape that source's own per-digest handling) must not take down the whole capability
 * surface — that source simply contributes zero cards for this build, same principle
 * `capability-source.ts`'s own header describes for a single bad digest, one level up.
 */

const CAPABILITY_SEARCH_TOOL_ID = "capability_search";
const CAPABILITY_GET_TOOL_ID = "capability_get";

/** The narrow slice of `AssistantToolRegistryDeps` this domain reads — declared structurally, never
 *  importing the 24-type god intersection, matching every other domain's `*ToolDeps` shape
 *  (`PluginsToolDeps`, `PostToolDeps`, ...). */
export interface CapabilityToolDeps {
  readonly workspaceId: string;
}

export const capabilityDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> every registered CapabilitySource's own list()/get(): reads only, against an in-memory index
  //    built from those same reads. No write path exists anywhere in this file.
  [CAPABILITY_SEARCH_TOOL_ID, "none"],
  [CAPABILITY_GET_TOOL_ID, "none"],
]);

interface CapabilityAgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** Exported (not merely module-private) for the same reason every other domain's `agent-tools.ts`
 *  catalog is exported: `tool-registrations.contracts.test.ts`'s generic, cross-domain sweep resolves
 *  EVERY wired tool id against a `WIRED_CATALOGS` array assembled from each domain's own catalog —
 *  a domain that is unconditionally wired (this one is; unlike `render-ui`/`demo-choices`/
 *  `demo-a2ui`, nothing gates it behind an env var) must have its catalog resolvable there too. */
export const capabilityAgentToolCatalog: readonly CapabilityAgentToolDefinition[] = [
  {
    name: CAPABILITY_SEARCH_TOOL_ID,
    description:
      "Searches every discoverable capability this workspace has available beyond the ordinary tool catalog — today, " +
      "installed Agent Plugins' Skills. Returns ranked, discovery-only hits (name/description/keywords); call " +
      "capability_get with a hit's id to read its full content. Never returns an empty-query 'everything' page.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        kind: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: CAPABILITY_GET_TOOL_ID,
    description:
      "Reads one capability's full content by the id a capability_search hit returned. Fails with an exact error for " +
      "an unknown id.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
      },
    },
  },
];

const CATALOG_BY_ID = new Map(capabilityAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Module-scope memoization state for the lazy catalog build — see this file's header for why a
 * shared in-flight `Promise` rather than a boolean flag, and why a workspace mismatch must fail
 * loudly rather than silently reuse the wrong workspace's index.
 */
let cachedCatalogPromise: Promise<CapabilityCatalogQuery> | undefined;
let cachedWorkspaceId: string | undefined;

async function gatherCards(ctx: CapabilitySourceContext) {
  const lists = await Promise.all(
    listCapabilitySources().map(async (source) => {
      try {
        return await source.list(ctx);
      } catch {
        // One source's list() failing must not fail the whole capability surface — it simply
        // contributes zero cards for this build. See this file's own header.
        return [];
      }
    }),
  );
  return lists.flat();
}

/** Test-only reset — mirrors every other module-level registry's `reset*ForTests` in this codebase.
 *  No production caller needs this: both real composition roots build the catalog exactly once, on
 *  the first real tool call, for the one workspace that process serves. */
export function resetCapabilityCatalogForTests(): void {
  cachedCatalogPromise = undefined;
  cachedWorkspaceId = undefined;
}

function getOrBuildCapabilityCatalog(workspaceId: string): Promise<CapabilityCatalogQuery> {
  if (cachedCatalogPromise) {
    if (cachedWorkspaceId !== workspaceId) {
      throw new Error(
        `capability catalog was already built for workspace '${cachedWorkspaceId}', but this call is scoped to ` +
          `'${workspaceId}' — one process must serve exactly one workspace (see capability-tool-registrations.ts's header)`,
      );
    }
    return cachedCatalogPromise;
  }
  // Assigned synchronously, before the gather's first `await` resolves — a second call arriving in
  // the same tick sees this promise already set and awaits it too, instead of starting a second,
  // redundant gather. This is the "shared in-flight promise, not a boolean flag" property.
  cachedWorkspaceId = workspaceId;
  cachedCatalogPromise = gatherCards({ workspaceId }).then((cards) => buildCapabilityCatalogQuery(cards));
  return cachedCatalogPromise;
}

export function buildCapabilityToolRegistrations(routeDeps: CapabilityToolDeps): ToolRegistration[] {
  const { workspaceId } = routeDeps;

  const handlers: Record<string, ToolHandler> = {
    capability_search: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const query = requireString(input, "query");
      const kind = optionalString(input, "kind");
      const limit = optionalNumber(input, "limit");

      const catalog = await getOrBuildCapabilityCatalog(workspaceId);
      const hits = catalog.search(query, { ...(kind !== undefined ? { kind } : {}), ...(limit !== undefined ? { limit } : {}) });
      return { hits };
    },

    capability_get: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");

      const catalog = await getOrBuildCapabilityCatalog(workspaceId);
      // Throws with an exact, model-facing message for an unknown id — see
      // `capability-catalog-query.ts`'s own contract. `handle` is destructured off immediately and
      // never appears in this handler's return value; it exists only to let the matching source's
      // own `read()` resolve real content, entirely inside this process.
      const { handle, ...card } = catalog.get(id);

      const source = listCapabilitySources().find((candidate) => candidate.id === card.source);
      if (!source?.read) {
        return { ...card, content: null, note: "This capability has no readable content." };
      }

      let content: string;
      try {
        content = await source.read(handle, { workspaceId });
      } catch (error) {
        // A source's read() failure (a skill deleted/uninstalled between catalog build and this
        // call is the ordinary case; a permission change is another) must never reach the model
        // unmodified: Node's own filesystem errors (ENOENT, EACCES, ...) embed the absolute
        // `packageRoot`/`skillPath` in `error.message`, and `ToolExecutor` turns a thrown error into
        // `{status:'failed', error: err.message}` — `.message` is the entire channel a caught error
        // reaches the model through. Logged here for an operator to actually diagnose; the
        // model-facing failure below names only the capability id, never `cause`d with the
        // original error (a `cause` chain would carry the same leak one property over).
        console.error(`[capability_get] '${id}' failed to read via source '${card.source}':`, error);
        throw new Error(
          `capability_get: capability '${id}' could not be read; its installed files may have changed since it was indexed`,
        );
      }
      return { ...card, content };
    },
  };

  return buildDomainRegistrations({
    domain: "capability",
    catalogModule: "assistant/capability-tool-registrations.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: capabilityDerivedRisk,
  });
}

/**
 * Contributes the capability discovery tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, alongside (but
 * independent of) that same function's `registerAgentPluginSkillsCapabilitySource()` call: this
 * registers the TOOL pair into `tool-contribution-registry.ts`; that registers the one existing
 * CONTENT source into `capability-source-registry.ts`. Neither call depends on the other's order.
 */
export function contributeCapabilityTools(): void {
  registerToolContributor({ domain: "capability", build: buildCapabilityToolRegistrations, risk: capabilityDerivedRisk });
}
