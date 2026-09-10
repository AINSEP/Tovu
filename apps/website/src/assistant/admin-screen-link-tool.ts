import {
  buildDomainRegistrations,
  optionalString,
  requireInputRecord,
  requireString,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
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
 * Asked to save a GitHub token, the assistant (before `custom_credential_create` existed) had no
 * tool that could save one, so it emitted a card reading "Create it once in Admin → Access Tokens →
 * 'Add custom provider' with Label: github, Base URL: https://api.github.com, Category:
 * source-control." — a breadcrumb the human had to re-walk by hand, with no guarantee "Access
 * Tokens" is still the sidebar label or that the path is still `/admin/access-tokens`. That specific
 * gap is closed now (`features/custom-credentials/agent-tools.ts`'s `custom_credential_create`), but
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
 *    the single real source of the admin's route table (per that file's own header, replacing three
 *    places that used to drift), and `apps/admin/src/lib/agent-pages.ts` already derives
 *    `ADMIN_AGENT_PAGE_PATHS` from it via `@jini-ai/admin/core`'s `buildAgentPageMap` — but that
 *    derivation runs in the admin SPA's own browser bundle. `apps/website` (this server) has no
 *    runtime or build dependency on `@jini-ai/admin` or on `apps/admin/src` at all — `ADMIN_PANELS`
 *    is a React/TSX array of render thunks that is never shipped to the server, and this dispatch's
 *    scope explicitly excludes editing `apps/admin/src/**` to add one (e.g. a generated manifest
 *    `admin-static.ts` could read alongside the built SPA). A hand-copied mirror of that list INSIDE
 *    this tool's `inputSchema` (a fixed enum) is exactly the "hand-maintained registry mirror" this
 *    codebase has already been burned by once — it would silently go stale the next time a panel is
 *    added, renamed, or removed. So this tool takes `path` as an open string instead, the same choice
 *    `@jini-ai/agentic`'s own `page.navigate` capability already makes for the identical problem (its
 *    `inputSchema` has no enum either — "a published data-agent-page id, as listed by
 *    page.find_elements"). The model already has to know the screen exists — from a sidebar label
 *    seen earlier in the conversation, a URL it was told, or another tool's own description (e.g.
 *    `custom_credential_create`'s description names "Access Tokens") — and this tool only turns that
 *    knowledge into a well-formed path, not into stale-or-not authority to trust it.
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
 * `features/origin`'s `OriginRegistryPort` now exists (it landed 2026-09-03, and
 * `features/seo/sitemap.ts`'s `buildRobots` was wired onto it 2026-09-04 — the sitemap URL it
 * advertises is absolute whenever the workspace has a verified origin), but that registry is keyed by
 * `workspaceId` and this tool's `build` signature is handed neither a workspace-scoped dependency bag
 * nor a `workspaceId` (see this file's own doc on `_routeDeps`/`_surfaces` being unused placeholders,
 * further down) — there is no `deps.originRegistry` to call here at all, unlike `buildRobots`. A
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
 * no domain feature.
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
        "The admin screen's route segment, exactly as it appears in the sidebar label, the URL bar, or another tool's own description when a human navigates there directly — e.g. 'access-tokens', 'posts', 'media', 'settings'. A leading slash is optional and stripped if present. This tool does NOT verify the segment names a real screen — there is no server-side registry of admin routes to check it against, only the admin app's own client bundle, which this tool cannot reach — so pass a segment you have actually seen named in this conversation, never a guess.",
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
    description:
      "FALLBACK ONLY — call this LAST, after checking whether an in-chat tool already covers what the human actually needs (e.g. custom_credential_create to save a provider credential, custom_credential_set_token to rotate one). Reach for this only when no tool exists to perform the action itself and the human must finish it manually in the admin UI. Turns an admin screen's route segment into the path that opens it, so you can hand the human something to open directly instead of a prose breadcrumb like 'go to Admin → Access Tokens → ...'. READ-ONLY: it only builds a path — it never performs the action still waiting on that screen, so pair it with a plain-language description of what to do once the human gets there. It does not verify the segment names a real screen (see the 'path' field's own description). Returns 'path', a site-relative URL (e.g. '/admin/access-tokens') that is ALWAYS present, and — only when this deployment has a configured public origin — an absolute 'url' you should present as the clickable link instead. When 'url' is absent, present 'path' as plain text for the human to open themselves; this chat surface does not render a bare relative path as a clickable link.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: INPUT_SCHEMA,
  },
];

export const adminScreenLinkDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [ADMIN_SCREEN_LINK_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(adminScreenLinkAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Joins an admin screen's route segment (plus an optional tab id) into this app's own relative admin
 * route path — `/admin/<segment>` or `/admin/<segment>?tab=<tab>`.
 *
 * A leading slash on `input.path` is stripped rather than rejected: a model is just as likely to pass
 * 'access-tokens' as '/access-tokens', both naming the same screen, and rejecting the latter would
 * only push that normalization into every caller instead of doing it once here.
 *
 * @throws {ToolInputError} `input.path`, once its leading slashes are stripped, is empty — e.g. a bare
 *   `/` or `///`. `requireString` (`registerAdminScreenLink`'s own caller) already rejects an
 *   empty-or-absent `path` before this runs; this catches the narrower case that only becomes empty
 *   AFTER stripping.
 * @complexity O(n) in the length of `input.path`/`input.tab` — one trim, one strip, one encode.
 * @overallScore 100
 */
export function buildAdminScreenPath(input: { path: string; tab?: string }): string {
  const segment = input.path.trim().replace(/^\/+/, "");
  if (segment.length === 0) {
    throw new ToolInputError("'path' must name a screen segment, not just a leading slash");
  }
  const tab = input.tab?.trim();
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return `${ADMIN_BASE_PATH}/${segment}${query}`;
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
 * @complexity O(1).
 */
function resolveConfiguredPublicOrigin(): string | undefined {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
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
 * `_routeDeps`/`_surfaces` are unused, matching `component-catalog-tool.ts`'s identical placeholder:
 * this tool needs neither a workspace-scoped dependency bag (it touches no store) nor a live surface
 * channel (it never opens an exchange) — both parameters exist only to satisfy `ToolContributor.build`'s
 * shared signature (`tool-registrations.ts`).
 *
 * @complexity O(1) to build; the handler's own cost is {@link buildAdminScreenPath}'s.
 * @overallScore 100
 */
export function buildAdminScreenLinkRegistrations(_routeDeps: unknown, _surfaces: unknown): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [ADMIN_SCREEN_LINK_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const path = requireString(input, "path");
      const tab = optionalString(input, "tab");
      const relativePath = buildAdminScreenPath(tab === undefined ? { path } : { path, tab });
      const origin = resolveConfiguredPublicOrigin();
      return origin === undefined ? { path: relativePath } : { path: relativePath, url: `${origin}${relativePath}` };
    },
  };

  return buildDomainRegistrations({
    domain: "admin-screen-link",
    catalogModule: "assistant/admin-screen-link-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: adminScreenLinkDerivedRisk,
  });
}
