# size-03 render.ts split — cloud run report (2026-11-16) — PARTIAL

> Status: **completed in Run 2** (same day) — see the `Run 2` section at the end of this file. The text below is the Run 1 report as written.

Branch `refactor/size-03-render` (from `origin/refactor/terra`; Jini `origin/refactor/terra` linked). Design: `size-designs/03-tovu-site-render.md` rev 2.
`render.ts`: 3,683 → 2,087 lines. 18 commits, all pushed, each compiled and passed its gate alone.

## Commits (oldest first)
| SHA | step | what |
|---|---|---|
| 81ec80d1 | 0a | golden characterization test (133 sha1 pins) |
| 504e01ac | 1 | `platform/html/safe-url.ts` (+ `style-values.ts` additions); href-sync script + its test repointed |
| a15cf5a6 | 2 | `render/doc/html-attributes.ts` |
| dc8f33d8 | 2 | `render/doc/media-tags.ts` (+ re-keyed `.dependency-cruiser.mjs` reviewed pair) |
| dcd08685 | 4 | `render/site-assistant-mount.ts` |
| 90fded6d | 4 | `render/static-page-injection.ts` (5 importers repointed) |
| 9a7454b7 | 4 | `render/document-shell.ts` (3 importers repointed) |
| 5d17fcb3 | 2 | `render/value-readers.ts` (see D1) |
| d4d5df3e | 2 | `render/doc/marks.ts` |
| 4f3d0e89 | 2 | `render/doc/text-layout.ts` |
| 07d46b1d | 5 | `render/widgets/placeholder.ts` |
| e5acbdb1 | 5 | `render/widgets/social-entries.ts` |
| b92d810a | 5 | `render/widgets/menu.ts` |
| f8d5e276 | 5 | `render/contact-form-widget.ts` |
| dab45116 | 6 | `render/media-placeholder.ts` (see D2) |
| a5677e4d | 6 | `render/components/marketing.ts` |
| f7b57ae5 | 6 | `render/components/layout.ts` |
| 3fb2d779 | 2 | `render/doc/media-ref.ts` (pure half only, see D4) |

Moves are verbatim (done by a script that extracts top-level declarations with their attached comments; imports derived from references). No new `eslint-disable` / `@ts-ignore`; no barrels or forwarders; every importer repointed by symbol in the same commit.

## Pins (step 0a)
`http/site/__tests__/render.golden.characterization.test.ts`: renderDocNode per node type (all 23 handlers + variants) and per mark, depth limit (198/199/230 levels, lists), `renderDocBodyAsPageHtml` managed markers, legacy-`src` gallery image (the `renderDocNode` callback) and post title with marks (the `renderNodes` callback), `renderWidgetIr` per componentId + unknown id, every `COMPONENTS` entry, `pageShell` x5, `renderSite` per tier (fallback x4, static x2, liquid, handlebars x2, declarative x2), both static-page injectors incl. commented `<title>` / `</head>` / `</body>`. Date pinned with `mock.timers`; `widget-contact-<uuid>` normalised to an ordinal, with two extra assertions (one id per form, different id per form). Deterministic over two runs.
Shown able to fail (each mutation applied to `render.ts`, failed, then reverted): underline mark `<u>`→`<ins>`; comment-skip removed from title removal; contact id made constant; depth limit 200→201; legacy gallery image callback drops `alt`; post-title `renderNodes` marks dropped.

## Gates (every commit): `tsc -p tsconfig.json`, golden + 7 render test files (416 tests, 0 fail). Per milestone (and at the end):
- Importer test set (69 files, 1135 tests): baseline 1127 pass / 8 fail; final 1127 pass / 8 fail, **identical failing set** (all pre-existing: href-sync x3, render-form-layout browser x3, two transfer-catalog tests).
- `typecheck:tests` 0 errors; root `tsc` 0 errors. `check:boundaries` 111 violations / 16 errors = baseline (one `.dependency-cruiser.mjs` reviewed pair re-keyed for `media-tags.ts`, same edge). `check:size`, `check:complexity` output identical to baseline (both already have unrelated drift). `check:architecture` was already FAILED at baseline; numbers slightly better. ESLint clean on all new files; only `render.ts` still exceeds 500 lines (its `size-debt.json` entry stays).

## Worker module budget (decision 03-b — needs the owner)
Each new slice file is one more module in both render workers: **+17 modules** each for `handlebars-worker.ts` (275→292) and `liquid-worker.ts` (232→249), measured with a copy of the test's loader. In this environment the budget numbers cannot be checked directly: `worker-import-graph.test.ts` already fails 4 tests on the unmodified tree (linked Jini `cms/dist/core/*.js` import the `@jini-ai/core` root; same 4 failures before and after) and the raw counts are inflated by the linked Jini. On the numbers recorded in that test (161 / 119 at the last measurement, budgets 165 / 125) +17 would exceed both budgets. **I did not edit the budget numbers.** Decide 03-b before merging this branch; further splitting adds more modules.

## Deviations / design gaps found (steps stopped, not improvised)
- **Blocker — step 3 (`doc-nodes.ts`) and everything after it.** The design breaks the widget→doc direction with `WidgetDocRendering` but says nothing about doc→widget: `renderDocWidgetEmbed` (in the recursive group `doc-nodes.ts`) calls `renderWidgetIr`, which lives in the knot `content-html.ts`, which imports `doc-nodes.ts` for `renderDocNode`/`renderNodes` → `doc-nodes` ↔ `content-html` cycle (`no-circular` counts type-only edges too). Revision 1's `renderWidget` field on `DocNodeRenderDeps` would close it; rev 2 dropped it. Needs a design decision (suggest: re-add `renderWidget` to the doc deps, bound by `content-html.ts`).
- Blocked by that: `doc-nodes.ts`, rest of `doc/media-ref.ts`, `doc/nodes-media.ts`, `doc/managed-markers.ts` (needs `MAX_RENDER_DEPTH`), `widgets/media.ts` (legacy-image callback), `widgets/post-content.ts` (`extractTitleNode`/`EMPTY_*`), `content-html.ts`, `page-body.ts`, `post-body.ts`, `entry-lists.ts` and `template-render-data.ts` (`renderPostBody`), `blocks.ts`, `registry.ts`, `render-site.ts`, deletion of `render.ts`, the 50-importer repoint and removing the `size-debt.json` entry.
- D1 — `isObject`, `str`, `arr`, `obj` have no owner in the design's symbol sheet; moved together to `render/value-readers.ts` (dependency-free leaf) so the leaf steps could proceed.
- D2 — `mediaPlaceholder` (used by doc image nodes and marketing components) likewise → `render/media-placeholder.ts`.
- D3 — still unassigned and left in `render.ts`: `shortDate`, `EMPTY_INLINE_RESOLVED` / `EMPTY_MEDIA_TRANSFORM_VERSIONS` / `EMPTY_MEDIA_ASSET_METADATA` / `EMPTY_ASSIGNED_TERMS`, `MAX_RENDER_DEPTH`, `type Component`, `HTML_EMBED_PLACEHOLDER_IR`, `RENDER_CTX_KEY`.
- D4 — `media-ref.ts` is only the pure half (ids plausibility); `tryRenderRefImage`/`resolveMediaAssetOverrides` take `DocNodeRenderDeps`, a type of the recursive group. Same for `nodes-media.ts` (`DocNodeHandlerRequired`).
- D5 — `finishManagedDocument` stays with `renderSite` (it takes `RenderSiteRequired`; in `document-shell.ts` it would make a type cycle with `render-site.ts`). `shellThemeAssets` moved.
- D6 — `contact-form-widget.ts` is in `render/` (rev 1 tree), not `render/widgets/`, per R1.7's count of 5 widget files.
- D7 — Path-keyed items: `check-menu-href-allowlist-sync.ts` and its test now read `platform/html/safe-url.ts`; they were already failing before (they call `safeHref(string)` but the function takes `{ value }`) — unchanged, not fixed here. `.dependency-cruiser.mjs` REVIEWED_IMPORT_PAIRS got one re-keyed entry (`media-tags.ts` → `features/media/public-path.ts`); the `render.ts` entry must stay until `render.ts` stops importing it, and the other newly created files raised no new boundary errors.
- The re-export block (render.ts 71-91) is untouched: its deletion belongs with the importer repoint (step 7).
- Decision 03-a (`safeHref` → Jini `isAllowedHref`) not touched.

## Next step
Resolve the doc→widget direction (see Blocker), then step 3: `render/doc/doc-nodes.ts` (the whole recursive group in one commit), followed by the rest of `media-ref`, `nodes-media`, `managed-markers`, then `content-html.ts` with `WidgetDocRendering`, `widgets/media.ts` + `widgets/post-content.ts`, `entry-lists`, `template-render-data`, `page-body`, `post-body`, `blocks`, `registry`, `render-site.ts`, deletion of `render.ts` and the importer repoint. Importer sheet: `cloud-results/size-03-render-importers.tsv` (99 import sites in 93 files, includes comment mentions).

---

# Run 2 (2026-11-16, cloud) — COMPLETE: `render.ts` is deleted

Everything above this line is the Run 1 report (only the status note under its title was added). Run 2 continued from step 3 to the end of design 03.
`render.ts` (2,087 lines after Run 1) no longer exists. Its last 346 lines are `render-site.ts`; the rest is in the 29 files under `render/` (16 from Run 1, 13 new) (largest: `doc/doc-nodes.ts`, 401 lines). 21 commits, all pushed, each compiled and passed the golden pins and render tests alone.

## Merge (step 0)
`904ae0b8` — `git merge --no-ff origin/fix/wave-b-r3-web`. One conflict, in `render.ts` imports. Both intents kept: `render.ts` keeps this branch's imports (the contact-form code had already moved out), and wave-b-r3's fix (`renderFormCollection` from the `@jini-ai/cms/forms/html-render` leaf, not the forms barrel) is applied in `render/contact-form-widget.ts`, where that import now lives. The theme-resources split needed no change here. Golden pins and render tests passed on the merge commit.

## Cycle decision (the Run 1 blocker)
There were two directions to break, and one type-only cycle. All three are closed by dependency injection; no module imports the composition module `render/content-html.ts`.

1. **doc → widget (`9dc26705`).** `DocNodeRenderDeps` gets a required field `renderWidget: (ir: WidgetRenderIR) => string` (revision 1's shape). The dispatcher is `renderDocNodeWith({ node, renderWidget }, options)` in `doc/doc-nodes.ts`; `renderNodes` takes the same field and threads it down; `renderDocWidgetEmbed` calls `deps.renderWidget(...)`. The public `renderDocNode({ node }, options)` keeps its name and signature. It lives in `content-html.ts` and is the one binding: `renderDocNodeWith({ node, renderWidget: renderWidgetIr }, options)`. `doc-nodes.ts` imports nothing from `content-html.ts`.
2. **widget → doc (`3be31c80`).** `WidgetDocRendering { renderDocNode, renderNodes }` is built once in `content-html.ts` (`WIDGET_DOC_RENDERING`) and passed as a required `docRendering` field to `renderMediaWidget` (legacy `src` gallery image) and `renderWidgetPostContent` (body and title node). Both members have the widget renderer already bound, so depth and defaults are unchanged.
3. **Type-only edges (`23692089`).** `doc-nodes.ts` imports the media handlers, and those take `DocNodeHandlerRequired` / `DocNodeRenderDeps`. Declared in `doc-nodes.ts` that would be a type-only cycle, which `no-circular` counts. The contract types (`DocNodeRenderDeps`, `DocNodeHandlerRequired`, `DocNodeHandler`, `DocRenderOptions`, `WidgetDocRendering`) are in one types-only leaf, `render/doc/doc-render-contract.ts`. It is erased at runtime (no extra worker module).

Each port change was made in place first (its own commit, golden pins unchanged), then the files moved verbatim. New test `__tests__/render-doc-widget-port.unit.test.ts` (4 tests): the port receives the resolved IR, the placeholder IR, is reached through nested nodes, and `renderDocNode` binds the real widget renderer.

## Owners for D3's leftovers (by who uses them)
| symbol | owner | why |
|---|---|---|
| `shortDate` | `render/post-body.ts` | `entryContent` uses it; its other users (`entry-lists`, `template-render-data`) already depend on this file |
| `EMPTY_INLINE_RESOLVED`, `EMPTY_MEDIA_TRANSFORM_VERSIONS`, `EMPTY_MEDIA_ASSET_METADATA` | `render/doc/doc-nodes.ts` | they are the defaults of `renderDocNodeWith`'s options; `post-content.ts` and `render-site.ts` import them from there |
| `EMPTY_ASSIGNED_TERMS` | `render-site.ts` | only `buildSiteRenderContext` uses it |
| `MAX_RENDER_DEPTH` | `render/doc/doc-nodes.ts` | the depth guard is there; `managed-markers.ts` imports it one way |
| `type Component` | `render/components/registry.ts` | only `COMPONENTS` uses it |
| `HTML_EMBED_PLACEHOLDER_IR` | `render/page-body.ts` | only `resolvePageBodyEmbed` uses it |
| `RENDER_CTX_KEY` | `liquid-render.ts` | its only user (reads it in the `render_block` tag, writes it in `buildLiquidData`) |

## Commits (oldest first)
| SHA | step | what |
|---|---|---|
| 904ae0b8 | 0 | merge `origin/fix/wave-b-r3-web` |
| 80cc9e6f | 03-b | worker budgets +17 for the 17 files Run 1 created |
| 23692089 | 3 | `render/doc/doc-render-contract.ts` (types) |
| 8ad3ae3e | 3 | rest of `render/doc/media-ref.ts` |
| be1940b5 | 3 | `render/doc/nodes-media.ts` |
| 9dc26705 | 3 | `renderWidget` port, in place (cycle fix) |
| 9d6f93e5 | 3 | `render/doc/doc-nodes.ts` (whole recursive group) + port test |
| e91d5ec1 | 3 | `render/doc/managed-markers.ts` |
| 3be31c80 | 5 | `WidgetDocRendering` port, in place |
| 7701f2b9 | 5 | `render/widgets/media.ts` |
| 3b762c2d | 5 | `render/widgets/post-content.ts` |
| 6f8e7c59 | 5 | `render/content-html.ts`; `size-debt.json` entry for `render.ts` removed |
| 0946b6fc | 6 | `render/page-body.ts` |
| 11ac8f53 | 6 | `render/post-body.ts` (+ `shortDate`) |
| 4ad71e86 | 6 | `render/template-render-data.ts` |
| a50a8f3a | 6 | `render/components/entry-lists.ts` |
| da58e8db | 6 | `render/components/registry.ts` |
| a541315c | 6 | `render/blocks.ts` |
| e2f2f979 | 6 | `RENDER_CTX_KEY` → `liquid-render.ts` |
| 185c7233 | 7 | re-export block deleted; 37 importers repointed to `render-context.ts` / `form-render.ts` |
| 628cdb6d | 7 | `git mv render.ts render-site.ts`; last 21 importers repointed |

Moves were done by a script (TypeScript compiler API: top-level declaration + its attached comments, imports derived from resolved references, importers repointed by symbol). Verbatim check at the end: of the pre-run `render.ts`, the only lines not present unchanged in the new files are the deleted re-export block and the lines edited for the two ports (46 lines; `export` keywords aside). No new `eslint-disable` / `@ts-ignore`; no barrels, re-export shells or forwarders. ESLint is clean on every file under `render/`, `render-site.ts`, `liquid-render.ts`, `handlebars-render.ts` (function ≤50 lines, complexity ≤10, file ≤500).

## Worker module budget (decision 03-b, approved)
Measured with the test's own loader and counting. Pre-split (sources of `origin/fix/wave-b-r3-web`): **165** handlebars / **122** liquid (budgets 165 / 125).

| after | handlebars loaded (budget) | liquid loaded (budget) |
|---|---|---|
| Run 1's 17 files (`80cc9e6f`) | 182 (182) | 139 (142) |
| + nodes-media, doc-nodes (`9d6f93e5`) | 184 (184) | 141 (144) |
| + managed-markers … registry | 193 (193) | 150 (153) |
| blocks (`a541315c`): `handlebars-render.ts` imports only slices | 175 (175) | 151 (154) |
| `RENDER_CTX_KEY` (`e2f2f979`): `liquid-render.ts` imports only slices | **175 (175)** | **132 (135)** |

**Final change: both budgets raised by exactly 10** (165 → 175, 125 → 135), with the comment `raised by 10 for the render.ts split into feature files (no new code); owner 2026-11-16`. The net is +10, not +28, because the two worker entry modules no longer load the document shell, static-page injection, site-assistant mount and cookie-consent render code they never used. The budget followed the measured count in each commit, down as well as up. One slip: `be1940b5` added one module (`nodes-media.ts`) without the budget edit; it was added one commit pair later in `9d6f93e5`, so the handlebars budget test fails by 1 on `be1940b5` and `9dc26705` alone.

## Gates
Baseline = this branch right after the merge and the +17 budget commit (`80cc9e6f`), same container, Jini `origin/refactor/terra` linked.

| gate | baseline | final (`628cdb6d`) |
|---|---|---|
| per commit: root `tsc`, golden + 7 render test files | 474 tests, 1 fail | 478 tests, 1 fail (same one; +4 from the new port test file) |
| importer test set (70 files) | 1148 tests: 1141 pass / 7 fail | 1148: 1141 / 7, **identical failing set** |
| `typecheck:tests` | 0 errors | 0 errors |
| root `tsc -p tsconfig.json` | 0 errors | 0 errors |
| `check:boundaries` | 111 violations (16 errors, 95 warnings) | 111 (16 / 95), **identical list**; no new `no-circular` |
| `check:size` | exits 1 (unrelated drift) | output identical to baseline |
| `check:complexity` | exits 1 (unrelated drift) | output identical to baseline |
| `worker-import-graph.test.ts` | 26 / 26 (after the +17) | 26 / 26 |
| `typecheck:scripts` | 3 errors | the same 3 errors |
| `check:architecture` | FAILED (4 hard metrics) | FAILED, same 4; propagation cost 12.35% → 11.98% (all-import), 3.13% → 3.10% (runtime); hub count 365 → 362 |

The 7 failing importer tests are not from this work: href-sync x3 (Run 1's D7, already failing), `render-form-layout` browser x3, and the tiptap-contract drift guard, which fails here because `apps/admin` dependencies are not installed in this container (`Cannot find module '@tiptap/core'`). Compared with Run 1's 8: the two transfer-catalog failures were fixed by the merged `wave-b-r3-web`; the tiptap one is new to this container. `check:boundaries` was also run after `content-html.ts` and after `template-render-data.ts`: identical to baseline both times.

## Deviations (Run 2)
- D8 — `WidgetDocRendering` has two members, not the design's three. The design listed `renderDocBody: typeof renderDocBodyAsPageHtml` for post content, but no widget calls `renderDocBodyAsPageHtml`; post content calls `renderDocNode`. An unused port member was not added.
- D9 — one file more than the design's tree: `render/doc/doc-render-contract.ts` (types only), needed for the type-only cycle (see Cycle decision 3).
- D10 — order inside step 5: the widget files moved before `content-html.ts` was created (the design says the reverse). Created first, `content-html.ts` would have imported `render.ts` while `render.ts` imported it: a cycle for those commits.
- D11 — `RENDER_CTX_KEY` went to `liquid-render.ts`, an existing file outside the design's tree, because that is its only user. The "Templated tier (LiquidJS)" banner comment that sat above it stayed with `renderTemplatedTierBody` in `render-site.ts`.
- D12 — `.dependency-cruiser.mjs` `REVIEWED_IMPORT_PAIRS`: the reviewed `render.ts → features/media/public-path.ts` row is now five rows, one per file that carries that same edge (`doc/media-ref`, `doc/media-tags`, `doc/nodes-media`, `widgets/media`, `template-render-data`); the `render.ts` row is gone. No new kind of edge.
- D13 — the `size-debt.json` entry was removed in `6f8e7c59` (when `render.ts` dropped under 500 code lines and `check:size` asked for the stale entry to be deleted), not in the last commit.
- Run 1's D1, D2, D5, D6 stand. D4 is resolved by the contract leaf. Decision 03-a (`safeHref` → Jini `isAllowedHref`) is still not touched.
- `cloud-results/size-03-render-importers.tsv` is Run 1's sheet of importers of `render.ts`; it is now historical (nothing imports `render.ts`).
- Comments elsewhere in the repo that say "`render.ts`'s …" were not rewritten; only imports and the path-keyed tools changed.

## Next
Nothing is left in design 03. Size 04 (`routes/site/pages.ts`) can start: it now imports `renderSite` from `render-site.ts` and the slice files directly. Open for the owner: decision 03-a; and whether the stale "`render.ts`" mentions in comments should be swept.
