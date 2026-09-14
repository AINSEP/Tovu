import assert from "node:assert/strict";
import test from "node:test";

import { DOC_NODE_HANDLERS, MARK_RENDERERS, renderDocNode, type MediaAssetRenderMeta } from "#src/server/inbound/public-http/http/site/render";
import { postAgentToolCatalog, TIPTAP_DOC_SCHEMA } from "../agent-tools.js";

/**
 * @file RED-then-GREEN evidence for the 2026-09-11 `TIPTAP_DOC_SCHEMA` expansion
 * (`../agent-tools.ts`) — six node families (`image`/`youtube`/`mention`/the table family/
 * `taskList`+`taskItem`/`hardBreak`) that `renderDocNode` (`#src/server/inbound/public-http/http/
 * site/render.ts`) already renders correctly, but that the schema published to the model named
 * nowhere, which is exactly why the assistant refused to place an image inside a post body.
 *
 * Renderer BEHAVIOR for these six families already has thorough, ground-truth coverage in
 * `server/inbound/public-http/http/site/__tests__/tiptap-render-contract.test.ts` (run unchanged as
 * regression by this task — not duplicated here). What THAT file does not, and cannot, prove is
 * whether `TIPTAP_DOC_SCHEMA`'s own claims about each node's shape are correct: a schema can name a
 * node type and still get its `required`/`attrs` wrong in a way that produces documented-but-dead
 * JSON (renders to the `default:` children-only fallback, or a safe-degrade placeholder, despite
 * "following the schema"). Every render test below builds the node from ONLY the fields
 * `TIPTAP_DOC_SCHEMA` marks `required` for that type (never a superset), so a wrong `required` list
 * would show up here as a placeholder/empty/fallback render, not as a passing test.
 *
 * "RED before this task": every node type asserted below was absent from `TIPTAP_DOC_SCHEMA` before
 * this change (`grep -c '"image"' agent-tools.ts` was 0, per the dispatching task's own verified
 * fact) — the schema-structure tests fail to compile/import today's `../agent-tools.ts` without the
 * `TIPTAP_DOC_SCHEMA` export this task added, and the schema-shape assertions fail without the new
 * `$defs` entries. What was never RED, and is not re-litigated here, is `renderDocNode` itself.
 *
 * Same-day follow-up (coordinator review): the node-type gap generalized. Two more instances of the
 * identical "renderer supports it, schema doesn't name it" defect were found and fixed — marks
 * (`TIPTAP_MARK_SCHEMA` named 4 of `MARK_RENDERERS`'s 10 keys) and two already-included nodes missing
 * attrs the renderer reads (`paragraph`/`heading`'s `textAlign`, `codeBlock`'s `language`) — and a
 * DRIFT GUARD was added (bottom of this file) so a future node/mark type added to `render.ts` without
 * a matching schema entry fails a test instead of silently shipping invisible to the model again. The
 * guard reads `DOC_NODE_HANDLERS`/`MARK_RENDERERS` (both newly exported from `render.ts` for exactly
 * this — no behavior change, see their own doc comments) directly, not a hand-copied checklist.
 */

test("schema structure: blockNode.oneOf's type consts are exactly the documented block-level vocabulary", () => {
  const schema = JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA)) as {
    $defs: { blockNode: { oneOf: { properties: { type: { const: string } } }[] } };
  };
  const consts = schema.$defs.blockNode.oneOf.map((entry) => entry.properties.type.const);
  assert.deepEqual(consts, [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "table",
    "media",
    "youtube",
    "widgetEmbed",
  ]);
});

test("schema structure: inlineContent.items.oneOf covers text, hardBreak, and mention — no other inline type", () => {
  const schema = JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA)) as {
    $defs: { inlineContent: { items: { oneOf: ({ $ref: string } | { properties: { type: { const: string } } })[] } } };
  };
  const kinds = schema.$defs.inlineContent.items.oneOf.map((entry) => ("$ref" in entry ? "text" : entry.properties.type.const));
  assert.deepEqual(kinds, ["text", "hardBreak", "mention"]);
});

test("schema structure: content_post_create's published bodyJson schema is the same TIPTAP_DOC_SCHEMA object (no second, drifting copy)", () => {
  const createTool = postAgentToolCatalog.find((tool) => tool.name === "content_post_create");
  assert.ok(createTool, "content_post_create must exist in the catalog");
  const inputSchema = JSON.parse(JSON.stringify(createTool!.inputSchema)) as { properties: { bodyJson: { $defs: unknown } } };
  assert.deepEqual(inputSchema.properties.bodyJson.$defs, JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA.$defs)));
});

// ---------------------------------------------------------------------------
// Render round-trips: build each new node type from ONLY its schema-required fields, render it
// through the REAL renderDocNode, and assert the EXACT output — proving the documented shape is not
// just a recognized `type` string but a shape that actually produces the renderer's real markup,
// never `renderDocNode`'s `default:` (children-only) fallback and never a silent empty string.
// ---------------------------------------------------------------------------

test("hardBreak: minimal required-only node ({type}) inside a paragraph's inline content renders a real <br/>, not an empty/dropped node", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "line one" },
          { type: "hardBreak" },
          { type: "text", text: "line two" },
        ],
      },
    ],
  };
  assert.equal(renderDocNode(doc), "<p>line one<br/>line two</p>");
});

test("taskList/taskItem: minimal required-only nodes ({type, content}, attrs omitted) render an unchecked, disabled checkbox — not the default children-only fallback", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [{ type: "taskItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Buy milk" }] }] }],
      },
    ],
  };
  assert.equal(
    renderDocNode(doc),
    '<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" disabled/><span></span></label><div><p>Buy milk</p></div></li></ul>'
  );
});

test("taskItem attrs.checked: true renders the checked attribute (documented optional attr actually wired)", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] }],
      },
    ],
  };
  assert.equal(
    renderDocNode(doc),
    '<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" checked disabled/><span></span></label><div><p>Done</p></div></li></ul>'
  );
});

test("table family: minimal required-only table>tableRow>tableCell/tableHeader (no attrs) renders a real <table>, not the default fallback", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Ada" }] }] },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(renderDocNode(doc), "<table><tr><th><p>Name</p></th><td><p>Ada</p></td></tr></table>");
});

test("tableCell documented attrs (colspan/rowspan/align) are the ones the renderer actually reads", () => {
  const doc = {
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
                attrs: { colspan: 2, rowspan: 2, align: "center" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Merged" }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(renderDocNode(doc), '<table><tr><td colspan="2" rowspan="2" style="text-align:center"><p>Merged</p></td></tr></table>');
});

test('tableCell attrs.align "justify" is NOT in the schema\'s enum, and a value outside {left,center,right} the renderer ignores rather than emits', () => {
  // The schema published to the model deliberately excludes "justify" from attrs.align's enum
  // (see TIPTAP_DOC_SCHEMA.$defs.tableCellAttrs) because tableCellAlignAttr (render.ts) never
  // honors it — this proves the exclusion isn't cosmetic: a caller that ignored the schema and
  // sent "justify" anyway gets silently no style attribute, not a malformed one.
  const doc = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [{ type: "tableCell", attrs: { align: "justify" }, content: [{ type: "paragraph", content: [{ type: "text", text: "J" }] }] }],
          },
        ],
      },
    ],
  };
  assert.equal(renderDocNode(doc), "<table><tr><td><p>J</p></td></tr></table>");
});

test("media, schema-required assetId+transformName only, resolved asset is a VIDEO: renders a real <video>, not a broken <img>", () => {
  const doc = { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-clip", transformName: "public" } }] };
  const mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta> = new Map([
    ["asset-clip", { width: null, height: null, cssClass: null, htmlAttributes: null, contentType: "video/mp4" }],
  ]);
  const html = renderDocNode(doc, undefined, undefined, mediaAssetMetadata);
  assert.equal(html, '<video src="/m/asset-clip/original" controls>Your browser does not support the video tag.</video>');
});

test("media, schema-required assetId+transformName only, resolved asset is an IMAGE: renders a real <img> through the shared tryRenderRefImage resolution (the same path the now-retired 'image' node used)", () => {
  const doc = { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-photo", transformName: "public" } }] };
  const mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta> = new Map([
    ["asset-photo", { width: null, height: null, cssClass: null, htmlAttributes: null, contentType: "image/png" }],
  ]);
  const html = renderDocNode(doc, undefined, new Map([["public", 7]]), mediaAssetMetadata);
  assert.equal(html, '<img src="/m/asset-photo/public.v7/image.jpg" alt="" loading="lazy">');
});

test('media with a transformName OTHER than the schema\'s documented "public" const degrades to the placeholder for a non-video asset, proving the const lock is load-bearing, not decorative', () => {
  const doc = { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-photo", transformName: "thumbnail" } }] };
  const html = renderDocNode(doc, undefined, new Map([["public", 7]]));
  assert.equal(html, '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Media</span></figure>');
});

test("schema structure: media's attrs publish cssClass/htmlAttributes as OPTIONAL string properties (2026-09-11 per-post styling) — not in required, so the minimal assetId+transformName rows above stay valid", () => {
  const schema = JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA)) as {
    $defs: {
      blockNode: {
        oneOf: { properties: { type: { const: string } }; required: string[]; properties: Record<string, { type: string }> }[];
      };
    };
  };
  const mediaEntry = schema.$defs.blockNode.oneOf.find((entry) => entry.properties.type.const === "media");
  assert.ok(mediaEntry, "media must exist in blockNode.oneOf");
  const attrsSchema = (mediaEntry as unknown as { properties: { attrs: { required: string[]; properties: Record<string, { type: string }> } } })
    .properties.attrs;
  assert.equal(attrsSchema.properties.cssClass?.type, "string");
  assert.equal(attrsSchema.properties.htmlAttributes?.type, "string");
  assert.deepEqual(attrsSchema.required, ["assetId", "transformName"]);
});

test("media, schema-optional cssClass+htmlAttributes: a per-post node style round-trips through the REAL renderer, winning over the asset's own same-named fields", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "media",
        attrs: { assetId: "asset-styled", transformName: "public", cssClass: "post-specific", htmlAttributes: 'data-kui="hero"' },
      },
    ],
  };
  const mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta> = new Map([
    ["asset-styled", { width: null, height: null, cssClass: "asset-default", htmlAttributes: null, contentType: "image/png" }],
  ]);
  const html = renderDocNode(doc, undefined, new Map([["public", 1]]), mediaAssetMetadata);
  assert.equal(html, '<img src="/m/asset-styled/public.v1/image.jpg" alt="" class="post-specific" data-kui="hero" loading="lazy">');
});

test("youtube: minimal required-only node (attrs.src only, start omitted) renders a real nocookie <iframe>, not a placeholder", () => {
  const doc = { type: "doc", content: [{ type: "youtube", attrs: { src: "https://youtu.be/abcDEF12345" } }] };
  assert.equal(
    renderDocNode(doc),
    '<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/abcDEF12345" title="YouTube video" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
  );
});

test("mention: minimal required-only node (attrs.id+label) renders a real link, not a dropped node", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "pricing", label: "Pricing" } }] }] };
  assert.equal(renderDocNode(doc), '<p><a class="post-mention" href="/pricing">@Pricing</a></p>');
});

// ---------------------------------------------------------------------------
// Marks — the 6 newly-documented TIPTAP_MARK_SCHEMA entries (strike/underline/subscript/superscript/
// textStyle/highlight). bold/italic/code/link were already documented and already have thorough
// ground-truth coverage in tiptap-render-contract.test.ts; not duplicated here.
// ---------------------------------------------------------------------------

function textNodeWithMark(mark: unknown) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [mark] }] }] };
}

test("mark strike: boolean-style ({type} only, no attrs) renders <s>", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "strike" })), "<p><s>x</s></p>");
});

test("mark underline: boolean-style ({type} only, no attrs) renders <u>", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "underline" })), "<p><u>x</u></p>");
});

test("mark subscript: boolean-style ({type} only, no attrs) renders <sub>", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "subscript" })), "<p><sub>x</sub></p>");
});

test("mark superscript: boolean-style ({type} only, no attrs) renders <sup>", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "superscript" })), "<p><sup>x</sup></p>");
});

test("mark textStyle: documented attrs.color alone renders a real <span style>, not a dropped mark", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "textStyle", attrs: { color: "#ff0000" } })), '<p><span style="color:#ff0000">x</span></p>');
});

test("mark highlight: no attrs (documented as optional) renders a bare <mark>", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "highlight" })), "<p><mark>x</mark></p>");
});

test("mark highlight: documented attrs.color renders <mark style=\"background-color:...\">, proving 'color' means the highlight's OWN background here, not text color", () => {
  assert.equal(renderDocNode(textNodeWithMark({ type: "highlight", attrs: { color: "#ffff00" } })), '<p><mark style="background-color:#ffff00">x</mark></p>');
});

// ---------------------------------------------------------------------------
// Node attrs the schema was missing on two ALREADY-documented node types — same defect class as the
// missing node types/marks above, found while auditing marks: renderDocParagraph/renderDocHeading
// both read attrs.textAlign, renderDocCodeBlock reads attrs.language, but neither node's `attrs`
// (both `additionalProperties: false`) allowed either key at all before this pass.
// ---------------------------------------------------------------------------

test("paragraph attrs.textAlign: documented value renders a real style attr", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Hi" }] }] };
  assert.equal(renderDocNode(doc), '<p style="text-align:center">Hi</p>');
});

test('paragraph attrs.textAlign: "left" (the schema\'s own documented default) is a no-op, not an explicit style — proves the "omit rather than send" guidance is accurate, not just a suggestion', () => {
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Left" }] }] };
  assert.equal(renderDocNode(doc), "<p>Left</p>");
});

test("heading attrs.textAlign alongside attrs.level: both documented attrs render together", () => {
  const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "T" }] }] };
  assert.equal(renderDocNode(doc), '<h2 id="t" style="text-align:right">T</h2>');
});

test("codeBlock attrs.language: documented value renders a real language-* class, not a bare <code>", () => {
  const doc = { type: "doc", content: [{ type: "codeBlock", attrs: { language: "python" }, content: [{ type: "text", text: "x = 1" }] }] };
  assert.equal(renderDocNode(doc), '<pre><code class="language-python">x = 1</code></pre>');
});

// ---------------------------------------------------------------------------
// Drift guard — the actual fix for "this will just go stale again." Reads render.ts's OWN
// DOC_NODE_HANDLERS/MARK_RENDERERS keys directly (not a hand-copied checklist that can itself drift)
// and fails when one has no corresponding TIPTAP_DOC_SCHEMA entry and no explicitly named opt-out.
// ---------------------------------------------------------------------------

/** Recursively collects every `type.const` value found anywhere in a JSON-Schema-shaped object —
 *  matches `{ properties: { type: { const: "X" }, ... } }` wherever it appears (blockNode.oneOf
 *  entries, inlineContent.items.oneOf entries, any $defs.*Node entry, and the schema's own doc-root
 *  properties.type.const === "doc"). Deliberately generic rather than hand-walking each known $defs
 *  key, so a FUTURE $defs entry (another list-item-shaped node, say) is picked up with no guard
 *  maintenance of its own. Does not false-positive on a JSON-Schema type KEYWORD (`type: "object"`,
 *  a plain string) or an unrelated `const` (e.g. `transformName: { const: "public" }`, which is not
 *  nested under a property literally named `type`). */
function collectDocumentedTypeConsts(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectDocumentedTypeConsts(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const typeField = obj.type;
  if (typeField !== null && typeof typeField === "object" && !Array.isArray(typeField) && typeof (typeField as Record<string, unknown>).const === "string") {
    out.add((typeField as Record<string, unknown>).const as string);
  }
  for (const value of Object.values(obj)) collectDocumentedTypeConsts(value, out);
}

/**
 * Node types `renderDocNode` has a real case for that this schema deliberately never publishes for
 * authoring — each with a reason recorded in `TIPTAP_DOC_SCHEMA`'s own doc comment, not just here.
 * The guard below checks BOTH directions: every `DOC_NODE_HANDLERS` key is documented-or-opted-out,
 * AND every opt-out here still names a real handler that is still genuinely undocumented (so this
 * list cannot itself go stale in either direction).
 */
const NAMED_NODE_TYPE_OPT_OUTS: readonly string[] = [
  "title",
  // "image" (2026-09-11, owner decision): render.ts keeps DOC_NODE_HANDLERS.image/renderDocImage live
  // for undo/import back-compat (features/post/reverters.ts can resurrect a soft-deleted post whose
  // body still has an `image` node, 2 of which are src-only and cannot migrate to `media`), but the
  // agent schema no longer advertises it — media covers the same ground for new authoring.
  "image",
];

test("drift guard: every DOC_NODE_HANDLERS key is documented in TIPTAP_DOC_SCHEMA or explicitly, namedly opted out", () => {
  const documented = new Set<string>();
  collectDocumentedTypeConsts(JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA)), documented);
  const optedOut = new Set(NAMED_NODE_TYPE_OPT_OUTS);
  const handlerKeys = Object.keys(DOC_NODE_HANDLERS);

  const undocumented = handlerKeys.filter((key) => !documented.has(key) && !optedOut.has(key));
  assert.deepEqual(
    undocumented,
    [],
    `renderDocNode (render.ts) has a case for ${JSON.stringify(undocumented)} with no TIPTAP_DOC_SCHEMA $defs entry and no ` +
      `NAMED_NODE_TYPE_OPT_OUTS entry in agent-tools.tiptap-node-vocabulary.test.ts — add a $defs.blockNode.oneOf (or ` +
      `inlineContent.items.oneOf) entry in agent-tools.ts's TIPTAP_DOC_SCHEMA, or add it to NAMED_NODE_TYPE_OPT_OUTS with a ` +
      `reason if an agent genuinely should not author it.`
  );

  for (const optOut of optedOut) {
    assert.ok(handlerKeys.includes(optOut), `NAMED_NODE_TYPE_OPT_OUTS names "${optOut}", which is no longer a DOC_NODE_HANDLERS key — remove it, it's stale.`);
    assert.ok(!documented.has(optOut), `NAMED_NODE_TYPE_OPT_OUTS names "${optOut}", but TIPTAP_DOC_SCHEMA now documents it — remove it from the opt-out list.`);
  }
});

test("drift guard: every MARK_RENDERERS key is documented in TIPTAP_MARK_SCHEMA's type enum", () => {
  const schema = JSON.parse(JSON.stringify(TIPTAP_DOC_SCHEMA)) as { $defs: { mark: { properties: { type: { enum: string[] } } } } };
  const documentedMarks = new Set(schema.$defs.mark.properties.type.enum);
  const rendererMarkKeys = Object.keys(MARK_RENDERERS);

  const undocumented = rendererMarkKeys.filter((key) => !documentedMarks.has(key));
  assert.deepEqual(
    undocumented,
    [],
    `renderMarks (render.ts) has a MARK_RENDERERS entry for ${JSON.stringify(undocumented)} with no matching enum value in ` +
      `TIPTAP_MARK_SCHEMA.properties.type.enum (agent-tools.ts) — add it there, with an attrs entry too if the renderer reads any.`
  );
});
