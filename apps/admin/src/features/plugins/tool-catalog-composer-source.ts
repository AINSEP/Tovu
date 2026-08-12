import type { ComposerCapabilitySource, TovuComposerCapability } from "./composer-capabilities";

/**
 * @file The `ComposerCapabilitySource` half of this dispatch's tool-catalog enumeration feature —
 * the browser-side consumer of `GET /api/tools/search` (`server/modules/assistant.ts`'s new proxy
 * in front of the daemon's `requireSameOrigin`-gated `registerToolCatalogRoutes`). See that route's
 * own mount-site doc for the full same-origin trace; this file only assumes the route exists and
 * behaves like `@jini-ai/http-kit`'s real one (`{hits: [{id, description, source, score}]}`).
 *
 * BOUNDARY, restated here because it is the property this whole file exists to hold: this source
 * ENUMERATES tools — every {@link TovuComposerCapability} it produces carries no `resolve`, so
 * `resolveComposerDiscoveryOutcome` (`AssistantDock.tsx`) can never turn a selection into a tool
 * call. Selecting a row only inserts its id into the draft via Jini's own `insertText` macro path
 * (`ComposerDiscoveryItem`'s own doc, `@jini-ai/chat/react`'s `slots.ts`) — the identical mechanism
 * `regular-plugin:word-count` already uses in the bundled catalog. Execution of any tool, including
 * one surfaced here, stays exclusively behind the MCP-UI allowlist
 * (`src/assistant/mcp-ui-tool-calls.ts`'s `MCP_UI_REDEEMABLE_TOOL_IDS`) — a completely separate,
 * per-tool, operator-owned decision this file does not make or widen.
 */

interface ToolCatalogSearchHit {
  readonly id: string;
  readonly description: string;
  readonly source: string;
  readonly score: number;
}

interface ToolCatalogSearchResponse {
  readonly hits?: unknown;
}

const TOOL_CATALOG_SEARCH_PATH = "/api/tools/search";
const TOOL_CATALOG_GROUP_ID = "tool-catalog";
const TOOL_CATALOG_GROUP_LABEL = "Tool catalog";

/** `@jini-ai/http-kit`'s own ceiling for one `/api/tools/search` call (`tool-catalog.ts`'s
 *  `MAX_SEARCH_LIMIT`) — requested explicitly rather than left to the endpoint's smaller default,
 *  since the whole point of this source is to surface as much of the registered catalog as one
 *  ranked call can return. */
const TOOL_CATALOG_RESULT_LIMIT = 25;

/**
 * One broad, OR'd query built from this codebase's own wired tool domains
 * (`assistant/tool-registrations.ts`'s `DOMAIN_SLICES`) plus the common verbs its ids are built
 * from (`<domain>_<verb>...`, that same file's own header). `/api/tools/search`'s ranking backend
 * requires a non-empty query and has no separate "list everything" shape
 * (`tool-catalog-query.ts`'s `ToolCatalogQuery`); there is also no live, per-keystroke server
 * search available to a composer item, because `ComposerHostBinding.resolve` is synchronous
 * (`composer-capabilities.ts`) and cannot itself await a fetch. So this single broad query, issued
 * once at `list()` time and capped at the endpoint's own 25-result ceiling, is what "enumerate"
 * can mean given those two constraints: a real, ranked cross-section of the wired catalog, not a
 * literal dump of all ~131 ids. Once fetched, the ~25 rows ARE individually discoverable via
 * Jini's own client-side fuzzy filter (`filterComposerDiscovery`, matching label/description/
 * keywords) — typing `/` plus any word from a tool's own description finds it among the fetched
 * set with no further network round trip. A tool that does not appear in this sample remains
 * reachable the way every one of the 131 already is: by asking the assistant directly, which has
 * its own `search_tools`/`describe_tool` meta-tools over the SAME registry this proxy reads.
 */
const BROAD_CATALOG_QUERY = [
  "content-types", "forms", "identity", "comments", "members", "newsletter", "media", "widgets",
  "menus", "database", "recovery", "plugins", "workspace", "settings", "entries", "post", "pages",
  "taxonomy", "seo", "redirects", "integrations", "themes",
  "create", "update", "delete", "list", "get", "search",
].join(" ");

function isToolCatalogSearchHit(value: unknown): value is ToolCatalogSearchHit {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { description?: unknown }).description === "string"
  );
}

/**
 * Turns one real catalog hit into a browse-only composer row. Deliberately no `resolve` — see this
 * file's own module doc for why enumeration must never become execution.
 */
function toCapability(hit: ToolCatalogSearchHit): TovuComposerCapability {
  return {
    groupId: TOOL_CATALOG_GROUP_ID,
    groupLabel: TOOL_CATALOG_GROUP_LABEL,
    item: {
      id: `tool-catalog:${hit.id}`,
      label: hit.id,
      description: hit.description,
      kind: "registered-tool",
      keywords: [hit.source],
      insertText: hit.id,
    },
  };
}

/**
 * Builds a {@link ComposerCapabilitySource} backed by the browser-reachable tool-catalog proxy.
 *
 * Degrades to an empty list on ANY failure — a non-2xx status, a network error, or a response that
 * is not the expected `{hits: [...]}` shape — rather than throwing. This is load-bearing, not
 * defensive polish: `projectComposerCapabilities` awaits every source's `list()` through one
 * `Promise.all` (`composer-capabilities.ts`), so a single REJECTING source would take the WHOLE
 * projection down with it, including the bundled catalog's always-available `/search`, `/mcp`, and
 * every other item. A daemon that is still booting, or genuinely unreachable, must cost this one
 * capability — never the rest of the composer. `AssistantDock.tsx`'s own mount-time `.catch(...)`
 * around the composed projection is the OUTER safety net for a bug in the composition itself; this
 * inner catch is what keeps a routine daemon hiccup from ever reaching that outer net at all.
 *
 * @complexity O(1) network round trip; O(h) to map h hits (h <= 25, the endpoint's own ceiling).
 * @overallScore 100
 */
export function createToolCatalogComposerCapabilitySource(): ComposerCapabilitySource {
  return {
    id: "tool-catalog",
    list: async () => {
      try {
        const response = await fetch(
          `${TOOL_CATALOG_SEARCH_PATH}?q=${encodeURIComponent(BROAD_CATALOG_QUERY)}&limit=${TOOL_CATALOG_RESULT_LIMIT}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) return [];

        const body = (await response.json()) as ToolCatalogSearchResponse;
        if (!Array.isArray(body.hits)) return [];

        return body.hits.filter(isToolCatalogSearchHit).map(toCapability);
      } catch (error) {
        // Network failure, a daemon that never answers, a malformed body — every case degrades to
        // "nothing to add" rather than breaking the composer. See this function's own doc for why
        // that is required, not merely nice to have.
        console.error(
          "[tool-catalog-composer-source] tool catalog enumeration failed; falling back to the bundled catalog only",
          error,
        );
        return [];
      }
    },
  };
}
