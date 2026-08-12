import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/cms/core";
import type { WidgetRenderIR } from "#src/widgets/types";
import { renderDocNode, renderWidgetIr } from "../render";

/**
 * @file Table-driven TipTap-JSON→HTML round-trip contract for the public renderer
 * (`renderDocNode`/`renderMarks`, `../render.ts`).
 *
 * ## Why this file exists
 *
 * The admin editor (Tiptap, in the browser) and the public site (`renderDocNode`/`renderMarks`,
 * a hand-written switch statement) are two independent implementations of the same TipTap-JSON
 * vocabulary. A node or mark type the editor can produce but the switch statement has no case for
 * is silently discarded on the public site — no error, no warning, no placeholder, nothing a
 * screenshot or a unit test written after the fact would catch, because the failure mode IS the
 * absence of output.
 *
 * Four bugs of exactly this shape shipped in one day (2026-08-11), each found by hand:
 *  - `textAlign` — toolbar shipped, alignment dropped publicly (`8624306`)
 *  - `underline` — toolbar shipped, dropped publicly (`154a5be`)
 *  - `strike` — in the toolbar for weeks, never rendered publicly (`154a5be`)
 *  - `hardBreak` — Shift+Enter, no button needed, dropped publicly (`b184940`)
 *
 * `render.test.ts` (a sibling file, NOT edited by this task — owned by `EditorExtensions`) already
 * has thorough hand-written `it()`-style coverage for most of these node/mark types. What it does
 * NOT have is a structure that makes a MISSING type visible: a pile of individual `test()` blocks
 * hides an omission, which is exactly how all four bugs above survived. This file is a single table
 * — one row per node/mark type the editor can produce — plus a guard (see the bottom of this file)
 * that fails when the table's coverage drifts from a maintained checklist of what the editor
 * actually registers. Adding a capability means adding a row; a missing row is now visible in code
 * review AND in a failing test, not just in review.
 *
 * ## Coverage this table closes that `render.test.ts` did not have
 *
 * Cross-checked against `render.test.ts` (2026-08-11, `grep`-verified): `bulletList`, `orderedList`,
 * `listItem`, `blockquote`, `codeBlock`, and `horizontalRule` had ZERO test coverage anywhere in this
 * codebase before this file, despite `renderDocNode` having a correct case for every one of them
 * today. That is the same blind spot the four historical bugs exploited — a case existing in the
 * switch statement is not evidence anyone would notice if it were later deleted or broken. See the
 * rows marked "GAP CLOSED" below.
 *
 * ## What this table found (as of 2026-08-11)
 *
 * Every node/mark type registered by the editor today has a matching, currently-correct case in
 * `renderDocNode`/`renderMarks`. This file found NO currently-broken renderer gap. Its value is the
 * safety net for the NEXT one — and one arrived while this file was still being written: the
 * `highlight` mark (`@tiptap/extension-highlight`) landed in `render.ts` and
 * `use-post-editor.hooks.ts` mid-session (`EditorExtensions`, still 2026-08-11). It is included below
 * as a live example of the exact discipline this table exists to enforce, added the same session it
 * shipped rather than left as a gap for a future pass. More mark/node types remain queued
 * (`EditorExtensions`' own worklist: Subscript/Superscript, text/background color, font
 * family/size/line-height, Typography, Tables, TaskList/TaskItem) and each will need both a
 * `renderDocNode`/`renderMarks` case AND a row here.
 *
 * ## Registered-type enumeration: documented checklist, not live extraction (disclosed limitation)
 *
 * The ideal drift guard would enumerate the editor's registered extensions directly at test time and
 * assert each has a table row, so a NEW extension with no renderer case fails CI even if this file's
 * table is never touched. That is not cleanly available from here, for two independent reasons
 * confirmed while writing this file:
 *
 * 1. `apps/admin` is a separate npm package, not a member of the root `workspaces` array
 *    (`package.json`'s `workspaces` is `["packages/*"]` only — `apps/` is excluded from the root
 *    `tsconfig.json` too). It has its own `node_modules` (`@tiptap/*` lives ONLY at
 *    `apps/admin/node_modules/@tiptap/*` — confirmed absent from the repo-root `node_modules`).
 *    Node's module resolution walks UP from the importing file looking for `node_modules`; it never
 *    walks sideways into a sibling app's tree. A bare `import ... from "@tiptap/starter-kit"` in this
 *    file (under `src/server/`) cannot resolve.
 * 2. Two of the four custom extensions registered in `use-post-editor.hooks.ts`
 *    (`apps/admin/src/lib/media-image-extension.tsx`, `.../widget-embed-extension.tsx`) are `.tsx`
 *    modules that construct their node view via `ReactNodeViewRenderer` — importing them would pull
 *    in React and a DOM, neither of which this Node-only (`node:test`) suite has, and standing one up
 *    just to read a `.name` string would be a heavy, fragile dependency for a drift check.
 *
 * So the guard below is a documented checklist (`REGISTERED_NODE_TYPES`/`REGISTERED_MARK_TYPES`,
 * hand-maintained against the source files cited on each entry) cross-checked for SELF-consistency
 * against `CONTRACT_TABLE`. It catches "the checklist says X is registered but no row covers X" and
 * "a row covers Y but the checklist doesn't know Y exists" — i.e. the table and the checklist cannot
 * silently drift from EACH OTHER. It does NOT catch a human registering a brand-new extension in
 * `use-post-editor.hooks.ts` and forgetting to touch this checklist too — that step is still manual.
 * A follow-up that would close that last gap: a small script run under `apps/admin`'s own test
 * environment (which already has React/jsdom) that imports the real extension list and writes a
 * `registered-editor-types.generated.json` fixture this file could read — out of scope here since it
 * would mean writing into `apps/admin/src/features/posts/**` or `apps/admin/src/lib/*-extension.ts`,
 * both `EditorExtensions`' territory for this session.
 */

// ---------------------------------------------------------------------------
// Registered-type checklist — see this file's header for why this is
// hand-maintained rather than live-enumerated, and what the guard at the
// bottom of this file does and does not catch.
// ---------------------------------------------------------------------------

/** Every doc-node type `use-post-editor.hooks.ts` registers today, with its source. */
const REGISTERED_NODE_TYPES = [
  "doc", // apps/admin/src/lib/post-title-extension.ts — PostTitleDocument (content: "title block+"),
  // replacing StarterKit's own `document` node (`StarterKit.configure({ document: false })`).
  "title", // apps/admin/src/lib/post-title-extension.ts — PostTitle
  "paragraph", // @tiptap/starter-kit -> @tiptap/extension-paragraph
  "heading", // @tiptap/starter-kit -> @tiptap/extension-heading (levels 1-6, StarterKit default)
  "text", // @tiptap/starter-kit -> @tiptap/extension-text
  "bulletList", // @tiptap/starter-kit -> @tiptap/extension-list (BulletList)
  "orderedList", // @tiptap/starter-kit -> @tiptap/extension-list (OrderedList)
  "listItem", // @tiptap/starter-kit -> @tiptap/extension-list (ListItem)
  "blockquote", // @tiptap/starter-kit -> @tiptap/extension-blockquote
  "codeBlock", // @tiptap/starter-kit -> @tiptap/extension-code-block
  "horizontalRule", // @tiptap/starter-kit -> @tiptap/extension-horizontal-rule
  "hardBreak", // @tiptap/starter-kit -> @tiptap/extension-hard-break
  "image", // apps/admin/src/lib/media-image-extension.tsx — MediaImage (extends @tiptap/extension-image,
  // keeps the node NAME "image" deliberately — see that file's own header)
  "widgetEmbed", // apps/admin/src/lib/widget-embed-extension.tsx — WidgetEmbed
] as const;

/** Every mark type `use-post-editor.hooks.ts` registers today (all via StarterKit), with its source. */
const REGISTERED_MARK_TYPES = [
  "bold", // @tiptap/starter-kit -> @tiptap/extension-bold
  "italic", // @tiptap/starter-kit -> @tiptap/extension-italic
  "code", // @tiptap/starter-kit -> @tiptap/extension-code (inline mark — distinct from the codeBlock NODE)
  "strike", // @tiptap/starter-kit -> @tiptap/extension-strike
  "underline", // @tiptap/starter-kit -> @tiptap/extension-underline
  "link", // @tiptap/starter-kit -> @tiptap/extension-link
  "highlight", // apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts — Highlight.configure({
  // multicolor: true }), @tiptap/extension-highlight (landed live DURING this session, 2026-08-11 —
  // see this file's header changelog note)
] as const;

/**
 * Confirmed NOT to register document vocabulary (read `@tiptap/extensions/src/{drop-cursor,
 * gap-cursor,trailing-node,undo-redo}/*.ts` and `@tiptap/extension-list`'s `ListKeymap` directly,
 * 2026-08-11): each is `Extension.create(...)`, never `Node.create`/`Mark.create`. They add editing
 * BEHAVIOR (cursor rendering, undo/redo history, list-boundary keymaps, ensuring a trailing block
 * exists) over the schema, not new node/mark types — so they need no `renderDocNode`/`renderMarks`
 * case and no row here. Listed so a future reader does not have to re-derive this: `dropcursor`,
 * `gapcursor`, `undoRedo`, `listKeymap`, `trailingNode`.
 *
 * `TextAlign` (`@tiptap/extension-text-align`) is likewise an `Extension`, not a node/mark — it adds
 * a `textAlign` ATTRIBUTE to the already-registered `heading`/`paragraph`/`title` nodes
 * (`.configure({ types: ["heading", "paragraph", "title"] })` in `use-post-editor.hooks.ts`). Covered
 * by the align-variant rows on those three node types below, not by a row of its own.
 */
const NON_CONTENT_EXTENSIONS_VERIFIED = [
  "dropcursor",
  "gapcursor",
  "undoRedo",
  "listKeymap",
  "trailingNode",
  "textAlign (attribute extension, not a node/mark)",
] as const;
void NON_CONTENT_EXTENSIONS_VERIFIED; // documentation-only — see comment above.

// ---------------------------------------------------------------------------
// The contract table
// ---------------------------------------------------------------------------

interface ContractRow {
  /** Short id for the test name. */
  label: string;
  /** Every node/mark TYPE this row exercises — cross-checked against the checklist above by the
   *  drift guard at the bottom of this file. A row may cover more than one type (e.g. a list row
   *  covers both the list node and `listItem`). */
  types: readonly string[];
  /** The exact TipTap JSON `renderDocNode` receives, shaped as a full `doc`. */
  doc: JsonObject;
  /** The exact HTML `renderDocNode(doc, inlineResolved, mediaTransformVersions)` must produce. */
  html: string;
  inlineResolved?: ReadonlyMap<string, WidgetRenderIR>;
  mediaTransformVersions?: ReadonlyMap<string, number>;
}

const CONTRACT_TABLE: readonly ContractRow[] = [
  // --- marks -----------------------------------------------------------
  {
    label: "bold mark",
    types: ["doc", "paragraph", "text", "bold"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "b", marks: [{ type: "bold" }] }] }] },
    html: "<p><strong>b</strong></p>",
  },
  {
    label: "italic mark",
    types: ["italic"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "i", marks: [{ type: "italic" }] }] }] },
    html: "<p><em>i</em></p>",
  },
  {
    label: "code mark (inline) — distinct from the codeBlock node below",
    types: ["code"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "c", marks: [{ type: "code" }] }] }] },
    html: "<p><code>c</code></p>",
  },
  {
    label: "underline mark — one of the two marks that shipped in the toolbar and rendered nothing publicly (154a5be)",
    types: ["underline"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "u", marks: [{ type: "underline" }] }] }] },
    html: "<p><u>u</u></p>",
  },
  {
    label: "strike mark — the other mark from 154a5be (in the toolbar for weeks, never rendered)",
    types: ["strike"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "s", marks: [{ type: "strike" }] }] }] },
    html: "<p><s>s</s></p>",
  },
  {
    label: "link mark",
    types: ["link"],
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "plugins", marks: [{ type: "link", attrs: { href: "/docs" } }] }] }],
    },
    html: '<p><a href="/docs">plugins</a></p>',
  },
  {
    // Landed in render.ts WHILE this file was being written (EditorExtensions, 2026-08-11) — added
    // here the same session it shipped, rather than left for a future pass, as a live demonstration
    // of the exact discipline this table exists to enforce: a new mark lands with both a renderer
    // case AND a table row, not just the former.
    label: "highlight mark, no color attr (plain toolbar toggle) — landed live during this session",
    types: ["highlight"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "h", marks: [{ type: "highlight" }] }] }] },
    html: "<p><mark>h</mark></p>",
  },
  {
    label: "highlight mark with an allowlisted color attr renders an inline background-color",
    types: ["highlight"],
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "h", marks: [{ type: "highlight", attrs: { color: "#ffcc00" } }] }] }],
    },
    html: '<p><mark style="background-color:#ffcc00">h</mark></p>',
  },
  {
    label: "hardBreak — Shift+Enter, no toolbar button, the fourth historical bug (b184940)",
    types: ["hardBreak"],
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "line one" }, { type: "hardBreak" }, { type: "text", text: "line two" }] }],
    },
    html: "<p>line one<br/>line two</p>",
  },

  // --- paragraph / textAlign --------------------------------------------
  {
    label: "paragraph, no textAlign attr",
    types: ["paragraph"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
    html: "<p>Hello</p>",
  },
  {
    label: "paragraph, textAlign justify — the first historical bug (8624306)",
    types: ["paragraph", "textAlign"],
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "Justified." }] }] },
    html: '<p style="text-align:justify">Justified.</p>',
  },
  {
    label: "paragraph, textAlign left — the CSS default, never emitted as an explicit style (regression guard)",
    types: ["paragraph", "textAlign"],
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Left." }] }] },
    html: "<p>Left.</p>",
  },

  // --- heading / textAlign / anchor id -----------------------------------
  {
    label: "heading level 1, no align",
    types: ["heading"],
    doc: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Getting Started" }] }] },
    html: '<h1 id="getting-started">Getting Started</h1>',
  },
  {
    label: "heading level 3, textAlign right — id comes first, then the align style",
    types: ["heading", "textAlign"],
    doc: { type: "doc", content: [{ type: "heading", attrs: { level: 3, textAlign: "right" }, content: [{ type: "text", text: "Notes" }] }] },
    html: '<h3 id="notes" style="text-align:right">Notes</h3>',
  },

  // --- lists — GAP CLOSED: zero coverage anywhere in this codebase before this file ------
  {
    label: "bulletList + listItem — GAP CLOSED (no prior test coverage for either type)",
    types: ["bulletList", "listItem"],
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
          ],
        },
      ],
    },
    html: "<ul><li><p>One</p></li><li><p>Two</p></li></ul>",
  },
  {
    label: "orderedList + listItem — GAP CLOSED",
    types: ["orderedList", "listItem"],
    doc: {
      type: "doc",
      content: [{ type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Step one" }] }] }] }],
    },
    html: "<ol><li><p>Step one</p></li></ol>",
  },

  // --- blockquote / codeBlock / horizontalRule — GAP CLOSED ------------------------------
  {
    label: "blockquote — GAP CLOSED",
    types: ["blockquote"],
    doc: { type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Wise words." }] }] }] },
    html: "<blockquote><p>Wise words.</p></blockquote>",
  },
  {
    label: "codeBlock, content escaped like any other text — GAP CLOSED",
    types: ["codeBlock"],
    doc: { type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "if (x < y) return;" }] }] },
    html: "<pre><code>if (x &lt; y) return;</code></pre>",
  },
  {
    label: "horizontalRule — GAP CLOSED",
    types: ["horizontalRule"],
    doc: { type: "doc", content: [{ type: "horizontalRule" }] },
    html: "<hr/>",
  },

  // --- custom nodes: image (ref-based), widgetEmbed, title ----------------------------
  {
    label: "image, ref-based (assetId+transformName resolved) — real <img> against the /m/ URL contract",
    types: ["image"],
    doc: { type: "doc", content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "A cat" } }] },
    mediaTransformVersions: new Map([["public", 3]]),
    html: '<img src="/m/asset-1/public.v3/image.jpg" alt="A cat" loading="lazy">',
  },
  {
    label: "widgetEmbed, resolved through inlineResolved",
    types: ["widgetEmbed"],
    doc: { type: "doc", content: [{ type: "widgetEmbed", attrs: { placementId: "p1", widgetEntryId: "w1" } }] },
    inlineResolved: new Map<string, WidgetRenderIR>([["p1", { componentId: "text", props: { body: "Hello widget" } }]]),
    html: '<div class="widget widget-text">Hello widget</div>',
  },
  {
    label: "title node — deliberately contributes NOTHING to a generic doc walk (post.title prints separately elsewhere; see the post-content table below for the node's real render target)",
    types: ["title"],
    doc: {
      type: "doc",
      content: [{ type: "title", content: [{ type: "text", text: "My Post Title" }] }, { type: "paragraph", content: [{ type: "text", text: "Body." }] }],
    },
    html: "<p>Body.</p>",
  },
];

// ---------------------------------------------------------------------------
// TipTap round-trip contract: renderDocNode(doc)
// ---------------------------------------------------------------------------

for (const row of CONTRACT_TABLE) {
  test(`renderDocNode contract: ${row.label}`, () => {
    const html = renderDocNode(row.doc, row.inlineResolved, row.mediaTransformVersions);
    assert.equal(html, row.html);
  });
}

// ---------------------------------------------------------------------------
// The title node's REAL render target: renderWidgetIr({componentId: "post-content", ...}),
// via extractTitleNode. A separate small table because the call shape differs (renderWidgetIr,
// not renderDocNode) and the output is a fragment (`.includes()`, matching render.test.ts's own
// convention for this path) rather than a whole-document exact match.
// ---------------------------------------------------------------------------

interface PostContentRow {
  label: string;
  bodyJson: JsonObject;
  /** A substring that MUST appear in the rendered post-content HTML. */
  mustInclude: string;
}

const POST_CONTENT_TABLE: readonly PostContentRow[] = [
  {
    label: "title node with text + center align drives the <h1>, not props.title",
    bodyJson: {
      type: "doc",
      content: [
        { type: "title", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Great Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    },
    mustInclude: '<h1 style="text-align:center">Great Title</h1>',
  },
  {
    label:
      "EMPTY title node (select-all-backspace on the title leaves an empty, non-deleted node — the schema's own \"title block+\" content spec guarantees this is reachable) renders a real but EMPTY <h1>, never a placeholder and never a fallback to props.title",
    bodyJson: { type: "doc", content: [{ type: "title", content: [] }, { type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
    mustInclude: "<h1></h1>",
  },
];

for (const row of POST_CONTENT_TABLE) {
  test(`renderWidgetIr('post-content') contract: ${row.label}`, () => {
    const html = renderWidgetIr({ componentId: "post-content", props: { title: "ignored — stale by design", bodyJson: row.bodyJson } });
    assert.ok(html.includes(row.mustInclude), html);
    assert.ok(!html.includes("widget-placeholder"), html);
  });
}

// ---------------------------------------------------------------------------
// Drift guard — see this file's header ("Registered-type enumeration") for exactly what this
// does and does not prove.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Drift guard: CONTRACT_TABLE vs the maintained REGISTERED_*_TYPES checklist
// ---------------------------------------------------------------------------

test("drift guard: every registered node type has at least one contract-table row", () => {
  const coveredTypes = new Set(CONTRACT_TABLE.flatMap((row) => row.types));
  const missing = REGISTERED_NODE_TYPES.filter((type) => !coveredTypes.has(type));
  assert.deepEqual(missing, [], `registered node type(s) with no CONTRACT_TABLE row: ${missing.join(", ")}`);
});

test("drift guard: every registered mark type has at least one contract-table row", () => {
  const coveredTypes = new Set(CONTRACT_TABLE.flatMap((row) => row.types));
  const missing = REGISTERED_MARK_TYPES.filter((type) => !coveredTypes.has(type));
  assert.deepEqual(missing, [], `registered mark type(s) with no CONTRACT_TABLE row: ${missing.join(", ")}`);
});

test("drift guard: every contract-table row's types are all in the maintained checklist (a row cannot silently outrun the checklist)", () => {
  const coveredTypes = new Set(CONTRACT_TABLE.flatMap((row) => row.types));
  const known = new Set<string>([...REGISTERED_NODE_TYPES, ...REGISTERED_MARK_TYPES, "textAlign"]);
  const unknown = [...coveredTypes].filter((type) => !known.has(type));
  assert.deepEqual(unknown, [], `CONTRACT_TABLE row(s) reference type(s) missing from REGISTERED_*_TYPES: ${unknown.join(", ")}`);
});
