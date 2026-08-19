import { PAGE_SKELETON_REGIONS } from "./skeleton.js";

/**
 * @file The Pages domain's agent-tool catalog — how the assistant authors a bespoke HTML Page.
 *
 * **Why this is not part of the `post` domain's catalog.** `content_post_*` reads and writes
 * `bodyJson`, a Tiptap document. A Page's real content is `body_html`, which `content_post_update`
 * cannot write and now explicitly ignores. Handing the model one tool family whose behavior silently
 * changes depending on the row's format is exactly how it would spend turns writing Tiptap documents
 * into pages that discard them. Two content types, two tool families.
 *
 * `content_post_create` (kind: "page") is still how a Page is CREATED — that part is genuinely
 * shared, since a Page's title/slug/status are ordinary entry metadata. Everything about its body
 * lives here.
 */

export type AgentToolSideEffect =
  | "none"
  | "mutates-durable-state"
  | "deletes-durable-state"
  | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const PAGE_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "The page's id, as returned by content_post_create (kind:'page') or content_post_list (kind:'page').",
} as const;

/**
 * The house style every generated page is held to, stated once and shared by both write tools.
 *
 * Everything in here is a constraint the surrounding system actually imposes — not taste. The
 * inner-content-only rule is why a generated page cannot invent its own navigation; the token rule
 * is what makes a page track the site's theme instead of hardcoding one theme's palette; the
 * no-`<form>` rule exists because a form posting nowhere silently loses real leads.
 */
const PAGE_HTML_CONTRACT =
  "CONTRACT for the HTML you write:\n" +
  "- INNER CONTENT ONLY. Never emit <html>, <head>, <body>, <nav>, or a site footer — the active " +
  "theme's template owns all page chrome and wraps whatever you write. Emitting them produces a " +
  "broken, doubled page.\n" +
  "- STYLE WITH THEME TOKENS, with literal fallbacks: `var(--accent, #8a4b2a)`, never a bare hex and " +
  "never a bare `var(--accent)`. The site's theme supplies the real values; the fallback is what " +
  "keeps the page readable if a token is missing. A <style> block inside the content is fine and is " +
  "the expected way to style a bespoke page.\n" +
  "- TAG EDITABLE REGIONS with `data-agent-element=\"<handle>\" data-agent-role=\"region\"` on each " +
  "top-level section. These handles are how you edit parts of the page later without rewriting all " +
  `of it. A starter page ships with ${PAGE_SKELETON_REGIONS.join(", ")}; keep those handles when they ` +
  "still fit the content, and add new ones for new sections.\n" +
  "- NO <form action=\"...\">. A form you invent posts nowhere and silently drops whatever a visitor " +
  "types into it. If the page needs to collect anything, say so in your reply instead of writing one.\n" +
  "- NO external resources: no <script src>, no remote stylesheets, no remote fonts, no hotlinked " +
  "images. Use the site's own uploaded media or inline SVG.";

export const pagesAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "pages_read_html",
    description:
      "Reads the full bespoke HTML body of a page, plus the list of editable region handles currently " +
      "present in it. Call this before rewriting a page you did not just write, so the rewrite is " +
      "based on what is actually there rather than a guess. A page that has never been given HTML " +
      "reads back as an empty string with no regions — that is a new page, not an error.",
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: PAGE_ID_SCHEMA },
    },
  },
  {
    name: "pages_write_html",
    description:
      "Replaces a page's ENTIRE HTML body with the markup you supply, and converts the page to " +
      "HTML format if it is not one already. This is the tool for 'build me a landing page' and for " +
      "any rewrite substantial enough that patching would be worse than starting over.\n\n" +
      "It overwrites everything — there is no merge. If the operator asked for a change to one part " +
      "of an existing page, read it first with pages_read_html and include the parts you are keeping.\n\n" +
      PAGE_HTML_CONTRACT,
    sideEffects: "mutates-durable-state",
    authorization: { permission: "content.write" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "html"],
      properties: {
        id: PAGE_ID_SCHEMA,
        html: {
          type: "string",
          description:
            "The complete inner HTML for this page, following the contract in this tool's description.",
        },
      },
    },
  },
];
