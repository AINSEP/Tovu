# size-04 `routes/site/pages.ts` split — cloud run report (2026-11-16) — COMPLETE (steps 0–8)

Branch `refactor/size-04-pages` (from `origin/refactor/size-03-render` `2bee5236`; Jini `origin/refactor/terra` `02edbb68` linked). Design: `size-designs/04-tovu-site-pages.md`, Revision 2.
`pages.ts`: 2,989 → 17 lines (`registerSiteRoutes` = four registrar calls). Its code is in 26 new files under `routes/site/pages/`. Every commit was pushed. Each move commit passed root `tsc`, `tsc -p tsconfig.tests.json` and the pins before it was committed; one exception is listed under Deviations (X1).

## Pins (step 0a) and mutation proof
`__tests__/pages.response-matrix.characterization.test.ts` (8 tests) + `__fixtures__/pages.response-matrix.golden.json` (regenerate only with `UPDATE_PAGES_MATRIX_GOLDEN=1`).
- **Route table**: the five `GET` patterns in registration order.
- **Response matrix**, 35 rows over real HTTP on in-memory sites: status, `Cache-Control`, `Vary`, `Location`, `Content-Type`, `Set-Cookie` names, sha1 of the report-only policy, body sha1 and size, and the paths the `pre_content` redirect phase was asked about. Rows: static-theme home (plain, static-export marker, member cookie, flash cookie), post, html page, marketing page (plain, static export, with forms, flash + result), marketing override, missing, redirect hit, member-gated as anonymous and as member, nested path (redirect, no rule, rejected target), `/blog`, `/blog/page/2`, `/blog/page/999`, `/page/2`, `/about/page/2`, see-more page, html batch, json batch, unknown key, page without a listing, content home, default theme (home, post, missing), no themes installed (home, slug).
- **Listing state**: `/page/2` and `/blog/page/2` render page 2 and the redirect phase sees the requested path, not the rewritten one; the JSON batch has `application/json` and its page shape (12 items, `nextCursor` 24, item keys).
- **Headers**: three distinguishable plugin-export hosts (script, frame, connect) are absent from the report-only policy without plugin exports and present with them.
- **Form attempt ids**: replaced before hashing; asserted one per form, four different ids over two requests, none under the static-export marker. The test server's random port is replaced the same way.
- **Static finisher contract**: every repository call is recorded through proxies; embeds → menus → previews → collections → assets in that order, assets requested exactly once and last; the call list and both outputs are pinned.

Green on the unmodified tree, deterministic over repeated runs. Each mutation below was applied to `pages.ts`, turned the pins red, and was reverted:

| mutation | result |
|---|---|
| `max-age=60` → `61` in `CACHE_CONTROL_PUBLIC_PAGE` | 3 tests fail (matrix rows) |
| delete the `addPluginExportHostsToResponse(...)` call | security-header test fails |
| `/page/<n>` rewrite no longer records its request | 2 fail (`paged: /blog/page/2`) |
| `/_more/` rewrite no longer records its request | 3 fail (`more: html batch`) |
| `redirectLookupPath` returns `req.path` | 2 fail |
| `documentAssets` requested a second time | finisher test fails |
| collections resolved before embeds | finisher test fails |
| nested-path route pattern changed | route table fails |
| constant form attempt id | attempt-id test fails |

## Commits (oldest first)
| SHA | what |
|---|---|
| f533989c | test(pages): characterization pins for the public page router (size-04 step 0a) |
| 30a7ffb5 | test(pages): fix the pins' type error under tsconfig.tests (size-04 step 0a) |
| 5d5768ec | refactor(pages): move the render dependency types to pages/render-context/deps (size-04 step 3) |
| b7f2487f | refactor(pages): move assigned-terms resolution to pages/render-context/taxonomy (size-04 step 3) |
| fbe127d4 | refactor(pages): move site title and time zone resolution to pages/render-context/site-title (size-04 step 3) |
| 458286c9 | refactor(pages): listing request state is read and written through accessors, in place (size-04 step 1) |
| 16922bda | refactor(pages): move the listing request state and its readers to pages/listing/listing-state (size-04 step 1) |
| 71906e1d | refactor(pages): move the static-export marker, cache directives and slug/redirect path policy to pages/request-policy (size-04 step 2) |
| 88c73b5c | refactor(pages): move per-request enrichment (withListingBatch) to pages/listing/listing-batch (size-04 step 2) |
| 0c265947 | refactor(pages): move member access decisions to pages/render-context/member-access (size-04 step 3) |
| 1fe83efd | refactor(pages): move widget, embed and site-assistant resolution to pages/render-context/widgets (size-04 step 3) |
| ff1f3b54 | refactor(pages): move html-format content marker resolution to pages/render-context/content-markers (size-04 step 3) |
| c6ffafee | refactor(pages): move static menu resolution (incl. the docs menus) to pages/render-context/static-menus (size-04 step 4) |
| 0c2cbc78 | refactor(pages): move media transform versions and asset metadata to pages/render-context/media-metadata (size-04 step 4) |
| 53b1a4a1 | refactor(pages): move post preview resolution to pages/render-context/post-previews (size-04 step 4) |
| a6ce0564 | refactor(pages): move collection list resolution to pages/render-context/collection-lists (size-04 step 4) |
| ac8bf426 | refactor(pages): move the redirect phase helper to pages/redirect-phase (size-04 step 5) |
| d29f7287 | refactor(pages): move page head assembly to pages/extra-head (size-04 step 5) |
| 367c18d3 | refactor(pages): move the per-visitor response and HTML finalization to pages/response (size-04 step 5) |
| d43816bc | refactor(pages): split finishStaticTierDocument into prepare, resolve and finish, in place (size-04 step 5) |
| 2d248a19 | refactor(pages): move the static-tier finisher and the static theme index to pages/static-tier (size-04 step 5) |
| d593891c | refactor(pages): move template rendering and the missing-template page to pages/template-render (size-04 step 5) |
| 0d177a27 | refactor(pages): split registerSiteRoutes into four registrars, in place (size-04 step 7) |
| fe4138a8 | refactor(pages): move the listing rewrites and the batch-not-found fallback to pages/handlers/listing (size-04 step 6) |
| c1b42f52 | refactor(pages): move marketing page resolution to pages/handlers/marketing (size-04 step 6) |
| 7d05a01f | refactor(pages): move the post page renderers to pages/handlers/post (size-04 step 6) |
| 229876da | refactor(pages): move the virtual page handler and the shared failure responses to pages/handlers/virtual-page (size-04 step 6) |
| 5cc1e14a | refactor(pages): move the not-found paths of the slug route to pages/handlers/post-not-found (size-04 step 6) |
| 950fa0c7 | refactor(pages): move the home page handler and its registrar to pages/handlers/home (size-04 step 6) |
| 88439e1a | refactor(pages): move the nested-path and slug registrars to pages/handlers/slug-routes (size-04 step 7) |
| bbb43585 | refactor(pages): delete the active-theme re-export; its importer names the defining modules (size-04 step 7) |
| dda8118c | refactor(pages): finishStaticTierDocument takes ({ deps, input }, optional = {}); every caller updated (size-04 step 8) |
| e9b406fb | chore(size-debt): remove the two pages.ts entries; the file and registerSiteRoutes are under the limits (size-04 step 7) |
| 7bb419be | refactor(pages): restore the two import why-comments the move dropped (size-04) |

## Files (lines)
```
17 pages.ts
69 pages/extra-head.ts
176 pages/handlers/home.ts
56 pages/handlers/listing.ts
125 pages/handlers/marketing.ts
101 pages/handlers/post-not-found.ts
160 pages/handlers/post.ts
125 pages/handlers/slug-routes.ts
88 pages/handlers/virtual-page.ts
29 pages/listing/listing-batch.ts
121 pages/listing/listing-state.ts
34 pages/redirect-phase.ts
203 pages/render-context/collection-lists.ts
189 pages/render-context/content-markers.ts
73 pages/render-context/deps.ts
196 pages/render-context/media-metadata.ts
64 pages/render-context/member-access.ts
149 pages/render-context/post-previews.ts
56 pages/render-context/site-title.ts
324 pages/render-context/static-menus.ts
51 pages/render-context/taxonomy.ts
107 pages/render-context/widgets.ts
131 pages/request-policy.ts
146 pages/response.ts
185 pages/static-tier.ts
236 pages/template-render.ts
```

## How the moves were made
A script (TypeScript compiler API) driven by the symbol sheet `cloud-results/size-04-pages-symbols.tsv` (step 0b: every top-level symbol of `pages.ts` → one target file; the script refuses a symbol whose owner has not moved yet, and its `--check` mode prints the planned file graph — no cycle, and no `render-context/* → handlers/*` edge). Each move takes the declarations with their attached comments, derives the new file's imports, and repoints every importer (source, tests) by symbol in the same commit. No barrel, re-export shell or forwarder; no new `eslint-disable` / `@ts-ignore` (0 added, 0 removed in the whole diff).
Verbatim check against the base file: of its 2,989 lines, the only non-import lines not present unchanged in the new files are the deleted re-export with its comment (step 7), the two import comments (restored, see X9), the lines edited for the listing accessors (3), the finisher split and signature (7), and the `registerSiteRoutes` header (1).

## Gates
Per commit: root `tsc -p tsconfig.json`, `tsc -p tsconfig.tests.json`, the 8 pin tests. At the end (`e9b406fb`; ESLint, `tsc` and the pins re-run on `7bb419be`, which only adds comments), against the base `2bee5236` in the same container:

| gate | base | final |
|---|---|---|
| root `tsc` / `typecheck:tests` | 0 / 0 errors | 0 / 0 errors |
| pins | 8 / 8 | 8 / 8 |
| importer test set (79 files; 78 exist on the base) | 916 tests: 915 pass / 1 fail (same failing test) | 924 tests: 923 pass / 1 fail |
| ESLint on `pages.ts` + `pages/**` (function ≤50, complexity ≤10, file ≤500) | — | 0 errors |
| `check:boundaries` | 111 violations (16 errors, 95 warnings) | 111 (16 / 95); same list, one row re-keyed: the existing `no-deep-imports:features/seo` error moved from `pages.ts` to `pages/extra-head.ts`; no new `no-circular` |
| `check:size` | exits 1 (unrelated drift) | output identical |
| `check:complexity` | exits 1 (unrelated drift) | output identical |
| `worker-import-graph.test.ts` | — | 26 / 26; no render-worker budget was touched (the page router is not in a worker graph) |

The one failing importer test is the tiptap-contract drift guard (`Cannot find module '@tiptap/core'`: `apps/admin` dependencies are not installed in this container), the same failure the size-03 report records. `check:architecture` was not run (already FAILED at the size-03 baseline).

## Deviations and things to decide
- **X1 — one commit not green on `typecheck:tests`.** `f533989c` (the pins) had a type error under `tsconfig.tests.json` (a cast in the test). Fixed in the next commit, before any source change. Root `tsc` and the pins themselves were green on it.
- **X2 — `listing-state.ts` is not "types only".** The design gives it `storeListingJsonPage`, which calls `toListingJsonItem` and `resolveAssignedTermsForRender`; the readers `listingBatchBody` / `assertListingPageServed` (called by `response.ts`, which must not import a handler) call `@jini-ai/cms/listing`. I kept the design's symbol placement: `listing-state.ts` owns the three WeakMaps (not exported), `ListingJsonItem`, `KeyedPostPreviewBatch` (here to avoid a type cycle with `post-previews.ts`), `storeListingJsonPage`, `toListingJsonItem`, `listingBatchBody`, `ListingBatchNotFoundError`, `assertListingPageServed` and four accessors. It imports `render-context/deps` (types) and `render-context/taxonomy`; nothing imports back.
- **X3 — four new accessor functions** (`recordListingBatchRequest`, `listingBatchRequestOf`, `recordListingPageRequest`, `listingPageRequestOf`, 16 lines) are the only new code besides the two splits. Added in place first (`458286c9`), then moved.
- **X4 — `pages/listing/` has 2 files** (`listing-state`, `listing-batch`), not the 3 of R1.6's count; `request-policy.ts` is top-level as in R1.6's "6 top-level slices". Total 26 new files, as the design says.
- **X5 — order.** `registerSiteRoutes` was split in place before the handler moves (the design has it after), so each handler file was created once, with its registrar.
- **X6 — placements taken from the design's line ranges that the owner may want to revisit:** `htmlEmbedHostDeps` is in `render-context/site-title.ts`; `sendNoThemesInstalled` and `reportSiteRenderFault` are in `handlers/virtual-page.ts` (imported by `home`, `slug-routes`, `post-not-found`); `serveStaticThemeIndex` is in `static-tier.ts` (so `static-tier → response`); `handleSlugRouteError` is in `handlers/post-not-found.ts`.
- **X7 — positional private helpers moved verbatim** (R4 lists them for the size-50 follow-up): `siteTimeZoneDep(deps)`, `isStaticExportRequest(req)`, `withListingBatch(deps, req)`, `resolvePerVisitorResponse(req, res)`, `clearFormFlashCookie(req, res)`, `renderBarePage(deps, post)`, `handlePostNotFoundOnSlugRoute(req, res, deps, theme, staticMenus)`, `resolveSiteTitleForRender(deps, options)`, `resolveRequestedSlug(req, next)`. Only `finishStaticTierDocument` changed shape (step 8, `dda8118c`, all 11 call sites).
- **X8 — not done: the four fake-based unit tests of §4** (`handlers/listing`, docs pager ends, collection-marker cap, content-embed depth/fetch limits). R3's pins are all in; these are additions with no move depending on them.
- **X9 — import lines** in the new files and in changed importers are one line per module (regenerated by the script). Two why-comments that sat on import statements of `pages.ts` were dropped by that regeneration and restored in `7bb419be`, above the same imports in the 8 files that now carry them.
- Comments elsewhere that still say "`pages.ts`'s …" were not rewritten; only imports changed. The design's "4 tests read `pages.ts` as text" did not show up: no test in the importer set failed on a moved anchor.

## Next
Nothing is left in design 04's steps 0–8. Open: X8's unit tests; the owner's view on X2 and X6; R4's positional helpers (X7).
