# Lanes K and T: extraction plan index (2026-11-16/17, planning only) — STATUS: PARTIAL (see "What remains")

Unattended planning run, docs only. No source edited, nothing executed, no tests run.
Code read from: Tovu `integ/merge-b-2026-11-16` 491632dc (contains `refactor/terra` and all seven `moves/*` branches; `integ/merge-a` did not exist), `refactor/size-04-pages` 4efdc527 and `refactor/size-05-posteditor` d0d599e4 for the new folder shapes (neither is in merge-b), Jini `refactor/terra` 02edbb68.
Personas: software-architect (lead), refactor, programmer, tdd. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design.

## Verified size now (source lines, tests excluded; `K/INVENTORY.tsv`, `T/INVENTORY.tsv`, one row per file with blob)
| lane | folders (`apps/website/src/features/`) | lines | 11-05 number |
|---|---|---|---|
| K | redirects 806, widgets 1,480, comments 1,423, seo 1,244, taxonomy 2,022, trash 3,732, webhooks 3,892, forms 2,178, form-destinations 686 | 17,463 | ~7.3k |
| T | theme 15,934, post 9,169, newsletter 5,223 | 30,326 | ~21.9k |
The 11-05 numbers counted only the parts then planned to move. By label now: K = MOVE 3,873 + SPLIT 3,381 + MOVE-AFTER 2,759 (in scope 10,013) + STAY 7,450 (3,297 of it is webhooks keyring/sealer/site-key code that belongs to row 57 and audit2 B09, not lane K). T = already covered 4,328 + MOVE 2,281 + SPLIT 6,340 + MOVE-AFTER 13,063 + owner decision 721 + STAY 3,593.
Tests in these folders: K 195 files / 30,516 lines, T 217 files / 40,028 lines (counted, not classified per test).

## Already covered (not planned twice)
- Domain layers of redirects, widgets, comments, seo, taxonomy, trash, forms are already in `@jini-ai/cms` (subpaths exist); what is left in Tovu is tools, SQL repos, bindings.
- audit2 B04 theme engine (5 slices, 2,546 lines; T1-T3 ready, T4 blocked, T5 design) and B05 newsletter campaign (1,782 lines): sheets exist on `plan/audit2-sheets-b`. Their blobs are from `integ/wave-b` and two files have changed size since: refresh before running.
- audit2 a04 (admin widget config editors), B12 (form delivery source-gone): sheets exist.
- Done on `moves/*` (all in merge-b): only two K/T-adjacent slices: content scoring -> `@jini-ai/cms/seo/content-analysis`, sitemap/llms serializers -> `@jini-ai/cms/seo`. No K/T feature file moved yet.
- Size designs 03 (render.ts), 04 (pages.ts), 05 (PostEditor) are done on their branches; they changed the CONSUMERS of theme/post code, not the feature folders (size-04 touches 3 theme source files by a few lines).
- Blocked on the publish framework (audit2 B02/B08, CLASSIFY row 140), listed only: `publish-content.ts` of redirects 157, widgets 255, taxonomy 116 (+ `publish-term-ids.ts` 116), forms 81, post 580, theme 831, `theme/active-theme-publish-content.ts` 110.
- Finding: audit2's index lists sheets B06, B13, B17, B26, B28, B30, B31, B33 as written, but none of those files is on `plan/audit2-sheets-b2` (the commits changed only the index). K-09 here replaces B17.

## Sheets (assemble: `cat T-<KIND>.md [K/K-TOOLS-PATTERN.md] <sheet>.md COMMON.md`; sidecars `<id>.files.tsv` blobs, `.decls.tsv` declarations + measured spans, `.repoint.tsv` import sites, `.census.txt`)
| id | what | lines | state | prerequisites | est tokens |
|---|---|---|---|---|---|
| K-01 | redirects tools -> cms/redirects | 517 | READY | - | 150k |
| K-02 (+02b) | widgets tools -> cms/widgets (+ media-html) | 853 + 179 | READY (02b: diff first) | - | 210k + 60k |
| K-03 | comments tools -> cms/comments | 594 | READY | - | 170k |
| K-04 (+04b) | seo tools -> cms/seo (+ cover/head = B21) | 539 + 139 | READY (04b blocked) | 04b: T-PO-02 | 140k + 60k |
| K-05 (+05b) | taxonomy tool handlers (+ follow-ups) | 450 + 481 | READY (05b design) | 05b: K-05 | 230k + 120k |
| K-06 | taxonomy SQL repo -> cms/taxonomy/sql (new) | 636 | READY | - | 110k |
| K-07 | trash tools -> cms/trash | 924 | READY | - | 200k |
| K-08 | trash SQL + table adapter -> cms/trash/sql (new) | 950 | needs Opus split of one 287-line factory | - | 220k |
| K-09 | webhook tools -> integrations/webhooks/tools | 595 | READY | - | 180k |
| K-10 | forms tools -> cms/forms (2 runs) | 1,017 | READY | - | 310k |
| K-11 | forms leftovers + destinations | 1,414 | DESIGN | Opus pass | 150k + 450k |
| T-TH-01 | theme pure render leaves | 290 | READY | B04 T1 | 90k |
| T-TH-02 | theme validation (manifest, markup, webmcp, package) | 1,427 | READY | B04 T1, T3, T4 | 200k |
| T-TH-03 | listing render + render contract | 736 | READY, Opus review | - | 170k |
| T-TH-04 | template linters | 721 | OWNER D-T2 | D-T2 | 120k |
| T-TH-05 | theme-files | 1,344 | DESIGN | size split | 150k + 400k |
| T-TH-06 | static-render engine (+2 files) | 2,043 | DESIGN | size split, T-TH-05 | 200k + 600k |
| T-TH-07 | theme file lifecycle (= B10) | 1,677 | outline | T-TH-05 | 360k |
| T-TH-08 | theme tools | 2,415 | outline | T-TH-06, T-TH-07 | 550k |
| T-PO-01 | post pure leaves (6 files, 6 pairs) | 564 | READY | - | 150k |
| T-PO-02 | post cover image -> cms/media/node | 268 | READY, Opus review | - | 130k |
| T-PO-03 | post.ts domain | 2,596 | DESIGN | size split | 200k + 800k |
| T-PO-04 | post repos, search, reverters (= B18) | 2,067 | outline | T-PO-03 | 510k |
| T-PO-05 | post tools | 2,802 | outline | T-PO-03 | 900k |
| T-NL-01 | newsletter send/subscribe/confirm | 1,113 | READY after B05 | B05, D-T1 | 330k |
| T-NL-02 | newsletter SQL | 1,009 | READY after B05 | B05, D-T1 | 170k |
| T-NL-03 | newsletter tools | 996 | outline | T-NL-01 | 320k |
Total estimate, new sheets: K about 2.8M, T about 6.4M (theme 2.8M, posts 2.7M, newsletter 0.8M), plus B04 0.57M and B05 0.15M from their own sheets: about 9.9M executor tokens. Runnable now without a decision or a design: K-01..K-04, K-06, K-07, K-09, K-10, T-PO-01, T-PO-02, T-TH-03 = about 1.9M.
"READY" means: files, blobs, declarations, importers, ports and tests are specified; the handler-by-handler body text is NOT pre-written (the seam steps produce it in Tovu under green tests). "outline" = files and risks only.

## Order and parallel runs
1. Wave 1 (file-disjoint, parallel): K-01, K-02, K-03, K-04, K-06, K-07, K-09, K-10a, T-PO-01, T-PO-02. Each edits only its own feature folder in Tovu. Jini side: the cms sheets all append to `packages/cms/src/<domain>/index.ts` of DIFFERENT domains, but K-06 and K-08 both edit `packages/cms/package.json` (new entries) and every cms sheet adds a changeset file: run K-06 and K-08 serially, others in parallel.
2. Wave 2: K-02b, K-04b (after T-PO-02), K-05 (it shares `taxonomy/index.ts` importers with K-06: after K-06), K-08, K-10b, T-TH-03, B04 T1-T3 then T-TH-01.
3. Wave 3 (after an Opus design each): K-11, T-TH-05 -> B04 T4/T5 -> T-TH-02, T-TH-06, T-PO-03.
4. Wave 4: T-TH-07, T-TH-08, T-PO-04, T-PO-05; newsletter (B05 -> T-NL-01, T-NL-02 -> T-NL-03) only after D-T1.
Not parallel with each other: anything on `theme/index.ts` (33 outside importers), `post/index.ts` (47 outside, 145 test importers), `trash/index.ts`; untangle lanes (R-BARRELS, C3, C4, C11) that touch the same file go first.
Re-run `scripts/gen.py` + `scripts/decls.py` on the merged tree before any wave: all blobs here are from merge-b.

## Owner decisions
- D-K1: `ToolContributor.build` in `@jini-ai/core` is positional `(deps, surfaces)`. Sheets use the rule-compliant `build<X>Registrations({ deps, surfaces })` with a one-line adapter in Tovu. Alternative: approve the positional form as an exception because it is the core contract's own shape.
- D-K2: K-11 destinations: `cms/forms` or `integrations`?
- D-T1: newsletter has no second user: move now (about 1M incl. B05) or keep in Tovu and do only seams. Recommendation: wait.
- D-T2: `handlebars`/`liquidjs` in Jini (optional-peer subpaths) or keep the two linters in Tovu behind an injected validator option. Recommendation: keep in Tovu for now.
- D-T3: listing/render class names are a saved surface of installed themes: sheets pass the current prefix as a value instead of renaming to `jini-`. Confirm, or schedule a theme CSS migration.
- D-T4: TipTap toolbar to Jini needs `@tiptap/*` as a new Jini dependency (no Jini package declares it today): which package (`ui`, `admin`, or a new editor package)?
- D-T5: posts/theme/static-render moves need size splits first (no size design exists for `post.ts` 2,596, `static-render.ts` 1,396, `theme-files.ts` 1,344, or the seven tool-registration files): approve the split-in-Tovu-first order, or grant size exceptions.

## Could not verify
- `development/todos.md` has no "LATER - rest of the Tovu -> Jini extraction" section on any fetched branch; scope taken from the task text and plan-v6 sections 9/12.
- `owner-rules.md` is not on the inputs branch; rules taken from the task text and COMMON.md.
- STAY labels marked `rule`/`signals` in the INVENTORY `basis` column were assigned from measured signals (imports, env, SQL, text), not by reading each file; `read` = I read the imports/exports; none of the 233 source files was read line by line.
- That `SurfaceExchangeStore` is exported from the `@jini-ai/core` barrel; which tests can move; Jini's file-size gate value; whether `widgets/media-html.ts` duplicates an existing cms file.
- `.repoint.tsv` lists resolved import sites only; names reached through a feature `index.ts` barrel must be traced per moved name at execution (the census files say so).

## What remains (numbered)
1. Admin screens were measured but NOT sheeted: `apps/admin/src/features/` posts 9,317, themes 9,452, taxonomy 4,640, trash 2,216, forms 1,872, seo 1,625, widgets 1,483 (a04 exists), comments 960, redirects 925 = 32,490 lines on merge-b. All need a Chrome visual check after any move (list screens, editors, dialogs; light + dark); CLASSIFY-files already labels 19 taxonomy, 4 trash, 4 themes, 7 posts, 2 forms rows.
2. K-05b, K-11, T-TH-05, T-TH-06, T-PO-03: Opus designs (dependency-graph partitions, state owners, migration graph).
3. T-TH-07, T-TH-08, T-PO-04, T-PO-05, T-NL-03: outlines to full sheets after their prerequisites land.
4. Per-test move/keep classification for the 412 test files.
5. Refresh B04/B05 blob guards; write the missing B21/B22/B08 sheets (B21 is K-04b here).
6. lost-updates and error-system designs were not read in this run; T-PO-03 must be checked against both before its design is accepted.
