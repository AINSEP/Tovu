# 03 (revision 2 — read `## Revision 2` first; it overrides §2-§6 where they differ) — Tovu `apps/website/src/server/inbound/public-http/http/site/render.ts`

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

After each move run `node `npm run check:architecture` (development/scripts/check-architecture.ts)`. If a file placed under `features/` or `platform/` would need an import from `server/**`, do **not** add a baseline entry: move the type it needs down with it if that type is used only by render code (`MediaAssetRenderMeta` → `features/media/render-meta.ts`); otherwise leave the file under `http/site/render/<same sub-folder name>/` and list it in the report. The components stay under `http/site/render/components/` for exactly this reason (`SiteRenderContext` is declared in `http/site/render-context.ts`).

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


## Revision 2 (2026-11-16, after the Codex judgment)

Re-verified at Tovu `integ/wave-b-r2` (65302ee5): `render.ts` 3,683 lines, 237 functions, **no function over 50 code lines** (`work/function-sizes.cjs`). 50 files import it; the two render workers load it through `handlebars-render.ts` / `liquid-render.ts`. Judge: "needs rework" (6 majors, 2 minors). **8 accepted, 0 rebutted.**

### R1. Target tree changes (these override the §2 tree)

1. **Nothing moves to `features/`.** Every slice stays under `server/inbound/public-http/http/site/render/` (`doc/`, `widgets/`, `components/`); only the pure sanitizers go to `platform/html/`. Reason (verified): widget renderers call Tovu's entry-list renderer and layout policy (2327-2345), navigation (2357-2361) and media rendering (2617-2624); the doc renderer needs media asset resolution. In `features/` those are feature→feature imports. The earlier "Jini-ready, 1:1 later" claim is **withdrawn**; a Jini move is a separate design that first has to name ports for entry lists, navigation and media.
2. **Recursive doc renderer stays in one file.** `render/doc/doc-nodes.ts` = depth guard, `renderNodes`, `renderChildNodes` (996-1037), text handlers (1039-1162), inline handlers (1405-1497), handler lookup (1502-1522), `DOC_NODE_HANDLERS` (1524-1548, **23** entries), `renderDocNode` (1568-1595) ≈ 410 lines. The cycle `dispatcher → registry → handler → renderChildNodes → dispatcher` is real and is kept inside one module. `render/doc/nodes-media.ts` (1269-1403) stays separate: it does not recurse, `doc-nodes.ts` imports it one way. `handlers.ts`, `render-node.ts`, `nodes-text.ts`, `nodes-inline.ts` from §2 are **not** created.
3. **Widget → doc calls go through one injected port**, not imports:
   ```ts
   export interface WidgetDocRendering {
     renderDocBody: typeof renderDocBodyAsPageHtml;     // post content (2744, 2825)
     renderDocNode: typeof renderDocNode;               // legacy `src` gallery image (2600-2607)
     renderNodes: typeof renderNodes;                   // title children in extractTitleNode (2655-2668)
   }
   ```
   `render/content-html.ts` (the knot) builds it from the real functions and passes it to `widgets/media.ts` and `widgets/post-content.ts` as a required field. The members are the same functions with the same arguments, so defaults and the depth counter are unchanged. Fixtures for both paths are added (R3).
4. **Static-page helpers:** `removeThemeOwnTitleElement` (3310-3335) moves to `static-page-injection.ts` with `injectExtraHeadIntoStaticPage` (3214) and `isInsideHtmlComment` (3275). `document-shell.ts` imports it; nothing imports back.
5. **Host bindings stay host code:** `site-assistant-mount.ts` (3143-3186) reads `TOVU_SITE_CHAT_*`, resolves the app dist directory and checks the filesystem. It is Tovu wiring, not chat code, and is not a Jini candidate.
6. **`safeHref` has an existing canonical owner:** Jini `@jini-ai/cms/navigation` `isAllowedHref` (`packages/cms/src/navigation/menu-service.ts:199`). Tovu's `safeHref` (170) is a coercing wrapper (trim + fallback) kept in sync by `development/scripts/check-menu-href-allowlist-sync.ts`, which **reads `render.ts` by path** (lines 11, 29, 65-68). This design moves the wrapper verbatim to `platform/html/safe-url.ts` and updates that script's path in the same commit. Replacing the copy with a call to `isAllowedHref` is a behaviour-sensitive change (worker module budget, fallback semantics) and is routed to the owner as decision 03-a, not done here. The "flag for Jini" note in §6 is replaced by this.
7. **Exclusive allocation.** `ctaBand` 2135-2139 → `components/marketing.ts` only (`layout.ts` is 1658-1669, 2034-2041, 2104-2134, 2140-2168). 3673-3683 → `document-shell.ts` only (`render-site.ts` is 3392-3672). File count after R1: 2 in `platform/html` (one existing) + 8 `doc/` (marks, media-ref, html-attributes, media-tags, text-layout, doc-nodes, nodes-media, managed-markers) + 5 `widgets/` + 12 `render/` + `render-site.ts` = **28 files, 27 new**. Step 0b generates `work/render-symbols.tsv` (every top-level declaration → exactly one file) with a script that fails on a symbol assigned twice or not at all.

### R2. Migration graph (overrides §3)

Every commit: `npm run typecheck`, `npm run typecheck:tests`, `npm run check:boundaries` (`no-circular`), `npm run check:architecture`, the golden test, and `http/site/__tests__/worker-import-graph.test.ts`.

| # | commit | needs |
|---|---|---|
| 0a | golden corpus + determinism harness (R3); record today's worker module counts | — |
| 0b | symbol sheet + importer sheet (50 importing files; tools that read the path: `check-menu-href-allowlist-sync.ts`) | — |
| 1 | `platform/html/safe-url.ts`, `style-values.ts` additions; update the href sync script | 0 |
| 2 | leaf doc files with no recursion: `marks`, `media-ref`, `html-attributes`, `media-tags`, `text-layout`, `managed-markers`, `nodes-media` (one per commit) | 1 |
| 3 | `doc-nodes.ts` (one commit: the whole recursive group) | 2 |
| 4 | `static-page-injection.ts`, then `document-shell.ts` | 1 |
| 5 | `content-html.ts` with `WidgetDocRendering`; then widgets one per commit | 3 |
| 6 | components, page/post body, blocks, template data, assistant mount | 3-5 |
| 7 | `render-site.ts`; delete `render.ts`; repoint the 50 importers by symbol | 6 |

**Worker module budget (new risk).** `WORKER_MODULE_BUDGETS` allows 165 (`handlebars-worker.ts`) and 125 (`liquid-worker.ts`) loaded rendering modules. `render.ts` is one module today; after the split each worker loads every slice it reaches. Rule: `handlebars-render.ts` / `liquid-render.ts` import only the slice files they use; step 0a records the current counts and each commit reports the delta. If a count passes its budget only because one module became several (no new dependency), raising that budget number is a baseline edit that needs owner approval (decision 03-b) — the executor stops and reports, it does not edit the number.

### R3. Tests (overrides §4 where they differ)

- **Determinism:** the contact form emits `widget-contact-${randomUUID()}` (2456-2461) and the rich footer defaults to the current year (2166). The golden test pins the clock with `mock.timers.enable({ apis: ['Date'] })` (node:test) and replaces only `widget-contact-<uuid>` by an index before hashing. Two separate assertions keep what the replacement hides: inside one form every `for` / `aria-describedby` / `id` uses the same generated id; two forms on one page get different ids.
- **New fixtures:** legacy `src` gallery image (the `renderDocNode` callback), post title with inline marks (the `renderNodes` callback), nested lists/tables to the depth limit and one level past it (depth guard), a static page with a commented-out `<title>` (title removal must skip it).
- **Not proven by HTML hashes:** worker module graph (test above), href allowlist sync (script above). Both run per commit.

### R4. Owner practices check

| # | status |
|---|---|
| 1 DI | widget→doc through `WidgetDocRendering`; no slice imports the knot |
| 2 args | moved functions already use `(required, optional = {})`; unchanged |
| 3 size | no function over 50 lines today; largest new file `doc-nodes.ts` ≈410 |
| 4 slicing | by renderer family; the recursive group is one responsibility |
| 5 no re-exports | `render.ts` re-export lines 71-91 deleted, importers repointed by symbol |
| 6 comments | move with code |
| 7 boundaries | no feature→feature import created; canonical href owner recorded; host env binding stays in `server/` |
| 8 tests | golden corpus before any move; fakes of `SiteRenderContext` only |
| 9 errors | no text changed |
| 10 | no new disables; **possible baseline edit** (worker budget) is stop-and-ask |
| 11 | sanitizers reuse the existing `platform/html/style-values.ts` |
| 12 memory/IO | render is the hot path: no added pass over the document; module count per worker is the cost to watch (R2) |

### R5. Estimate

≈30 commits, Sonnet **≈560k tokens** (was 520k). Risk: **medium**.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | major | accepted | `renderChildNodes` (1029) → `renderNodes` (1007) → handler lookup (1508) → `DOC_NODE_HANDLERS` (1524) → text handlers → `renderChildNodes`. R1.2 keeps the group in one file |
| 2 | major | accepted | `renderDocNode(` at 2607 and `renderNodes(` at 2668 confirmed. R1.3 adds both to the port; fixtures in R3 |
| 3 | major | accepted | 3218/3220 call title removal; 3313 calls `isInsideHtmlComment` (3275). R1.4 |
| 4 | major | accepted | `isAllowedHref` at Jini `menu-service.ts:199`; the sync script names `render.ts` (lines 11, 65-68). R1.6 |
| 5 | major | accepted | `TOVU_SITE_CHAT` at 3181-3182; cross-feature calls at 2327-2361, 2617-2624. R1.1, R1.5 |
| 6 | major | accepted | `randomUUID(` at 2461, `getFullYear` at 2166. R3 |
| 7 | minor | accepted | Real command is `npm run check:architecture` (`package.json:60`); source reader and worker budgets added to every commit's gate (R2) |
| 8 | minor | accepted | 23 handler entries; overlaps removed; counts derived from the symbol sheet (R1.7) |

Accepted 8 · rebutted 0 · blockers left 0.
