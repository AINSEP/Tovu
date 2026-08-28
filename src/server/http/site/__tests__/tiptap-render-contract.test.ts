import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/cms/core";
import type { WidgetRenderIR } from "#src/features/widgets/types";
import { renderDocNode, renderWidgetIr } from "../render.js";

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
 * ## 2026-08-12 backfill — the table outgrew itself within hours, as predicted
 *
 * This table's own header (immediately above) named its queued gap: subscript/superscript, text/
 * background color, font family/size/line-height, Typography, Tables, TaskList/TaskItem never got a
 * row when they shipped. This pass closes all of it (`codeBlock`'s `language` attr too — shipped the
 * same session, also never got a row) and finds a FIFTH silent-drop bug of the exact shape this file
 * exists to catch: `mention` (`@tiptap/extension-mention`, wired into the toolbar's "Mention a post"
 * picker the same session) had no `renderDocNode` case at all — an atom node with no case falls
 * through to `default`'s `renderNodes(content, ...)`, and an atom's `content` is always `undefined`,
 * so the whole mention silently vanished on the public site. Fixed in `render.ts` alongside this
 * backfill, not left as a documented gap — see that case's own comment for the full account.
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
  // --- backfilled 2026-08-12 (this file's own worklist note above, closed) ---
  "taskList", // @tiptap/extension-list — TaskList
  "taskItem", // @tiptap/extension-list — TaskItem
  "table", // @tiptap/extension-table — Table (resizable: false)
  "tableRow", // @tiptap/extension-table — TableRow
  "tableCell", // @tiptap/extension-table — TableCell
  "tableHeader", // @tiptap/extension-table — TableHeader
  "youtube", // @tiptap/extension-youtube — Youtube
  "mention", // @tiptap/extension-mention — Mention. Registered by the toolbar-polish pass (2026-08-11)
  // that added `PostEditor.tsx`'s "Mention a post" picker — its `renderDocNode` case did NOT exist
  // until this same 2026-08-12 backfill pass found the gap while adding this row (see the contract
  // table entry below for the full account): a fifth silent-drop bug of the exact shape this file's
  // header warns about, caught by the process this file exists to enforce rather than by a human
  // noticing in the product.
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
  // --- backfilled 2026-08-12 ---
  "subscript", // @tiptap/extension-subscript — Subscript
  "superscript", // @tiptap/extension-superscript — Superscript
  "textStyle", // @tiptap/extension-text-style — TextStyle, the one mark shared by the Color/
  // BackgroundColor/FontFamily/FontSize/LineHeight `Extension`s (each attaches a global attribute
  // to this mark rather than registering a mark of its own — see `renderMarks`'s own `"textStyle"`
  // case for the confirmed-against-dist citation). Attributes, not separate mark types, so one row
  // type covers all five, same shape `highlight`'s two rows already use above.
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
 *
 * `Typography` (`@tiptap/extension-typography`, backfilled 2026-08-12) is confirmed the same way:
 * `Extension.create`, pure `textInputRule`s that rewrite what an author TYPES (straight quotes to
 * curly, `--` to an em dash, …) into plain `text` node characters as they're typed. Nothing reaches
 * `bodyJson` that isn't already an ordinary `text` node the `"text"` row above already covers — there
 * is no `typography` node/mark type for `renderDocNode`/`renderMarks` to have a case for, and no way
 * for this table to distinguish a curly quote an author typed from one they pasted.
 */
const NON_CONTENT_EXTENSIONS_VERIFIED = [
  "dropcursor",
  "gapcursor",
  "undoRedo",
  "listKeymap",
  "trailingNode",
  "textAlign (attribute extension, not a node/mark)",
  "typography (input-rule behavior extension, not a node/mark — backfilled 2026-08-12)",
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
    label: "subscript mark — backfilled 2026-08-12",
    types: ["subscript"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "2", marks: [{ type: "subscript" }] }] }] },
    html: "<p><sub>2</sub></p>",
  },
  {
    label: "superscript mark — backfilled 2026-08-12",
    types: ["superscript"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "2", marks: [{ type: "superscript" }] }] }] },
    html: "<p><sup>2</sup></p>",
  },
  {
    label: "textStyle mark, color attr only — backfilled 2026-08-12",
    types: ["textStyle"],
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "t", marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }] }] }],
    },
    html: '<p><span style="color:#ff0000">t</span></p>',
  },
  {
    label: "textStyle mark, all five style attrs combined into ONE span (Color/BackgroundColor/FontFamily/FontSize/LineHeight all attach to the same shared mark) — backfilled 2026-08-12",
    types: ["textStyle"],
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "t",
              marks: [
                {
                  type: "textStyle",
                  attrs: { color: "#ff0000", backgroundColor: "#00ff00", fontFamily: "Georgia, serif", fontSize: "18px", lineHeight: "1.4" },
                },
              ],
            },
          ],
        },
      ],
    },
    html: '<p><span style="color:#ff0000;background-color:#00ff00;font-family:Georgia, serif;font-size:18px;line-height:1.4">t</span></p>',
  },
  {
    label: "textStyle mark, no attrs survive the allowlist — renders bare text, no empty style=\"\" span — backfilled 2026-08-12",
    types: ["textStyle"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "t", marks: [{ type: "textStyle", attrs: {} }] }] }] },
    html: "<p>t</p>",
  },
  {
    label:
      "textStyle mark security guard: safeCssColor/safeCssFontFamily/safeCssLength are each INDEPENDENT — a rejected injection value in one attr does not invalidate a valid sibling attr in the same mark — backfilled 2026-08-12",
    types: ["textStyle"],
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "t",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    color: "#ff0000",
                    backgroundColor: "red; background-image:url(javascript:alert(1))",
                    fontFamily: "</style><script>alert(1)</script>",
                    fontSize: "16px; background:url(x)",
                    lineHeight: "1.4",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    html: '<p><span style="color:#ff0000;line-height:1.4">t</span></p>',
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
    label: "codeBlock, attrs.language emits a language-* class token — backfilled 2026-08-12",
    types: ["codeBlock"],
    doc: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "python" }, content: [{ type: "text", text: "x = 1" }] }] },
    html: '<pre><code class="language-python">x = 1</code></pre>',
  },
  {
    label: "codeBlock, attrs.language injection rejected by the alphanumeric+hyphen allowlist — falls back to a bare <code>, no class — backfilled 2026-08-12",
    types: ["codeBlock"],
    doc: {
      type: "doc",
      content: [{ type: "codeBlock", attrs: { language: '"><script>alert(1)</script>' }, content: [{ type: "text", text: "x = 1" }] }],
    },
    html: "<pre><code>x = 1</code></pre>",
  },
  {
    label:
      "image, LEGACY src-only node: a plain https URL now RENDERS (safeImageSrc allowlist, 2026-08-12) — the 'Img by URL' toolbar control was removed and then restored the same day, and this row is what proves the restored control actually reaches the public page",
    types: ["image"],
    doc: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/cat.png", alt: "A cat" } }] },
    html: '<img src="https://example.com/cat.png" alt="A cat" loading="lazy" />',
  },
  {
    label:
      "image security guard: a javascript: src is rejected by safeImageSrc's http(s)-only ALLOWLIST (not a denylist, so an unforeseen scheme fails closed) and degrades to the same placeholder an unresolvable ref gets",
    types: ["image"],
    doc: { type: "doc", content: [{ type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } }] },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">x</span></figure>',
  },
  {
    label:
      "image security guard: a data: blob src is rejected — this is the base64-inlining shape the FileHandler upload path exists to avoid, and it must never reach a public page",
    types: ["image"],
    doc: {
      type: "doc",
      content: [{ type: "image", attrs: { src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", alt: "x" } }],
    },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">x</span></figure>',
  },
  {
    label:
      "image security guard: the AUTHENTICATED admin media URL is rejected — the editor's own node view legitimately previews via /workspaces/{ws}/media/{id}/original, so it really can land in attrs.src; emitting it publicly would give every reader a broken image and disclose internal routing. This is the specific case the old blanket src refusal existed to stop.",
    types: ["image"],
    doc: {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://admin.example.com/api/admin/v1/workspaces/workspace-local/media/abc123/original", alt: "leak" } },
      ],
    },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">leak</span></figure>',
  },
  {
    label:
      "image security guard, round 2 (TM-TOVU-2026-08-12-A): a `/./` dot-segment interposed in the admin media path is STILL rejected — the old check tested the raw string, and `[^/]+` cannot span a `/`, so this exact shape evaded it while a browser resolves the `.` away and lands on the real blocked route anyway (confirmed with `new URL()` before the fix). Proves the check now tests the WHATWG-normalized pathname.",
    types: ["image"],
    doc: {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "https://admin.example.com/api/admin/v1/workspaces/workspace-local/media/abc123/./original", alt: "leak-dotseg" },
        },
      ],
    },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">leak-dotseg</span></figure>',
  },
  {
    label:
      "image security guard, round 2 (TM-TOVU-2026-08-12-A): a `/../` dot-segment traversal is STILL rejected — same mechanism as the `/./` row above, the other direction a raw-string regex cannot see across a `/`.",
    types: ["image"],
    doc: {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://admin.example.com/api/admin/v1/workspaces/workspace-local/media/other/../abc123/original",
            alt: "leak-dotdot",
          },
        },
      ],
    },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">leak-dotdot</span></figure>',
  },
  {
    label:
      "image security guard, round 2 (TM-TOVU-2026-08-12-A): embedded userinfo credentials are rejected — unlike a link href, an <img> auto-fires the request with no reader click and no address-bar text to warn them, so whatever an author pasted as user:pass would silently ship to a third-party host on every page view.",
    types: ["image"],
    doc: { type: "doc", content: [{ type: "image", attrs: { src: "https://user:pass@evil.example/x.png", alt: "creds" } }] },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">creds</span></figure>',
  },
  {
    label: "horizontalRule — GAP CLOSED",
    types: ["horizontalRule"],
    doc: { type: "doc", content: [{ type: "horizontalRule" }] },
    html: "<hr/>",
  },

  // --- taskList / taskItem — backfilled 2026-08-12 ---------------------------------------
  {
    label: "taskList + taskItem, checked and unchecked — checkbox rendered disabled publicly (no click handler on the site) — backfilled 2026-08-12",
    types: ["taskList", "taskItem"],
    doc: {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Todo" }] }] },
          ],
        },
      ],
    },
    html:
      '<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" checked disabled/><span></span></label><div><p>Done</p></div></li>' +
      '<li data-type="taskItem"><label><input type="checkbox" disabled/><span></span></label><div><p>Todo</p></div></li></ul>',
  },

  // --- table / tableRow / tableCell / tableHeader — backfilled 2026-08-12 ----------------
  {
    label: "table + tableRow + tableHeader + tableCell, basic 2x2 grid — backfilled 2026-08-12",
    types: ["table", "tableRow", "tableHeader", "tableCell"],
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Age" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "36" }] }] },
              ],
            },
          ],
        },
      ],
    },
    html:
      "<table><tr><th><p>Name</p></th><th><p>Age</p></th></tr>" +
      "<tr><td><p>Ada</p></td><td><p>36</p></td></tr></table>",
  },
  {
    label: "tableCell colspan/rowspan within the 1-1000 bound render as attributes; colspan/rowspan of exactly 1 is omitted (HTML default, not written out) — backfilled 2026-08-12",
    types: ["table", "tableRow", "tableCell"],
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [{ type: "tableCell", attrs: { colspan: 2, rowspan: 3 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Merged" }] }] }],
            },
          ],
        },
      ],
    },
    html: '<table><tr><td colspan="2" rowspan="3"><p>Merged</p></td></tr></table>',
  },
  {
    label:
      "tableCell colspan/rowspan security guard: out-of-bound (1001 > 1000 ceiling) and a non-numeric injection string both fall back to the default 1 (omitted), never an unbounded or malformed attribute — backfilled 2026-08-12",
    types: ["table", "tableRow", "tableCell"],
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1001, rowspan: "3\" onmouseover=\"alert(1)" },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Bad" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    html: "<table><tr><td><p>Bad</p></td></tr></table>",
  },
  {
    label: "tableCell/tableHeader align: center/right accepted, justify rejected (a single cell's own normalizeTableCellAlign never produces it) — backfilled 2026-08-12",
    types: ["table", "tableRow", "tableCell", "tableHeader"],
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { align: "center" }, content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] },
                { type: "tableHeader", attrs: { align: "justify" }, content: [{ type: "paragraph", content: [{ type: "text", text: "J" }] }] },
              ],
            },
          ],
        },
      ],
    },
    html: '<table><tr><td style="text-align:center"><p>C</p></td><th><p>J</p></th></tr></table>',
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
    label: "youtube, a recognized watch-URL shape re-derives the video id into a nocookie embed with start time — backfilled 2026-08-12",
    types: ["youtube"],
    doc: { type: "doc", content: [{ type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", start: 30 } }] },
    html:
      '<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30" title="YouTube video" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>',
  },
  {
    label: "youtube security guard: a non-YouTube/javascript: src is never trusted into an <iframe src> — degrades to the media placeholder — backfilled 2026-08-12",
    types: ["youtube"],
    doc: { type: "doc", content: [{ type: "youtube", attrs: { src: "javascript:alert(1)" } }] },
    html: '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Video unavailable</span></figure>',
  },
  {
    label: "mention, a real slug+label renders a link — the fifth silent-drop bug: this case did not exist until this same backfill pass added it (2026-08-12)",
    types: ["mention"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "hello-world", label: "Hello World" } }] }] },
    html: '<p><a class="post-mention" href="/hello-world">@Hello World</a></p>',
  },
  {
    label: "mention security guard: an id that fails the post feature's own SLUG_FORMAT_PATTERN (path traversal attempt) renders nothing rather than an unsafe/malformed href — backfilled 2026-08-12",
    types: ["mention"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "../admin", label: "Evil" } }] }] },
    html: "<p></p>",
  },
  {
    label: "mention with no label renders nothing (a link with no text is not a usable link) — backfilled 2026-08-12",
    types: ["mention"],
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "hello-world" } }] }] },
    html: "<p></p>",
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
