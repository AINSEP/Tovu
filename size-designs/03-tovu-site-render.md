# 03 — Tovu `apps/website/src/server/inbound/public-http/http/site/render.ts`

Measured at `origin/integ/wave-b-fixed`: 3,683 lines (1,645 code; 55% comments). Path in the brief lacked `inbound/`.
No function is over 50 lines (largest: `renderWidgetContactForm` 39, `pageShell` 34). **This is a file-level problem only**: ~190 small functions from seven unrelated concerns in one module, plus a re-export block (71-91) that the "no re-export shells" rule forbids.

## 1. Current shape

| lines | concern | owner it really belongs to |
|---|---|---|
| 71-91 | re-exports of `render-context.ts` types and 8 `form-render.ts` names | nobody — delete, repoint callers |
| 113-396 | value sanitizers: `safeHref`, `safeImageSrc` (+3 helpers), `safeCssColor/FontFamily/Length`, `safeLanguageClass`, `extractYoutubeVideoId` | `platform/html` (already has `style-values.ts`, `escape.ts`) |
| 412-479 | mark renderers + `MARK_RENDERERS` | post body (doc → HTML) |
| 482-832 | media-ref plausibility, HTML-attribute merge helpers, `renderImageTag`, `renderVideoTag` | post body |
| 840-961 | node text, heading anchor ids, align/table-span attributes | post body |
| 996-1645 | doc node renderer: depth guard, `renderNodes`, 25 node handlers, `DOC_NODE_HANDLERS`, `renderDocNode`, managed-marker swap, `renderDocBodyAsPageHtml` | post body |
| 1658-1735, 2034-2221 | declarative-theme components (`siteHeader`, `entryList`, `hero`, `siteNav`, `section`, …) + `COMPONENTS` | theme (needs `SiteRenderContext`) |
| 1740-2023 | page/post body assembly: `renderHtmlPageBody`, embed occurrence decorators, `renderAssignedTermsBlock`, `renderPostBody`, `entryContent` | site render |
| 2241-2888 | widget IR → HTML: social links, recent entries, menu, contact form, media/gallery, post content, `WIDGET_IR_RENDERERS`, `renderWidgetIr`, `renderWidgetRegion` | widgets (`features/widgets/media-html.ts` already exists) |
| 2920-3027 | template data: `buildTemplateRenderData`, `featuredImageView`, product shape | site render |
| 3041-3116 | block/slot/region rendering | site render |
| 3122-3382 | document shell: base CSS, tokens, site-assistant mount, static-page injection, `pageShell` | site render |
| 3392-3683 | `RenderSiteRequired` (107 lines) + tier selection + `renderSite` | site render (root) |

**The one real design problem — a recursion knot.** The doc handler `renderDocWidgetEmbed` (1459) calls `renderWidgetIr`; the widget renderer `renderWidgetPostContent` (2793) calls the doc renderer. In one file that is invisible; split naively it is an import cycle between `doc` and `widgets`.

## 2. Target shape

```
platform/html/
  safe-url.ts                       safeHref, safeImageSrc, parseImageSrc, isPublicImageUrl, isPlainRelativeImageSrc,
                                    extractYoutubeVideoId (133-294, 389-396)                                   ~190
  style-values.ts  (existing, +)    safeCssColor, safeCssFontFamily, safeCssLength, safeLanguageClass (313-370) +70

features/post/doc-html/             the TipTap-doc → HTML renderer; imports only core, cms types, platform/html, features/media
  marks.ts                          412-479  MARK_RENDERERS, renderMarks                                        ~80
  media-ref.ts                      482-521, 1168-1242  ref-id plausibility, asset override resolution           ~130
  html-attributes.ts                565-709  embed attribute parse/merge/format                                  ~150
  media-tags.ts                     713-832  renderImageTag, renderVideoTag                                      ~130
  text-layout.ts                    840-961  nodeText, heading ids, align + table span attrs                     ~130
  render-node.ts                    996-1037, 1502-1522, 1568-1595  depth guard, renderNodes, DocNodeRenderDeps,
                                    handler lookup, renderDocNodeWith                                            ~140
  nodes-text.ts                     1039-1162  paragraph … hardBreak, lists, table, code block                   ~130
  nodes-media.ts                    1269-1403  image, media, media player, youtube                               ~150
  nodes-inline.ts                   1405-1497  mention, widget embed (calls deps.renderWidget)                   ~100
  handlers.ts                       1524-1548  DOC_NODE_HANDLERS                                                 ~40
  managed-markers.ts                1599-1631  marker swap                                                       ~50

features/widgets/html/              widget IR → HTML, one renderer family per file
  social-entries.ts                 2243-2346                                                                   ~110
  menu.ts                           2351-2416                                                                   ~70
  media.ts                          2539-2625                                                                   ~100
  post-content.ts                   2655-2827  title node, metadata readers, post header, post content
                                    (takes renderDocBody as an argument)                                         ~180
  placeholder.ts                    2241, 2504-2506                                                              ~20

server/inbound/public-http/http/site/
  render-site.ts                    3392-3683  RenderSiteRequired, tier bodies, renderSite (composition root)    ~300
  render/
    content-html.ts                 THE KNOT (below): renderDocNode, renderDocBodyAsPageHtml,
                                    WIDGET_IR_RENDERERS, renderWidgetIr, renderWidgetRegion                      ~110
    contact-form-widget.ts          2420-2500 (stays: depends on ./form-render.ts)                               ~90
    page-body.ts                    1740-1935  renderHtmlPageBody + occurrence decorators                        ~200
    post-body.ts                    1954-2023  assigned terms, renderPostBody, entryContent                      ~80
    components/
      layout.ts                     1658-1669, 2034-2041, 2104-2168  header, footer, nav, rich footer            ~110
      entry-lists.ts                1671-1735                                                                    ~70
      marketing.ts                  2045-2101, 2135-2139, 2170-2205  hero, announcement, CTA, section, features  ~130
      registry.ts                   2208-2221  COMPONENTS                                                        ~30
    blocks.ts                       3041-3116                                                                    ~90
    template-render-data.ts         2920-3027                                                                    ~120
    document-shell.ts               3122-3136, 3310-3382, 3673-3683  base CSS, tokens, pageShell, finishers       ~150
    static-page-injection.ts        3214-3285                                                                    ~110
    site-assistant-mount.ts         3143-3186                                                                    ~60
```

28 files, largest 300. `render.ts` is deleted. Dependency direction: `render-site → render/* → features/{post/doc-html, widgets/html, theme} → platform/html`; nothing in `features/` imports `server/`.

### The knot

```ts
// features/post/doc-html/render-node.ts — no widget import
export interface DocNodeRenderDeps { inlineResolved; mediaTransformVersions; mediaAssetMetadata; depth;
  readonly renderWidget: (ir: WidgetRenderIR) => string }      // NEW port, required
export function renderDocNodeWith({ node, renderWidget }: { node: JsonValue; renderWidget: … }, options: DocRenderOptions = {}): string

// features/widgets/html/post-content.ts — no doc import
export function renderWidgetPostContent({ props, renderDocBody }: { props: JsonObject; renderDocBody: (doc: JsonValue, o: DocRenderOptions) => string }, _options = {}): string

// server/…/render/content-html.ts — the only module that imports both sides
export function renderWidgetIr(ir: WidgetRenderIR): string            // unchanged public signature
export function renderDocNode({ node }, options = {}): string         // unchanged public signature
//   renderDocNode → renderDocNodeWith({ node, renderWidget: renderWidgetIr }, options)
//   WIDGET_IR_RENDERERS.postContent → renderWidgetPostContent({ props, renderDocBody: renderDocNode… })
```

Both are hoisted function declarations in one module, so the mutual recursion is the same call graph as today. Public names and signatures of `renderDocNode`, `renderWidgetIr`, `renderWidgetRegion`, `DOC_NODE_HANDLERS`, `MARK_RENDERERS`, `COMPONENTS`, `pageShell`, `renderSite` do not change; only their import path does.

### Placement rule (deterministic, for the executor)

After each move run `node development/scripts/check-architecture.mjs`. If a file placed under `features/` or `platform/` would need an import from `server/**`, do **not** add a baseline entry: move the type it needs down with it if that type is used only by render code (`MediaAssetRenderMeta` → `features/media/render-meta.ts`); otherwise leave the file under `http/site/render/<same sub-folder name>/` and list it in the report. The components stay under `http/site/render/components/` for exactly this reason (`SiteRenderContext` is declared in `http/site/render-context.ts`).

## 3. Step order

0. **Golden corpus (no source change)**: `http/site/__tests__/render.golden.characterization.test.ts` — sha1 of the output of (a) `renderDocNode` over one fixture doc per node type and per mark, incl. depth-limit, widget embed with/without class+attributes, ref image with overrides; (b) `renderWidgetIr` per `componentId` incl. unknown id; (c) each `COMPONENTS` entry; (d) `pageShell` and `renderSite` once per tier (static, liquid, handlebars, declarative, fallback); (e) the two `inject*IntoStaticPage` functions incl. the commented-tag case. Hashes committed. Fixtures are plain objects/fakes of `SiteRenderContext`; no DB.
1. Delete the re-export block: repoint the callers that import `SiteRenderContext`/`SiteProduct`/`MediaAssetRenderMeta` or the `form-render` names through `render.ts` to the defining module (13 production importers, 36 tests — codemod by symbol).
2. Sanitizers → `platform/html` (leaf, no dependencies).
3. `features/post/doc-html/*` bottom-up: `html-attributes` → `media-ref` → `media-tags` → `marks` → `text-layout` → `nodes-text` → `nodes-media` → `render-node` (introduce `renderDocNodeWith` + the `renderWidget` port here; `render.ts` keeps `renderDocNode` as the binding function) → `nodes-inline` → `handlers` → `managed-markers`.
4. `features/widgets/html/*`; `post-content.ts` takes `renderDocBody`.
5. Create `render/content-html.ts` from what is left of the doc/widget code in `render.ts`.
6. `render/components/*`, `blocks.ts`, `page-body.ts`, `post-body.ts`, `template-render-data.ts`.
7. Shell files; then `git mv render.ts render-site.ts`; repoint remaining importers; remove the `render.ts` file entry from `size-debt.json`.

One commit per new file. Gate per commit: `tsc`, golden test, the 36 importing test files, `check-architecture`.

## 4. Tests

Existing: 36 test files import `render.ts` (they pin most node/widget output); one test reads `render.ts` as text — repoint its path, keep its assertions. New: golden corpus (step 0); `doc-html/render-node.test.ts` with a fake `renderWidget` proving the port is called with the resolved IR and the placeholder IR; `widgets/html/post-content.test.ts` with a fake `renderDocBody`. Test count may only grow.

## 5. Risks

| risk | de-risk |
|---|---|
| import cycle doc ↔ widgets | the knot module + two ports; `eslint import/no-cycle` on the new folders |
| module-level tables (`DOC_NODE_HANDLERS`, `WIDGET_IR_RENDERERS`, `COMPONENTS`) evaluated before their functions exist | tables only reference functions declared in imported leaf modules; the knot's table references local hoisted functions |
| HTML drift from a "harmless" helper dedupe (`str`/`arr`/`obj`, two `isObject`s) | move-only; no dedupe in this pass; golden hashes |
| security comments on the sanitizers (133-396 is 60% comment) left behind | each sanitizer moves with its whole leading block; reviewer checks `--color-moved` |
| feature → server edge | placement rule above |

## 6. Interaction with planned work

- `CLASSIFY-files.tsv`: `render.ts` is MIXED. Generic and Jini-bound (flag, do not move here): `features/post/doc-html/*` + `platform/html/safe-url.ts` → `@jini-ai/cms` (doc → HTML has no Tovu vocabulary); `features/widgets/html/*` → `@jini-ai/cms/widgets/html` (already owns `gallery-render`, `html-embeds`); `site-assistant-mount.ts` goes with `site-chat-markup.ts` → `@jini-ai/chat`. The folders above are cut so each later move is a 1:1 file move: they import only `@jini-ai/core`, `@jini-ai/cms` types and `platform/html`.
- `bare-page.ts`, `page-head.ts`, `form-validation-message.ts` (same folder) have their own MOVE rows; not touched.
- No untangle lane touches this file. Independent of designs 01/02; **must land before design 04** (pages.ts imports ~20 names from it).

## 7. Estimate

≈30 commits, move-only. Sonnet executor **≈520k tokens** (golden corpus 70k; 28 files × 13k; importer codemods 60k; final rename + debt 25k). Risk: **medium** (pure functions, strong golden pin; the only design risk is the knot).
