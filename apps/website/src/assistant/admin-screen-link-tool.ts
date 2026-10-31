import { validatePageLink } from "@jini-ai/agentic";
import { ADMIN_SCREENS } from "../features/site-inspection/admin-screens.generated.js";
import { toolMetadata } from '../contracts/core/tool-metadata/assistant.js';
import { buildDomainRegistrations, optionalString, requireInputRecord, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
// `ToolInputError` specifically — see `features/post/tool-registrations.ts`'s identical import for
// why: the marker `@jini-ai/daemon`'s `ToolExecutor` reads to classify a rejection 400 rather than
// redacting it into a message-stripped 500.
import { ToolInputError } from "@jini-ai/core";

/**
 * @file The general navigation fallback: when the assistant has no in-chat tool that can perform an
 * action itself, this is how it points the human at the right admin screen instead of dead-ending
 * them with prose directions.
 *
 * ## The observed failure this closes
 *
 * Asked to save a GitHub token, the assistant (before `credential_save with kind api` existed) had no
 * tool that could save one, so it emitted a card reading "Create it once in Admin → Access Tokens →
 * 'Add custom provider' with Label: github, Base URL: https://api.github.com, Category:
 * source-control." — a breadcrumb the human had to re-walk by hand, with no guarantee "Access
 * Tokens" is still the sidebar label or that the path is still `/admin/access-tokens`. That specific
 * gap is closed now (`features/custom-credentials/agent-tools.ts`'s `credential_save with kind api`), but
 * the SAME failure shape recurs for every capability gap without an in-chat form. This tool is the
 * fallback for those: not "how to do the thing" (that is a domain tool's job, when one exists), but
 * "where the human can go do it themselves."
 *
 * ## Why this does not enumerate admin screens, and does not drive navigation itself
 *
 * Two designs were considered and rejected during the survey that shaped this file, both worth
 * recording so a future reader does not re-propose them without re-reading the reason first:
 *
 * 1. **A hand-typed enum of every admin screen.** `apps/admin/src/panels.tsx`'s `ADMIN_PANELS` is
 *    the single real source of the admin's route table. `apps/admin/src/lib/agent-pages.ts`
 *    derives the browser map via `@jini-ai/admin/core`'s `buildAgentScreens`; its checked-in
 *    projection, `features/site-inspection/admin-screens.generated.ts`, lets this server validate
 *    destinations without importing the React/TSX render thunks. The drift test guards both maps.
 *    A second hand-maintained enum in this tool would still go stale when a panel changes.
 *    This tool accepts a string and validates it against that generated map instead.
 *
 * 2. **Driving the human's browser instead of returning a link.** `@jini-ai/agentic`'s
 *    `page.navigate` genuinely exists and is already wired end to end for the SAME agent loop that
 *    answers in admin chat (`assistant/frontend-control-capabilities.ts`'s `FRONTEND_CONTROL_CAPABILITIES`,
 *    consumed by `agent-daemon-server.ts`'s `createFrontendControl`) — it moves the operator's real
 *    browser tab to a published page id, no click required. Two things rule it out as this tool's
 *    delivery mechanism: it is classified `risk: 'write'` by its own package (`page-capabilities.ts`),
 *    i.e. an action ON the human's screen, not a pointer AT one — the opposite of the "read-only,
 *    never performs the action" bar this fallback is held to; and it only works when the run carries a
 *    live `frontendBindToken` bound to an attached admin tab (`agent-daemon-server.ts`'s
 *    `resolveBindToken` doc: "a run with no originating surface... simply has no screen, and each
 *    `page.*` call it makes is refused by name"), so it cannot be this tool's ONLY path without a
 *    silent no-op whenever that binding is absent.
 *
 * ## Why the result is a relative path, not a fabricated absolute URL
 *
 * features/origin's OriginRegistryPort is keyed by workspaceId, but this tool's build signature
 * receives neither a workspace-scoped dependency bag nor a workspaceId — there is no `deps.originRegistry` to call here at all, unlike `buildRobots`. A
 * `ToolHandler` (`@jini-ai/core`'s `ToolExecutionContext`) carries no HTTP request either — no `req`,
 * no `Host` header, nothing `server/inbound/public-http/routes/oauth/public-origin.ts`'s
 * `resolvePublicOrigin(req)` could read. So this tool still falls back to a bare relative path by
 * default, following the same INV-07 rule `buildRobots` documents ("SEO never fabricates a local
 * origin") for a different structural reason. The one place it goes further than a bare relative path:
 * `TOVU_PUBLIC_URL`, the SAME operator-configured
 * env var `resolvePublicOrigin` itself prefers before ever touching `req` — reading it here is not a
 * fabrication, it is the deployment's own declared origin. {@link resolveConfiguredPublicOrigin} below
 * is a small, deliberately local re-implementation of only that one branch (no `req` fallback exists
 * to reuse), matching this codebase's own "duplicate the tiny type/helper, never share it across
 * features/files" convention (see e.g. `features/custom-credentials/agent-tools.ts`'s own header,
 * citing `features/deployments/publish-agent-tools.ts`'s identical `AgentToolDefinition` duplication)
 * rather than reaching into `public-origin.ts` and reshaping a shared, security-sensitive OAuth
 * callback helper for an unrelated caller.
 *
 * ## A known, disclosed limitation of the relative-path fallback
 *
 * `@jini-ai/chat`'s own `Markdown` component (`react/components/Markdown.tsx`) only autolinks BARE
 * `https?://` text (`INLINE_RE`'s `link` alternative) — it has no markdown `[text](url)` link syntax
 * and does not wrap a site-relative path in an anchor at all. So when `TOVU_PUBLIC_URL` is unset,
 * this tool's `path` renders in the transcript as plain, non-clickable (but exact, copy-pasteable)
 * text — strictly better than a prose breadcrumb the human has to re-walk, but not a literal one-click
 * link. `url` is included instead, and IS a real clickable link, whenever `TOVU_PUBLIC_URL` is set.
 *
 * Architectural role: `src/assistant` composition-layer tool, alongside `ask-choice-tool.ts` and
 * `component-catalog-tool.ts` — general assistant capability, not tied to a content domain. Depends on
 * only on generated screen metadata, never the browser render thunks.
 */

export const ADMIN_SCREEN_LINK_TOOL_ID = "assistant_admin_screen_link";

/** Local declaration, not shared — see this file's header for why (the "duplicate the tiny type"
 *  convention `features/custom-credentials/agent-tools.ts`'s own header cites). */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** Fixed at `/admin` — same constant `apps/admin/src/lib/router.ts`'s `DEFAULT_ADMIN_BASE` names as
 *  hard-coded across the stack (`vite.config.ts`'s `base`, the server's own route patterns) and
 *  deliberately not configurable there either; restated here rather than imported since this app has
 *  no dependency on `@jini-ai/admin` at all (see this file's header). */
const ADMIN_BASE_PATH = "/admin";

const INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: {
      type: "string",
      description:
        "A published admin screen id or canonical route segment from the admin map, such as agent-plugins or addons/agent-plugins. Unknown destinations are refused.",
    },
    tab: {
      type: "string",
      description:
        "Optional tab id, for a screen that uses the '?tab=<name>' deep-linking convention (e.g. Settings, AI Assistant, Deployment). Omit for a screen with no tabs.",
    },
  },
} as const;

export const adminScreenLinkAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: ADMIN_SCREEN_LINK_TOOL_ID,
    // Index the URL-building action, not navigation/inspection instructions for sibling tools.
    // FTS already weights "screen" in this id; page.find_elements owns reading the current UI.
    description:
      "Build a verified link to an admin page for the human to follow. Accepts a published destination and optional tab; returns 'path', a site-relative URL, plus 'url', an absolute address when a public origin is configured. Use only for an explicit link request or when no admin tab is attached. The human follows the link; the tool only formats and validates URLs against the generated route map. Unknown destinations and unsupported query keys are refused.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: INPUT_SCHEMA,
  },
];

export const adminScreenLinkDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [ADMIN_SCREEN_LINK_TOOL_ID, "none"],
]);

/** The slice of the process environment this tool reads; injected so tests never touch `process.env`. */
export type AdminScreenLinkEnv = Readonly<Record<string, string | undefined>>;

/** This tool's own slice of the assistant tool-deps bag (`AssistantToolRegistryDeps` in
 *  `tool-registrations.ts` — the composition contract every domain builder receives). */
export interface AdminScreenLinkToolDeps {
  /** Environment to read `TOVU_PUBLIC_URL` from; unset means the live `process.env`. */
  readonly adminScreenLinkEnv?: AdminScreenLinkEnv;
}

const CATALOG_BY_ID = new Map(adminScreenLinkAgentToolCatalog.map((entry) => [entry.name, entry]));

/** Format only destinations present in the generated map; invalid routes/query keys are input
 * errors rather than links an operator would discover are broken. @complexity O(s + q). */
export function buildAdminScreenPath(input: { path: string; tab?: string }, _options = {}): string {
  try {
    return `${ADMIN_BASE_PATH}${validatePageLink({ screens: ADMIN_SCREENS, path: input.path,
      ...(input.tab?.trim() ? { query: { tab: input.tab.trim() } } : {}),
    })}`;
  } catch (cause) {
    throw new ToolInputError({ message: `Invalid admin screen path: ${cause instanceof Error ? cause.message : 'unknown destination'}` });
  }
}

/**
 * Resolves `TOVU_PUBLIC_URL` into an absolute origin, or `undefined` when it is unset, blank, or not
 * a valid `http(s)` URL.
 *
 * Deliberately narrower than `server/inbound/public-http/routes/oauth/public-origin.ts`'s
 * `resolvePublicOrigin(req)`: that function's SECOND branch (`req.get("host")`) needs an HTTP
 * request this tool handler never has (see this file's header). This is only its first branch,
 * duplicated locally rather than imported — see the header for why importing/reshaping that file was
 * rejected. Unlike `resolvePublicOrigin`, an invalid value here degrades to `undefined` rather than
 * throwing: that function runs inside an HTTP request it can fail loudly on; this one runs inside a
 * chat turn, where the better failure mode is "the tool still returns a working relative path" over
 * "the whole tool call errors because an unrelated env var is malformed."
 *
 * Reads from the injected `env` (defaulted to `process.env` only at
 * {@link buildAdminScreenLinkRegistrations}'s edge) so every branch is reachable from a test
 * without mutating the real process environment.
 *
 * @complexity O(1).
 */
function resolveConfiguredPublicOrigin(env: AdminScreenLinkEnv): string | undefined {
  const configured = env.TOVU_PUBLIC_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Builds `assistant_admin_screen_link`'s `ToolRegistration` — see this file's header for the tool's
 * whole design.
 *
 * This tool needs no workspace-scoped store and no live surface channel (it never opens an
 * exchange), so it declares only `ToolContributor.build`'s first parameter (`tool-registrations.ts`)
 * and reads one field from it: `adminScreenLinkEnv`, the environment port `TOVU_PUBLIC_URL` is read
 * from at call time. The composition root leaves it unset, meaning the live `process.env`; a test
 * passes a plain record instead.
 *
 * @complexity O(1) to build; the handler's own cost is {@link buildAdminScreenPath}'s.
 * @overallScore 100
 */
export function buildAdminScreenLinkRegistrations(routeDeps: AdminScreenLinkToolDeps): ToolRegistration[] {
  const env = routeDeps.adminScreenLinkEnv ?? process.env;
  const handlers: Record<string, ToolHandler> = {
    [ADMIN_SCREEN_LINK_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const path = requireString({ input: input, key: "path" });
      const tab = optionalString({ input: input, key: "tab" });
      const relativePath = buildAdminScreenPath(tab === undefined ? { path } : { path, tab });
      const origin = resolveConfiguredPublicOrigin(env);
      return origin === undefined ? { path: relativePath } : { path: relativePath, url: `${origin}${relativePath}` };
    },
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "admin-screen-link",
    catalogModule: "assistant/admin-screen-link-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: adminScreenLinkDerivedRisk,
  });
}
