# Lanes K and T: extraction plan index - REVISION 2 (2026-11-17, planning only) - STATUS: PARTIAL (see "What remains")
Docs only. No source edited; no build or test was run (the generator scripts were run to produce the sidecars).
Code verified against: `integ/merge-final-2026-11-16` did not exist. Used Tovu `integ/merge-a-2026-11-16` e801e9ae (has the size-03/04/05 shapes: `http/site/render/`, `routes/site/pages/`, `posts/editor/`) for every sidecar, cross-checked with Tovu `integ/merge-b-2026-11-16` 450ac748 (7 sheet files differ: `BLOB-DRIFT.tsv`), and Jini `integ/merge-a-2026-11-16` dde69a6d. Regenerate on the final merge before dispatch: `python3 scripts/gen.py <dir> && python3 scripts/decls.py <dir> && node scripts/symbols.cjs <dir>` from the Tovu code root.
Personas: software-architect (lead), refactor, programmer, tdd, security. Skills: implementation-guardrails, feature-slice-design, refactor-patterns, architecture-migration, hexagonal-architecture, testable-design-patterns, test-design, security-review. Lessons 1-39 read.

## Size now (merge-a; source files, tests excluded)
| lane | source files | lines | by label |
|---|---|---|---|
| K | 125 | 17,452 | MOVE 3,344 + SPLIT 3,381 + MOVE-AFTER 3,315 + STAY 7,412 (3,297 of STAY is webhooks keyring/sealer = row 57 / audit2 B09) |
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
| K-05 | K/K-05-taxonomy-tools.md | 10 taxonomy handlers -> cms/taxonomy | K-06b | 240k |
| K-06a | K/K-06a-taxonomy-sql-seam.md | taxonomy SQL seam + 5-file split, Tovu only | - | 160k |
| K-06b | K/K-06b-taxonomy-sql-move.md | -> cms/taxonomy/sql (new node entry) | K-06a | 110k |
| K-07 | K/K-07-trash-tools.md | 2 trash tools -> cms/trash | - | 150k |
| K-09 | K/K-09-webhook-tools.md | 6 webhook tools -> integrations/webhooks/tools | - | 190k |
| K-10a | K/K-10a-forms-tools-seam.md | forms tools seam, Tovu only | - | 210k |
| K-10b | K/K-10b-forms-tools-move.md | 9 forms tools -> cms/forms | K-10a | 130k |
| T-PO-01 | T/T-PO-01-post-leaves.md | 3 pure post leaves | - | 140k |
| T-PO-01g | T/T-PO-01g-go-live-seam.md | go-live: pure part vs sweep lifecycle, Tovu only | - | 90k |
| T-PO-02 | T/T-PO-02-post-cover-image.md | cover image -> cms/media/node | sidecars regenerated (drift) | 120k |
| T-TH-01 | T/T-TH-01-theme-render-leaves.md | 4 theme render leaves | B04 T1 landed (SKIPs today) | 100k |
Dispatchable total: about 2.47M executor tokens (K 2.02M, T 0.45M). Round 1 called 1.9M "runnable now"; the difference is the seam/characterization work the judge showed was missing, minus T-TH-03 and K-07b which left the runnable set.
Not dispatchable (`K/K-DESIGN-QUEUE.md`, `T/T-DESIGN-QUEUE.md`): K-04b, K-05b, K-07b, K-08, K-11; T-TH-02..08, T-PO-01v, T-PO-03..05, T-NL-01..03, admin post editor. Rough estimate unchanged from round 1 plus the added designs: K about 1.3M, T about 6.3M, B04 0.57M, B05 0.15M. Whole programme about 10.8M (round 1: 9.9M).

## Order
Wave 1 (file-disjoint in Tovu; Jini `packages/cms/package.json` is edited only by K-06b; `packages/integrations/package.json` only by K-09): K-01, K-02, K-03, K-04, K-06a, K-07, K-09, K-10a, T-PO-01, T-PO-01g, T-PO-02. Wave 2: K-02b, K-06b, K-10b, then K-05; T-TH-01 after B04 T1. `post/index.ts` is touched by T-PO-01, T-PO-01g, T-PO-02 (barrel re-export lines): run those three serially.
Untangle lanes that touch the same files (R-BARRELS, C3, C4, C11) go first; regenerate sidecars after them.

## Owner decisions
- D-K1 positional `ToolContributor.build(deps, surfaces)` is core's contract; Jini builders take `({ deps, surfaces }, optional = {})`, adapter line in the Tovu binding. Confirm.
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
- That cms re-exports core's `ForbiddenError` (K-09 has the guard command). That `ContentKernel` is assignable to `StorageKernel<Kysely<unknown>, unknown>` (K-06a step 4 stops if not).
- Per-name ownership of `webhooks/{subscriptions,ports,types}.js` (K-09 decides per name by command).
- STAY labels with basis `rule`/`signals` in the inventories were not read line by line.

## What remains (numbered)
1. Admin screens (32,490 lines in 9 `apps/admin/src/features/*` folders) are not sheeted.
2. Designs: K-05b, K-07b, K-08, K-11, T-TH-02, T-TH-05, T-TH-06, T-TH-07, T-PO-03, T-NL-01/02 partitions.
3. Outlines to sheets after their prerequisites: T-TH-08, T-PO-04, T-PO-05, T-NL-03.
4. Per-test move/keep classification for the 392 test files (sheets name test globs, not a per-file disposition).
5. B04/B05 blob guards refresh; B22/B08 sheets.
6. Owner decisions D-K2, D-T1..D-T6.
7. Handler-by-handler body text is still produced by the seam steps under green tests, not pre-written.
