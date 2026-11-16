# size-03 render.ts split — cloud run report (2026-11-16) — PARTIAL

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
