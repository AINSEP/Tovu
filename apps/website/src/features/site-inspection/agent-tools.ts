import { SITE_PROFILE_SECTION_NAMES } from "./site-profile.js";
import { MAX_MAX_BODY_BYTES, MAX_PATH_LENGTH } from "./published-page.js";
import { DEFAULT_PAGE_ITEMS, MAX_PAGE_ITEMS } from "./site-profile.js";

/**
 * @file The Site Inspection domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same shape `features/theme/agent-tools.ts`,
 * `redirects/agent-tools.ts` and every other domain catalog already use).
 *
 * Two tools, deliberately two and not one, because they answer questions on two different evidence
 * planes (2026-08-26 swarm-consensus, agreed 5/5):
 *
 * - `site_get_profile` — **config truth**. What is configured: pages, active theme, plugins,
 *   inventory-safe settings, content types. Cheap, structured, and secret-free by construction.
 * - `fetch_published_page` — **render truth**. What a visitor actually receives on one route.
 *
 * The split matters because a configuration snapshot can truthfully report "cookie-consent widget:
 * installed, enabled" while the published page renders nothing of the sort. Merging the two into
 * one tool would let a caller mistake the cheap answer for the expensive one.
 *
 * ---------------------------------------------------------------------------
 * What `authorization.permission` means here, and what it does NOT mean
 * ---------------------------------------------------------------------------
 * The `authorization` field on a catalog entry drives ADR-014's server-side tool FILTER — which
 * tool names an agent session may see at all. It is not the gate.
 *
 * For `fetch_published_page` the two coincide: the handler enforces the same `content.read`.
 *
 * For `site_get_profile` they deliberately do NOT. That tool has FIVE authorization decisions, one
 * per section, each against the permission its own domain already uses
 * (`site-profile.ts`'s `SITE_PROFILE_SECTION_PERMISSIONS`), and a denial marks that section
 * `forbidden` rather than failing the call. Declaring a single strict permission here would either
 * hide the tool from a caller who can legitimately read four of the five sections, or — much worse
 * — invite a future maintainer to treat it as THE check and drop the per-section gates, which is
 * exactly the privilege-escalation bypass the design exists to prevent. `content.read` is declared
 * as the visibility floor (a caller who cannot read content has nothing to learn from this tool),
 * and the real authorization stays where it is enforceable.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** Visibility floor for both tools — see this file's header for why this is not the gate for
 *  `site_get_profile`. Reused rather than invented: `content.read` is what `pages_read_html` and
 *  `content_post_list` already require. */
export const SITE_INSPECTION_READ_PERMISSION = "content.read";

const SITE_PROFILE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: [...SITE_PROFILE_SECTION_NAMES] },
      description:
        "Which sections to collect. Omit to collect all of them. Ask for only what you need — the cost of this call is the context tokens the answer occupies, not database time.",
    },
    pageLimit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_PAGE_ITEMS,
      description: `How many page/post rows to list in the 'pages' section. Default ${DEFAULT_PAGE_ITEMS}, hard maximum ${MAX_PAGE_ITEMS}. Totals and per-kind/per-status counts always reflect EVERY row regardless of this cap.`,
    },
  },
} as const;

const FETCH_PUBLISHED_PAGE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PATH_LENGTH,
      description:
        "A root-relative path on THIS site, e.g. '/', '/about', '/blog/hello?page=2', '/robots.txt'. Must start with '/'. A full URL, a remote host, a protocol-relative '//host' path, a '..' segment, or anything under '/api/' is refused — this tool only ever fetches this site's own published routes.",
    },
    maxBytes: {
      type: "integer",
      minimum: 1,
      maximum: MAX_MAX_BODY_BYTES,
      description: `Body bytes to return before truncating. Hard maximum ${MAX_MAX_BODY_BYTES}. The response reports 'truncated' when the cap stopped the read.`,
    },
  },
} as const;

/**
 * Every agent-callable tool this domain exposes. Both entries are wired — there is no
 * `unwiredToolIds` set in `tool-registrations.ts`, which means any future catalog entry added
 * without a handler is a build failure.
 */
export const siteInspectionAgentToolCatalog: readonly AgentToolDefinition[] = [
  {
    name: "site_get_profile",
    description: [
      "Returns one structured snapshot of how this site is currently CONFIGURED: its pages/posts, its active and installed themes, its installed plugins and whether each is enabled, a fixed set of inventory-safe settings, and its content types.",
      "Call this first when you need site-wide context — it replaces having to call pages, theme, plugin, settings and content-type tools separately and reconcile five different response shapes.",
      "Do NOT call this to learn what a visitor actually sees: it reports configuration, not rendered output. Use fetch_published_page for that. Do NOT call it to read one page's body — use pages_read_html.",
      "Returns: { schemaVersion, capturedAt, completeness: 'complete'|'partial', sections: { <name>: { status: 'ok'|'forbidden'|'unavailable', data?, truncated?, reason? } } }.",
      "Each section is authorized separately against its own permission, so a section you may not read comes back with status 'forbidden' while the rest still return data — read 'forbidden' and 'unavailable' as 'not assessed', never as 'nothing there'.",
      "Never contains credentials, API keys, tokens or sealed values of any kind; those stores are not reachable from this call.",
      "This call never fails because of one bad section. It has no side effects and can be safely repeated.",
    ].join(" "),
    sideEffects: "none",
    authorization: { permission: SITE_INSPECTION_READ_PERMISSION },
    inputSchema: SITE_PROFILE_INPUT_SCHEMA,
  },
  {
    name: "fetch_published_page",
    description: [
      "Fetches one route of THIS site's own published surface and reports exactly what a visitor receives: HTTP status, response headers, the shape of any cookies set (name and attributes, never values), and the response body up to a byte cap.",
      "Call this when you need render truth rather than configuration — is the privacy policy actually reachable, does a page 404, does the site send a Content-Security-Policy header, does a cookie get set before consent.",
      "Do NOT call this to fetch anything off this site: it accepts a path, not a URL, and refuses a remote host, a protocol-relative path, a '..' segment, or anything under '/api/'. Do NOT call it to read a page's editable source — use pages_read_html for that.",
      "Returns: { path, status, ok, headers, cookies: [{ name, attributes }], bodyBytes, truncated, body }. A 404 or a redirect is a RESULT, not an error — the call succeeds and reports what it found.",
      "Throws PublishedPagePathError when the path is refused (fix the path and retry) and PublishedPageTimeoutError when the render exceeds its time budget (a real fault; do not retry the same path repeatedly).",
    ].join(" "),
    // The handler issues one ordinary GET against this site's own public surface — the same thing
    // the static exporter (`export/site-exporter.ts`) does for every route, and the same thing any
    // visitor does. It writes nothing itself. One disclosed caveat rather than a silent one: a path
    // that matches a live redirect rule records a redirect HIT through the ordinary redirect
    // middleware, exactly as a real visit to that path would. That is an analytics counter moving,
    // not state this tool authored, so it is classified with the other read tools.
    sideEffects: "none",
    authorization: { permission: SITE_INSPECTION_READ_PERMISSION },
    inputSchema: FETCH_PUBLISHED_PAGE_INPUT_SCHEMA,
  },
];
