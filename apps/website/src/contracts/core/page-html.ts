import { COLLECTION_MARKER_TYPE, EMBED_MARKER_TARGET_KEYS } from "@jini-ai/cms/widgets/markers";

/** Tovu Page HTML authoring contract shared by tool catalogs, search and the starter skeleton. */
/** The `data-agent-element` handle for each region a starter Page ships with. */
export const PAGE_SKELETON_REGIONS = ["page-hero", "page-body", "page-cta"] as const;

export type PageSkeletonRegion = (typeof PAGE_SKELETON_REGIONS)[number];

/**
 * What each embed marker type renders and where its target comes from, for the contract below.
 * `collection` is absent on purpose: the contract documents it in full on its own.
 */
const EMBED_TYPE_NOTES: Readonly<Record<string, string>> = {
  widget: "a saved widget",
  form: "a live form from the site's forms system, listed by forms_list_definitions — the right way to collect input",
  taxonomy: "a taxonomy's term list; `id` is the taxonomy id or its unique name",
  media: "an uploaded image or video",
  gallery: "ordered images rendered as accessible figures; configure images and layout as documented below",
  post: "a published post's full content",
  content: "a published entry's body",
  menu: "a menu's links; add `\"variant\":\"tree\"` for a nested tree instead of flat links, or `\"variant\":\"dropdown\"` for that tree with accessible dropdown toggles",
  partial: "a theme partial by name — theme structure, rarely needed inside page content",
  "post-previews": "recent post cards; optional `limit`, default 6",
};

/** The placeholder shown for a type's target value, where the generic `<id>` would be unhelpful. */
const EMBED_TARGET_PLACEHOLDERS: Readonly<Record<string, string>> = {
  widget: "<widget id or slug>",
  form: "<form id or slug>",
  taxonomy: "<taxonomy id or name>",
  media: "<media id or slug>",
  post: "<post id or slug>",
  content: "<entry id or slug>",
  menu: "<menu id>",
  partial: "<partial name>",
};

/**
 * Every marker type except `collection`, read off `EMBED_MARKER_TARGET_KEYS` — the vocabulary every
 * resolver reads — so a type registered there reaches the model without editing this file. Before
 * this was derived, the hand-written list omitted `form` (restored 2026-10-04), `taxonomy`, `post`,
 * `content` and `partial` — so the model had no way to learn a page could embed a real form.
 * `targetKeys` is injected (the catalog passes `EMBED_MARKER_TARGET_KEYS`) so a newly registered
 * type with no placeholder or note can be checked to still reach the model in a generic form.
 */
export function otherEmbedTypesText(required: { targetKeys: Readonly<Record<string, readonly string[]>> }): string {
  return Object.entries(required.targetKeys)
    .filter(([type]) => type !== COLLECTION_MARKER_TYPE)
    .map(([type, keys]) => {
      const placeholder = EMBED_TARGET_PLACEHOLDERS[type] ?? `<${keys[0]}>`;
      const target = keys[0] ? `,"${keys[0]}":"${placeholder}"` : "";
      const note = EMBED_TYPE_NOTES[type];
      const suffix = note ? ` (${note})` : "";
      return `\`{"type":"${type}"${target}}\`${suffix}`;
    })
    .join(", ");
}

/**
 * The house style every generated page is held to, stated once and shared by both write tools.
 *
 * Everything in here is a constraint the surrounding system actually imposes — not taste. The
 * inner-content-only rule is why a generated page cannot invent its own navigation; the token rule
 * is what makes a page track the site's theme instead of hardcoding one theme's palette; the
 * no-`<form>` rule exists because a form posting nowhere silently loses real leads.
 */
export const PAGE_HTML_CONTRACT =
  "CONTRACT for the HTML you write:\n" +
  "- INNER CONTENT ONLY. Never emit <html>, <head>, <body>, <nav>, or a site footer — the active " +
  "theme's template owns all page chrome and wraps whatever you write. Emitting them produces a " +
  "broken, doubled page.\n" +
  // Supplies the real tokens on purpose (demo video V1, 2026-10-05): "style with theme tokens" alone left
  // the model guessing `--text`, which no theme defines, so its light-mode fallback painted a dark-gray
  // heading on the dark theme. The theme's own `body`/heading rules already colour text for both modes,
  // so inheriting is the default. Read the active vocabulary rather than assuming every theme uses
  // --fg: templated themes use --ink/--line. `features/theme/token-aliases.ts` is the render-side backstop.
  "- COLOURS FOLLOW THE THEME, in light AND dark mode. Let text inherit its colour: do not set `color` " +
  "on headings, paragraphs or lists, and do not give a section a `background` unless the design needs " +
  "one — the theme already colours them for both modes. When you do need a colour, font or border, " +
  "call pages_read_html FIRST, even for a new page: its `theme` contains the active theme's actual " +
  "`tokens` and `tokensLight` overrides. Use ONLY names present in `theme.tokens`, each with a literal " +
  "fallback; inspect `theme.tokensLight` for light-mode values. If `theme` is null, inherit colours " +
  "and fonts without assuming any token vocabulary. Never a bare hex and never a bare var() without " +
  "a fallback. Do not guess names: a token the theme lacks silently uses its fallback, and a " +
  "literal fallback is right in only ONE mode — dark text vanishes on the dark theme. A <style> " +
  "block inside the content is fine and is the expected way to style a bespoke page.\n" +
  // Same page, same cause: every section got its own max-width + `padding: 3rem` wrapper inside the
  // theme's article, which already sets both — a 128px hole between the intro and the form.
  "- LAYOUT: the theme's content area already sets the page width and the space around the content. " +
  "Do not wrap each section in its own max-width or padding container; separate sections with a " +
  "modest margin (at most about 2rem) so the page does not open large empty gaps.\n" +
  // Luvira import, 2026-10-08: copied markup keeps a source site's scroll-reveal start state, and no
  // page script ever reveals it. The writers also return a `warning` naming each hidden element.
  "- VISIBLE WITHOUT SCRIPTS: no script from another site runs here. Never keep a scroll-reveal start " +
  "state (inline `opacity:0` or `visibility:hidden`, data-aos/data-sal attributes, a `.reveal { opacity: 0 }` " +
  "rule); write every element in its final, visible state.\n" +
  "- TAG EDITABLE REGIONS with `data-agent-element=\"<handle>\" data-agent-role=\"region\"` on each " +
  "top-level section. These handles are how you edit parts of the page later without rewriting all " +
  `of it. A starter page ships with ${PAGE_SKELETON_REGIONS.join(", ")}; keep those handles when they ` +
  "still fit the content, and add new ones for new sections.\n" +
  "- BROWSER AGENTS (WebMCP): tag visitor-facing buttons, links and tabs with " +
  "`data-toolname=\"<unique-action-name>\" data-tooldescription=\"<what the action does>\"`. " +
  "These tags describe non-form actions; a published-site registration script is needed to expose " +
  "them as WebMCP tools. `data-tovu-agent` is retired. Keep the data-agent-element REGION handles " +
  "above for page editing; visitor-action tags serve a different purpose.\n" +
  "- REAL FORMS: when working with a form backed by the site's forms system, preserve its action, " +
  "method and field names, and add `toolname`, `tooldescription`, plus `toolparamtitle` and " +
  "`toolparamdescription` on named controls. Use `toolautosubmit` only for read-only operations " +
  "such as search. Contact, newsletter and booking submissions must retain human submission. " +
  "Do not invent a submission endpoint or field contract just to add WebMCP tags.\n" +
  "- NO <form action=\"...\">. A form you invent posts nowhere and silently drops whatever a visitor " +
  "types into it. If the page needs to collect anything, embed a real form with the `form` marker " +
  "below; if no suitable form exists yet, say so in your reply instead of writing one.\n" +
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
  otherEmbedTypesText({ targetKeys: EMBED_MARKER_TARGET_KEYS }) +
  ". Prefer media slug content: `<div data-embed-config='{\"type\":\"media\",\"content\":{\"mode\":\"media\",\"items\":[{\"slug\":\"photo-slug\",\"alt\":\"Description\"}],\"layout\":\"grid\"}}'></div>`. " +
  "A saved Media widget uses {type:widget,slug:<widget-slug>,content:{items:[{slug:<media-slug>}]}} for placement overrides. Raw HTML mode is {mode:html,html:<HTML>} with {{media:slug}} URL tokens or data-media-slug on img/video/audio; unknown slugs remove the element and produce diagnostics. All raw HTML uses the page-body sanitizer; safe data-kui attributes work in JSON htmlAttributes or plain marker attributes. " +
  ". Legacy Gallery compatibility: for multiple images use `<div data-embed-config='{\"type\":\"gallery\",\"images\":[{\"mediaId\":\"asset-1\",\"alt\":\"Description\",\"caption\":\"Optional caption\"}],\"layout\":\"grid\",\"columns\":3}'></div>`; replace asset-1 with the real uploaded media id. " +
  "Use 1-50 images, each with exactly one `mediaId` or HTTP(S) `src`; prefer uploaded media for this site. " +
  "Supply `alt` for every image (empty string only for decorative images). `layout` is `grid|carousel|masonry`, " +
  "`columns` is an integer 2-6, and `aspectRatio` may be a positive ratio such as `16/9`. Grid/masonry need no JS; " +
  "carousel uses native CSS scroll-snap. `lightbox` is an optional boolean enhancement hint; it requires theme script support. " +
  "Style the `jini-gallery` and `jini-gallery-item` classes with theme CSS; do not add data-kui animations.";

