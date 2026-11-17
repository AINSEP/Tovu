# Lanes K and T: extraction plan index - REVISION 3 (2026-11-16, planning only; revision 3 = Opus review response + coordinator decisions 1-5, tables at the end) - STATUS: PARTIAL (see "What remains")
Revision 3 coordinator edits (2026-11-16): lane S owns the taxonomy and trash SQL, so K-06a, K-06b and K-08 are RETIRED ("Coordinator decisions"); cross-plan collisions with lanes S/U: "Cross-plan".
Docs only. No source edited; no build or test was run (the generator scripts were run to produce the sidecars).
Revision 3 checks were made on `integ/merge-final-2026-11-16` (Tovu f70017dc5, Jini 65d73b0d5), which now exists; the sidecars are still the merge-a ones (regenerate on merge-final before dispatch). Revision 2: `integ/merge-final-2026-11-16` did not exist. Used Tovu `integ/merge-a-2026-11-16` e801e9ae (has the size-03/04/05 shapes: `http/site/render/`, `routes/site/pages/`, `posts/editor/`) for every sidecar, cross-checked with Tovu `integ/merge-b-2026-11-16` 450ac748 (7 sheet files differ: `BLOB-DRIFT.tsv`), and Jini `integ/merge-a-2026-11-16` dde69a6d. Regenerate on the final merge before dispatch: `python3 scripts/gen.py <dir> && python3 scripts/decls.py <dir> && node scripts/symbols.cjs <dir>` from the Tovu code root.
Personas: software-architect (lead), refactor, programmer, tdd, security. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design, security-review. Lessons 1-39 read.

## Size now (merge-a; source files, tests excluded)
| lane | source files | lines | by label |
|---|---|---|---|
| K | 125 | 17,452 | MOVE 3,344 + SPLIT 3,381 + MOVE-AFTER 3,315 + STAY 7,412 (3,297 of STAY is webhooks keyring/sealer = row 57 / audit2 B09). Revision 3: 8 files / 1,586 lines of MOVE (K-06, K-08) are relabelled `LANE-S` in `K/INVENTORY.tsv` (lane S runs S1a, S4a/S4b) |
| T | 116 | 30,291 | covered by B04/B05 4,305 + MOVE 1,845 + SPLIT 6,561 + MOVE-AFTER 13,210 + owner decision 797 + STAY 3,573 |
241 source files (round 1's "233" was stale; its inventories held 240; merge-a adds `theme/public-theme-resources.ts`). Tests: K 175 files / 30,534 lines, T 217 files / 40,031 lines = 392 files, still not classified per test.

## How a sheet is assembled (one run = one sheet file; the assembled text is one contract)
- Tool sheets: `cat K/K-TOOLS-PATTERN.md K/<sheet>.md COMMON-KT.md`. Move sheets: `cat T-KT-MOVE.md <K|T>/<sheet>.md COMMON-KT.md`.
- The shared `COMMON.md`, `T-MOVE.md`, `T-SPLIT.md` are NOT used by these lanes (they forbid tests and defer edits to a coordinator).
- Sidecars per id: `.files.tsv` (blobs), `.decls.tsv`, `.fnsize.tsv` (functions > 40 code lines, file sizes), `.importers.tsv` (symbol-level, incl. barrel consumers and re-export lines to delete), `.tools.tsv` (real tools from the AST, checked against catalog + risk map), `.census.txt`.

## Dispatchable sheets (each: one Sonnet run, every commit green and pushed)
| id | file | what | prerequisite (command in the sheet) | est |
|---|---|---|---|---|
| K-01 | K/K-01-redirects-tools.md | 7 redirects tools -> cms/redirects | - | 170k |
| K-02 | K/K-02-widgets-tools.md | 12 widgets tools -> cms/widgets (+ file partition) | - | 230k |
| K-02b | K/K-02b-widgets-media-html.md | media-html -> cms/widgets/html | none (first step decides move vs skip by command) | 70k |
| K-03 | K/K-03-comments-tools.md | 10 comments tools -> cms/comments | - | 200k |
| K-04 | K/K-04-seo-tools.md | 6 SEO tools -> cms/seo | sidecars regenerated (drift) | 160k |
| K-05 | K/K-05-taxonomy-tools.md | 10 taxonomy handlers -> cms/taxonomy | lane S S1a T1 pushed (revision 3) | 240k |
| K-07 | K/K-07-trash-tools.md | 2 trash tools -> cms/trash | never at the same time as lane S S4a/S4b ("Cross-plan") | 150k |
| K-09 | K/K-09-webhook-tools.md | 6 webhook tools -> integrations/webhooks/tools | - | 190k |
| K-10a | K/K-10a-forms-tools-seam.md | forms tools seam, Tovu only | - | 210k |
| K-10b | K/K-10b-forms-tools-move.md | 9 forms tools -> cms/forms | K-10a | 130k |
| T-PO-01 | T/T-PO-01-post-leaves.md | 3 pure post leaves | - | 140k |
| T-PO-01g | T/T-PO-01g-go-live-seam.md | go-live: pure part vs sweep lifecycle, Tovu only | - | 90k |
| T-PO-02 | T/T-PO-02-post-cover-image.md | cover image -> NEW universal `cms/media/cover-image` entry | sidecars regenerated (drift); T-PO-01g pushed | 125k |
| T-TH-01 | T/T-TH-01-theme-render-leaves.md | 4 theme render leaves | B04 T1 landed (SKIPs today) | 100k |
Dispatchable total: about 2.19M executor tokens (K 1.74M, T 0.45M); revision 3 removed K-06a (160k) and K-06b (120k), previously 2.47M. Round 1 called 1.9M "runnable now"; the difference is the seam/characterization work the judge showed was missing, minus T-TH-03 and K-07b which left the runnable set.
Not dispatchable (`K/K-DESIGN-QUEUE.md`, `T/T-DESIGN-QUEUE.md`): K-04b, K-05b, K-07b (waits for lane S S4b), K-11 (K-08 retired); T-TH-02..08, T-PO-01v, T-PO-03..05, T-NL-01..03, admin post editor. Rough estimate unchanged from round 1 plus the added designs: K about 0.9M after K-08's ~0.42M left (was 1.3M), T about 6.3M, B04 0.57M, B05 0.15M. Whole programme about 10.8M (round 1: 9.9M).

## Order (revision 3: every parallel group is file-disjoint, proven by a command)
A file edited by two sheets that run at the same time = not allowed. The shared files are: `assistant/__tests__/tool-registrations.contracts.test.ts` (K-01, K-02, K-03, K-04, K-07, K-09, K-10b: catalog import repoints), `assistant/__tests__/tool-registrations.trash-item.test.ts` (K-01, K-03), `development/scripts/size-debt.json` (K-02, K-03, K-04, K-05, K-09, K-10a), `post/index.ts` + `post/rendering.ts` + `pages/html-document-store*.ts` (T-PO-01, T-PO-01g, T-PO-02), Jini `packages/cms/package.json` + README (T-PO-02 and every lane-S cms run; K-06b retired). Under the revision-3 identity rule `assistant/tool-registrations.ts` and `server/runtime/composition/tool-catalog-manifest.ts` are edited by NO sheet (they import only `contribute<X>Tools`, `build<X>Registrations` and host `<X>ToolDeps`, which keep their names).
- Wave 1, in parallel: K-01, K-02b, T-PO-01 (revision 3: K-06a retired). Tovu write sets disjoint (the command below prints nothing); Jini write sets disjoint: K-01 `cms/src/redirects/*`, K-02b `cms/src/widgets/html/*`, T-PO-01 `cms/src/core/{post-vocabulary,index}.ts`, `cms/src/seo/{html-plain-text,index,ports}.ts`, `cms/src/widgets/{duplicate-embeds,index,host-ports}.ts`; bookkeeping: K-01 `size-exceptions.json`, K-02b `src-complexity-debt.json`, others none.
- Then two serial chains that run in parallel with each other (each chain is one sheet at a time):
  - chain K: K-02 -> K-03 -> K-04 -> K-07 -> K-09 -> K-10a -> K-10b -> K-05 (K-06b dropped). K-05 also waits for lane S S1a T1; K-07 never overlaps lane S S4a/S4b ("Cross-plan").
  - chain T: T-PO-01g -> T-PO-02. T-PO-02 never overlaps a lane-S cms run (same `packages/cms/package.json` + README).
  - The two chains share no Tovu file (command below with the chain lists prints nothing), no bookkeeping file (chain K: `size-debt.json`, `integrations/package.json`; chain T: `error-gate-debt.json`, `cms/package.json`) and no Jini file.
- T-TH-01 after B04 T1 (SKIPs until then). Untangle lanes that touch the same files (R-BARRELS, C3, C4, C11) go first; regenerate sidecars after them, then re-run the disjointness command.
Disjointness proof (run in this folder after regenerating sidecars; prints nothing = disjoint):
```bash
ws() { for s in "$@"; do tail -n +2 "$s.files.tsv" | cut -f1; tail -n +2 "$s.importers.tsv" | cut -f1; done | sort -u; }
# wave 1: no file in two sheets
for s in K/K-01 K/K-02b T/T-PO-01; do ws "$s"; done | sort | uniq -d
# chain K vs chain T
comm -12 <(ws K/K-02 K/K-03 K/K-04 K/K-07 K/K-09 K/K-10 K/K-05) <(ws T/T-PO-01g T/T-PO-02)
```
Revision-3 run of both commands on the merge-a sidecars: both printed nothing. Re-run after the coordinator edits (wave 1 = K-01, K-02b, T-PO-01; chain K without K-06): both printed nothing.

## Owner decisions
- D-K1 positional `ToolContributor.build(deps, surfaces)` is core's contract; Jini builders are `build<X>ToolRegistrations({ deps, surfaces }, optional = {})`; the adapter is the Tovu `build<X>Registrations`, which keeps today's name and positional signature (revision 3 identity rule). Confirm.
- D-K2 K-11 destinations: `cms/forms` or `integrations`.
- D-T1 newsletter has no second user: move now or seams only. Recommendation: wait.
- D-T2 `handlebars`/`liquidjs` in Jini or linters stay in Tovu behind an injected validator. Recommendation: stay.
- D-T3 listing markup (attribute, style sentinel, selectors, class names) is a saved surface of installed themes: keep it as host-passed values (recommended, contract in T-DESIGN-QUEUE) or schedule a theme CSS migration. T-TH-03 is blocked on this.
- D-T4 TipTap toolbar needs `@tiptap/*` as a new Jini dependency: which package.
- D-T5 posts/theme/static-render need size splits first: approve split-in-Tovu-first.
- D-T6 (new) `expectedVersion`: accept core's safe-integer check and `ToolInputError` -> host adapter (a small behaviour change for integers above 2^53), or leave Tovu's parser where it is.

## Revision 2 - judge response (CODEX-JUDGE.md; every finding re-checked in the code named above)
| # | sev | verdict | what changed (file) | evidence |
|---|---|---|---|---|
| 1 | blocker | ACCEPT | NEW `COMMON-KT.md` (V0-V3 setup/baseline/per-commit commands, push per green commit) and `T-KT-MOVE.md`; pattern rewritten; shared COMMON/T-MOVE no longer assembled | root `package.json` scripts `typecheck`, `test`, `link:jini`, `check:size`, `check:complexity`; Jini `packages/cms/package.json:429-431` |
| 2 | blocker | ACCEPT | pattern "Existing owners" + S0(b) + S2/S4 `withToolMetadata`; every K sheet has a `toolMetadata` host row | all 8 files import `contracts/core/tool-metadata/<domain>.js` at line 1-5 and pass it to `buildDomainRegistrations`; Jini `core/src/tool-metadata.ts:18`; `navigation/tool-registrations.ts` `contributeMenusTools` |
| 3 | blocker | ACCEPT | K-10 split into `K-10a` (seam) / `K-10b` (move); wrappers become the `formWrites` port; tests f-l | `forms/index.ts:94-132`; calls at `forms/tool-registrations.ts:358,382,402,592,616` |
| 4 | blocker | ACCEPT | `page-publication.ts` -> T-TH-07 (queue, with ordering/ports/test); `font-links` takes `resources` as required, loader stays (T-TH-01) | `theme/page-publication.ts:1-3`; `theme/font-links.ts:2,16`; `theme/public-theme-resources.ts:1-4,28` |
| 5 | major | ACCEPT | K-07 reduced to 2 files with a local `TrashKindSource` port; `trash-item-tool.ts` -> K-07b (queue, 5 prerequisites) | no `TrashRegistry` under Jini `packages/cms/src/trash` (`index.ts` exports 7 leaves); `trash/trash-item-tool.ts:60-70` |
| 6 | major | ACCEPT | NEW `scripts/symbols.cjs` (TypeScript AST) writes `.tools.tsv`; regex handler rows removed from `decls.py`; counts fixed in every sheet | real counts 7/12/10/6/10/2/6/9 (round 1: 8/12/13/7/12/-/10/10); webhooks delete handler 309-351 |
| 7 | major | ACCEPT | pattern: catalog key `name`, field `sideEffects`, descriptor `deepStrictEqual`; K-09 (f) marker-value test keeps `secretVersion`; T-TH-03 fixtures rewritten | `redirects/agent-tools.ts` 8 x `sideEffects:` 0 x `sideEffect:`; `webhooks/tool-registrations.ts:116-117`; `theme/entry-list-render.ts:37-43,68` |
| 8 | major | ACCEPT | K-06 split into `K-06a` (row types, 4 constructors with workspace scope + tables, qualified-ref rewrite, 5-file split) and `K-06b` | `taxonomy/repo.ts:3,48,68,186,355,524`; Jini `redirects/sql/repo.ts:26-47` |
| 9 | major | ACCEPT | file partitions given for K-02 (518), K-06 (555), K-10 (660); K-01 catalog split corrected; K-07b/T-TH-02/T-NL-01/T-NL-02 moved to the queues with "needs partition"; `.fnsize.tsv` measures code lines | `K-*.fnsize.tsv`; `redirects/agent-tools.ts:59-168` constants already module-level |
| 10 | major | ACCEPT | NEW `T-PO-01g` (Tovu-only split: pure part vs `go-live-sweep.ts`); tests for retry window, overlap, stop-wait, outbox dedup | `post/go-live.ts:109-118,147-184` |
| 11 | major | ACCEPT | `expected-version.ts` out of T-PO-01 -> T-PO-01v (queue) + D-T6; no second parser | Jini `core/src/optimistic-concurrency.ts:66-76` vs `post/expected-version.ts:49-54` |
| 12 | major | ACCEPT | every sidecar rebuilt on merge-a; `.importers.tsv` lists imported names and barrel consumers and the re-export lines to delete; `SIZE04-importers.tsv` and `.repoint.tsv` deleted | e.g. T-PO-01 11 direct + 17 barrel, T-TH-03 12 + 25 |
| 13 | major | ACCEPT | T-TH-03 no longer READY: queue entry with the full markup contract + test list, blocked on D-T3 | `theme/entry-list-render.ts:74-108` (attribute, sentinel, selectors), 21 product-text hits |
| 14 | major | ACCEPT | K-09 BINDINGS: permission names from `@jini-ai/core` with an identity guard; S-IMPORT is now an allow-list | `webhooks/tool-registrations.ts:21,27`; Jini `core/src/index.ts:55-64` |
| 15 | major | ACCEPT | T-NL-01 queue entry: node entry or token ports, consent order + no-activation tests, sender resolution | `newsletter/confirmation.ts:6-10,127,153-164` |
| 16 | major | ACCEPT | pattern S3 probes the export chain and relies on the typecheck | Jini `core/src/index.ts:18` `export * from './surface-exchanges.js'`; `surface-exchanges.ts:141` |
| 17 | major | ACCEPT (partly still open) | one file per run (16 sheet files); K-03 complete typed binding; STOP matrix with a command per condition incl. suppressions, cross-package mocks, locales/hooks for UI sheets; unfinished scope is in the two queue files and "What remains" | `COMMON-KT.md` STOP matrix |
| 18 | minor | ACCEPT | counts regenerated (241 files); `taxonomy/render-entry.ts` relabelled MOVE-AFTER K-05b; `form-destinations/registry.ts` generic part owned by K-11c; `comments/public-markers.ts` flagged for read-through | `scripts/gen.py` RULES; `K/INVENTORY.tsv` |
Rebutted: none. Found while verifying, beyond the judge's list: K-03 also imports `approvalToolHandler`/`refuseUnexpectedKeys` and `@jini-ai/capability-providers/comments` (now BINDINGS rows); `SettingsForbiddenError` is a class used in the rule list, not a predicate; `post/featured-image.ts` throws `PostValidationError` (moved to T-PO-03); `cover-image.ts` has no product part at all; K-05's merge handler is 66 code lines.

## Could not verify
- No build, typecheck or test was run here: the V0/V1 commands are read from package.json scripts, not executed.
- That cms re-exports core's `ForbiddenError` (K-09 has the guard command). (K-06a's `ContentKernel` assignability check moved to lane S with K-06a; S0's `schemaErasedKernel` replaces it.)
- Per-name ownership of `webhooks/{subscriptions,ports,types}.js` (K-09 decides per name by command).
- STAY labels with basis `rule`/`signals` in the inventories were not read line by line.

## What remains (numbered)
1. Admin screens (32,490 lines in 9 `apps/admin/src/features/*` folders) are not sheeted.
2. Designs: K-05b, K-07b, K-11 (K-08 retired to lane S), T-TH-02, T-TH-05, T-TH-06, T-TH-07, T-PO-03, T-NL-01/02 partitions.
3. Outlines to sheets after their prerequisites: T-TH-08, T-PO-04, T-PO-05, T-NL-03.
4. Per-test move/keep classification for the 392 test files (sheets name test globs, not a per-file disposition).
5. B04/B05 blob guards refresh; B22/B08 sheets.
6. Owner decisions D-K2, D-T1..D-T6.
7. Handler-by-handler body text is still produced by the seam steps under green tests, not pre-written.

## Revision 3 - Opus review response
Review: Opus, plan @ cafebcaa5 (scratchpad `opus-review/k-t.md`) + coordinator items. Every item re-checked on `integ/merge-final-2026-11-16` (Tovu f70017dc5, Jini 65d73b0d5).
| item | verdict | change | evidence |
|---|---|---|---|
| N1 S2 breaks identity assertions + direct-builder tests | ACCEPT | pattern "Identity rule": Tovu keeps `build<X>Registrations(routeDeps, surfaces = <default>)` (same name, positional, default) as one `withToolMetadata` call over Jini `build<X>ToolRegistrations({ deps, surfaces }, optional = {})`; contributor unedited; only moved-name imports repointed (COMMON-KT rule 7(a)). `delete` class for default surfaces removed (K-01/02/03/05/09 rows now `host`; K-03 test helper dropped; `CommentsHostToolDeps` -> `CommentsToolDeps` unchanged) | comments `tool-registrations.update-settings-validation-status.test.ts:141`; webhooks `tool-registrations.handlers.test.ts:74`; direct-builder test files: redirects 3, comments 7, forms 8, webhooks 5, trash 5, seo 2, widgets 9, taxonomy 4 |
| N2 V2 lacks CI gates | ACCEPT (part REBUT) | V2 (COMMON-KT code block) now runs `check:architecture` and `check:errors` with "no New/Worse line" as the pass condition. REBUT the "baseline goes stale" part for `check-architecture.baseline.json`: removed edges never fail, only introduced ones, so no sheet edits it and `--update` is forbidden. `error-gate-debt.json` go-live entry moved in T-PO-01g `writes:` | `ci.yml:212,254`; `check-architecture.ts:277-281` (`introducedCrossFeatureEdges` counts additions only); `check-error-gate.mjs:120-127` (WARN mode, exit 0 without `--strict`) |
| N3 stale size-debt fails check:size | ACCEPT | COMMON-KT rule 4 + "write set" clause; `writes:` line in K-01 (size-exceptions row), K-02, K-03, K-04, K-05, K-09, K-10a (builder entries, deleted in S1) | `check-size-drift.ts:156,158` ("Delete stale debt entry", exit 1); `size-debt.json:817,859,999,1027,1111,1118`; `size-exceptions.json:26` |
| N3 wave 1 not file-disjoint | ACCEPT | INDEX "Order": wave 1 = K-01, K-02b, K-06a, T-PO-01; then chain K and chain T, each serial; disjointness command included and run | shared files listed in "Order"; both commands print nothing on the current sidecars |
| N4 K-07 missing bindings | ACCEPT | `TRASH_TOOL_ENTITY_TYPES` + `trashToolEntityTypes` + the 4 adapter imports + `TRASH_PERMISSION_BY_ENTITY_TYPE` stay in NEW Tovu `trash/tool-kinds.ts`; Jini gets `trashPolicy.messageKinds()` (line 192, not de-duplicated) and `catalogKinds()` (line 217); `registry` leaves the Jini deps type; tests (h)(i) | `trash/agent-tools.ts:2-6,40-44,152-154`; `trash/tool-registrations.ts:166,192,217`; `TRASH_TOOL_ENTITY_TYPES` has no importer |
| N5 K-06 contracts.ts port types | ACCEPT | K-06a: `./index.js` names mapped to Jini leaves, line-20 re-export deleted; K-06b: `contracts.ts` -> `cms/src/taxonomy/publish-read-ports.ts` on the universal taxonomy entry, 6 render importers + `repo.sqlite.ts:14` re-export handled | `taxonomy/repo.ts:5-20`; `taxonomy/index.ts:57`; `taxonomy/contracts.ts` (35 lines, imports only `@jini-ai/cms/taxonomy`); importers via `git grep taxonomy/contracts` |
| N6 T-PO-02 target | ACCEPT | NEW universal entry `./media/cover-image` (`cms/src/media/cover-image.ts`, modelled on `./media/slug`); worker-import-graph test added to `tests:`; serial with K-06b | Jini `packages/cms/src/media/node.ts` is a file, `jini.entries["./media/node"] = node`; `./widgets/markers` is universal and already uses parse5 (`widgets/markers/marker.ts`) |
| N7 K-09 guard non-recursive | ACCEPT | guard is `rg -n "ToolPermissionDeniedError as ForbiddenError" packages/cms/src/core` hits + `rg -n "class ForbiddenError" packages/cms/src` empty | Jini `cms/src/core/commands/command.ts:1,55` |
| N8 T-PO-01g fake dedup + invented `report` | ACCEPT | M1(b) asserts equal event ids on two calls only; console line stays as the default of the existing `optional.onError` | `post/go-live.ts:124-125,141,151,155` |
| N9 K-06a @file comment (K-06a since retired; S1a carries the file header) | ACCEPT | lines 22-40 go whole to `repo.predicates.ts`; class files get verbatim paragraphs; predicates = 41-62 | `taxonomy/repo.ts:22-40` |
| N10 PostKind not generic | ACCEPT | T-PO-01 item 1 split: Jini gets `PostStatus` + `PublicPostKind` (post, page); Tovu keeps `PostKind` = `PublicPostKind` plus `email-template`; only 15 importer rows move | `post/post-vocabulary.ts:3-11`; Jini `widgets/host-ports.ts:15-16`, `seo/ports.ts:49` |
| judge #12 T-PO-02 barrel | ACCEPT | sheet + INDEX name `post/rendering.ts` (2 re-export lines) | `T-PO-02.importers.tsv` |
| coordinator: STOP commands in `\|` tables | ACCEPT | COMMON-KT STOP matrix is now one fenced `bash` block; no `\|` command remains in any K/T sheet | `grep -n -F '\|' *.md K/*.md T/*.md` hits only prose |
| coordinator: enforce 50 lines / complexity 10 | ACCEPT | NEW S-FN50 (eslint `--rule max-lines-per-function` 50 error; Tovu config already errors on complexity 10/admin 9; Jini adds `complexity` + `sonarjs/cognitive-complexity` 10 like its `complexity:strict` script) in V2 both repos | Tovu `size-eslint.config.mjs:37` (50 = warn only), `complexity-eslint.config.mjs:43`; Jini `package.json` `complexity:strict` |
| found: K-02b complexity debt | NEW | K-02b M2 first splits `resolveMediaTree` (cognitive 11) and deletes its `src-complexity-debt.json` entry | `src-complexity-debt.json:201-205` |
Rebutted: only the `check-architecture.baseline.json` part of N2 (see row).

## Opus fixes - remaining
None of the review's items is open. Still open from before (unchanged): "What remains" 1-7 above, sidecar regeneration on merge-final (then re-run the disjointness command), owner decisions D-K1 confirm, D-K2, D-T1..D-T6.

