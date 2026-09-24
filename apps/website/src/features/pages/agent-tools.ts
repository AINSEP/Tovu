import { PAGES_EDIT_HTML_PERMISSION } from "./permissions.js";
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
  description: "The page's id, as returned by content_post_create (kind:'page') or content_read.content_post (kind:'page').",
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
  "images. Use the site's own uploaded media or inline SVG.\n" +
  "- NAME MISSING BINARY ASSETS, DON'T FAKE THEM. If content you're deriving this page from (e.g. an " +
  "existing HTML file read via fs_read_file) references an image, font, video, or audio file no tool " +
  "here can upload, do not invent a placeholder and do not silently drop it — say exactly which files " +
  "still need to be added as media or copied by hand, by name.\n" +
  "- EMBEDS: any tag can carry `data-embed-config='{...}'` — single-quoted, so a literal apostrophe " +
  "inside a JSON string value must be written as the JSON escape `\\u0027`, never a literal `'` (which " +
  "ends the attribute early) and never the HTML entity `&#39;` (JSON.parse leaves that as six literal " +
  "characters, not an apostrophe). " +
  "`{\"type\":\"collection\",\"id\":\"<content-type-key>\"}` lists that collection's published entries: " +
  "optional `where` (field/value pairs, equality only), `sort` (`newest|oldest|updated|title|<field>|" +
  "-<field>`, default `newest`), `limit` (default 6, max 24), `layout` (`cards`|`list`, default " +
  "`cards`), `columns` (default 3, max 6), `fields` (which of the type's own fields to show). Put a " +
  "`<template>…</template>` inside the tag to control each item's markup with `{{title}}`, `{{url}}`, " +
  "`{{date}}`, `{{fields.<name>}}` placeholders — omit it for the default card/list rendering. The " +
  "wrapper tag's own `class`/`style`/`id` survive and are how you style it. Other known types: " +
  "`{\"type\":\"widget\",\"id\":\"<slug>\"}`, `{\"type\":\"media\",\"id\":\"<slug>\"}`, " +
  "`{\"type\":\"menu\",\"id\":\"<slug>\"}` (add `\"variant\":\"tree\"` for a nested tree instead of flat " +
  "links), and `{\"type\":\"post-previews\",\"limit\":6}` for recent post cards.";

/**
 * The optimistic-concurrency basis, stated once for both writers.
 *
 * Deliberately the SAME vocabulary `content_post_update` already publishes (`VERSION_CONFLICT`,
 * "nothing is written", "re-read and reapply") rather than a second, page-flavored one. A model that
 * has learned what a version conflict means on one content tool must not have to learn it again on
 * the other; two spellings of one protocol is how one arm gets handled and its sibling does not.
 */
const EXPECTED_VERSION_SCHEMA = {
  type: "integer",
  minimum: 0,
  description:
    "OPTIONAL optimistic-concurrency basis — the 'version' pages_read_html returned for this page. " +
    "Omit it and this write simply overwrites whatever is currently stored, INCLUDING an edit a human " +
    "or another agent turn made that you never saw. Send it and the write is rejected with " +
    "VERSION_CONFLICT (nothing written) if anyone saved in the meantime. Send it whenever you have " +
    "one — which is every time you read the page before editing it.",
} as const;

/** Appended to both writers' descriptions so the conflict protocol is stated where it is used. */
const VERSION_CONFLICT_GUIDANCE =
  "\n\nCONCURRENCY: pass expectedVersion (from pages_read_html) whenever you read the page before " +
  "editing it. On VERSION_CONFLICT nothing was written — re-read with pages_read_html, reapply your " +
  "change to what you get back, and resend with the new version.";

export const pagesAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "pages_read_html",
    description:
      "Reads the full bespoke HTML body of a page, plus the list of editable region handles currently " +
      "present in it and the page's current version. Call this before editing a page you did not just " +
      "write, so the edit is based on what is actually there rather than a guess.\n\n" +
      "The 'regions' it returns are the addresses pages_write_region takes: if the section you need to " +
      "change is listed there, edit THAT region rather than rewriting the whole page with " +
      "pages_write_html. Pass the returned 'version' back as expectedVersion on whichever write you " +
      "make.\n\n" +
      "A page that has never been given HTML reads back as an empty string with no regions and no " +
      "version — that is a new page, not an error; author it with pages_write_html.",
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
      "It overwrites everything — there is no merge. To change ONE section of an existing page, do " +
      "not use this tool: call pages_read_html, find the section's handle in the 'regions' it " +
      "returns, and call pages_write_region. A real page is tens of kilobytes; re-emitting all of it " +
      "to change a headline puts every other section at risk on every turn.\n\n" +
      "REFUSED, not warned: a top-level element with no data-agent-element handle is rejected and " +
      "NOTHING is written. Untagged markup produces a page no later turn can edit a piece of, so it " +
      "is treated as malformed input rather than accepted with a note. Only <style> (and other " +
      "metadata elements) may sit at the top level untagged.\n\n" +
      PAGE_HTML_CONTRACT +
      VERSION_CONFLICT_GUIDANCE,
    sideEffects: "mutates-durable-state",
    // Declaration only — `buildDomainRegistrations` sets every registration's `policy.authorize` to a
    // pass-through so each permission is evaluated exactly once, by the handler's own
    // `requireToolPermission` call. Kept in lockstep with that call anyway: this is the entry an
    // audit of "what does this tool require" reads, and a stale value here would be a false answer.
    authorization: { permission: PAGES_EDIT_HTML_PERMISSION },
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
        expectedVersion: EXPECTED_VERSION_SCHEMA,
      },
    },
  },
  {
    name: "pages_write_region",
    description:
      "Replaces the CONTENTS of one editable region of a page, leaving every other byte of the page " +
      "exactly as it was. This is how you change one section — a headline, a pricing block, a call to " +
      "action — without rewriting the whole document.\n\n" +
      "Address the region by the handle from pages_read_html's 'regions' list (the value of that " +
      "section's data-agent-element attribute). A handle that is not in the page, or that two " +
      "elements both carry, is REJECTED rather than guessed at — nothing is written and the error " +
      "tells you which handles the page actually has.\n\n" +
      "INNER CONTENT ONLY. The html you send replaces what is INSIDE the region element; the element " +
      "itself — its tag, its data-agent-element handle, its class — is kept for you and must NOT be " +
      "re-emitted. Sending `<section data-agent-element=\"page-hero\">…</section>` would nest a second " +
      "section inside the first, not replace it. Send only what goes inside: `<h1>New headline</h1>`.\n\n" +
      "Editing a region that CONTAINS other regions replaces those too — the result reports the " +
      "handles that still exist afterwards, so check them before targeting one again.\n\n" +
      "To restructure the page, add a section, or remove one, use pages_write_html instead: this tool " +
      "cannot change a region's own tag or attributes, and cannot create or delete a region.\n\n" +
      PAGE_HTML_CONTRACT +
      VERSION_CONFLICT_GUIDANCE,
    sideEffects: "mutates-durable-state",
    // Same declaration-only note as `pages_write_html` above: writing part of a page stores exactly
    // the same unsanitized markup into exactly the same public surface as writing all of it, so it
    // is gated on the identical permission. A narrower gate here would be a gap, not a refinement.
    authorization: { permission: PAGES_EDIT_HTML_PERMISSION },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "handle", "html"],
      properties: {
        id: PAGE_ID_SCHEMA,
        handle: {
          type: "string",
          minLength: 1,
          description:
            "The region's data-agent-element handle, exactly as pages_read_html reported it in 'regions'. " +
            "Do not invent one — a handle you did not read back is an address that does not exist.",
        },
        html: {
          type: "string",
          description:
            "The new INNER content for that region — what goes between its open and close tags. Do not " +
            "include the region element itself. Follows the same contract as this tool's description.",
        },
        expectedVersion: EXPECTED_VERSION_SCHEMA,
      },
    },
  },
];
