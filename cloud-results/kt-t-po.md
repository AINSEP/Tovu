# kt-t-po — T-PO-01g DONE, T-PO-01v DONE, T-PO-02 STOPPED (collides with running lane-S cms run)

Branch `wave3/kt-t-po`. Tovu base = `origin/refactor/terra` + one `--no-ff` merge of `origin/wave2/kt-T-PO-01`. Jini branch `wave3/kt-t-po` = `origin/refactor/terra` + one `--no-ff` merge of Jini `origin/wave2/kt-T-PO-01` (needed: Tovu's merged T-PO-01 imports `PostStatus` etc. from `@jini-ai/cms`; no other Jini change). Decisions KT-DT6 / KT-DT2..DT5 = Rec (as given in the dispatch).

## Pushed commits
| repo | SHA | what |
|---|---|---|
| Tovu | 48f5c119b | merge of wave2/kt-T-PO-01 |
| Jini | df8f34497 | merge of wave2/kt-T-PO-01 (no source edit of mine) |
| Tovu | 90c579d3c | T-PO-01g M1: `post/__tests__/go-live.characterization.test.ts` (new, tests only) |
| Tovu | 7974655e0 | T-PO-01g M2: `startPostGoLiveSweep` -> new `post/go-live-sweep.ts`; pure part stays in `go-live.ts`; importers + `error-gate-debt.json` entry repointed |
| Tovu | 53acb101b | T-PO-01v: `post/expected-version.ts` = host error adapter over `@jini-ai/core/optimistic-concurrency` `parseExpectedVersion` (KT-DT6) |

## T-PO-01g
- Census (sheet command): 10 hits = the 10 planning rows. Blob guard: terra blob of `go-live.ts` = sheet blob 36f0271b; the working-tree blob differs only by the T-PO-01 import edit (`PostStatus` from `@jini-ai/cms/core`) that the wave2 merge brought in.
- M1 characterization (new file, existing tests untouched): publishAt==now live / 1 ms earlier not; `goLiveEvent` golden; two `announceDueGoLives` calls -> two enqueues with equal ids; failed pass keeps the last successful `afterIso` (two failing ticks after a success); first pass immediate, ticks during an active pass start none, stop waits, none after stop. GREEN on the unmodified code.
- V3 RED: removing the single-flight guard -> `ticks while a pass is active start no second pass: 3 !== 1`; moving the `afterIso` assignment before the read -> `[12:50, 12:51] != [11:50, 11:50]`. Restored with `git show HEAD:<path>` + `git diff --quiet`.
- M2: moved code unchanged except `warn`'s unused `_optional: Record<string, never> = {}` -> `_optional = {}`. The `Record<string, never>` in the injected callback TYPES (`onError`, `timers`) is left (public seam types, test fakes use them). The 1 `console.error` moved with `warn` (default of existing `optional.onError`); no new option. Repointed: `serving-app.ts`, `go-live.test.ts` and the new test (import line only, class (a)). Barrel `post/index.ts`: `startPostGoLiveSweep` now re-exported from `./go-live-sweep.js`; `announcePendingGoLive` + `GoLiveCandidatesPort` stay (pure names do not move in this sheet, T-PO-03 owns that move and its barrel consumers). `error-gate-debt.json` entry `file` -> `go-live-sweep.ts`.

## T-PO-01v (no sheet exists: design-queue paragraph + KT-DT6 used as the spec)
- Adapter: `parseExpectedVersion({ raw }, { parse = core } = {})`; only core's `ToolInputError` -> `PostValidationError(EXPECTED_VERSION_REJECTION, { cause })`; any other error rethrown. `VERSION_CONFLICT_CODE`, `EXPECTED_VERSION_REJECTION`, `versionConflictEnvelope` stay; no importer touched (signature unchanged). The injected `parse` option exists only so the rethrow path is testable.
- Behaviour change (documented): an expectedVersion above 2^53-1 is 400 `VALIDATION_ERROR` / tool shape rejection instead of accepted-then-409.
- RED on the parent: unit rows `2^53`, `2^53+2`, `1e300` "Missing expected exception"; route `PUT posts/:id` with `expectedVersion: 2**53` -> `409 !== 400`. GREEN after. New files: `expected-version.core-parser.test.ts`, `routes/posts/__tests__/update.expected-version-unsafe.test.ts`. Existing tests unchanged (still green: NaN/Infinity, the 5 malformed-basis route rows, pages route, post + pages tool tests).
- The pages tool arm (`pages/tool-registrations.ts:98`) has its own inline integer guard and only imports the constant; it is not part of this sheet.

## T-PO-02: STOPPED, not started
INDEX: it "never overlaps a lane-S cms run" (same Jini `packages/cms/package.json` + README) and runs before S1w or between cms-chain runs. `origin/wave2/su-s1` (S1a/S1b, last commit 00:20 UTC today) already adds 18 lines to `cms/package.json` and 13 to the README. Run T-PO-02 after S1a/S1b are pushed (regenerate sidecars on that tip first). T-PO-01g is pushed, so that prerequisite holds.

## Gates (exact commands; Tovu, every commit)
Setup: Node v24.22.3; Jini `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build` (0 errors); Tovu `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`, `packages/contracts` + `packages/sdk` built.
- Base (unmodified merged tree): `npx tsc -p tsconfig.json --noEmit` 0; `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` 0; `check:size` 0; `check:complexity` 0; `check:errors | rg "^(New|Worse):"` nothing; `check:architecture` exit 1 = BASE-RED (3 regressed hard metrics: runtime propagation cost 3.06->3.19, module API surface 821->852, bidirectional hub count 335->363; output saved).
- After each Tovu commit: both tsc exit 0; `npx eslint <touched files>` exit 0; `check:size` 0; `check:complexity` 0; `check:architecture` exit 1 and its output identical to the base output with digits stripped (`diff` empty => NO NEW line); `check:errors | rg "^(New|Worse):"` nothing; S-FN50 (`eslint --no-inline-config --rule max-lines-per-function 50`) nothing; S-SUPPRESS / S-MOCK / S-FORWARD nothing.
- Tests (single-file runner, `--test-concurrency=2`): base set post + pages `__tests__` + go-live server tests (101 files): 1156 tests, 1154 pass, 1 fail, 1 skipped; after commit 2 (102 files): 1161 tests, 1159 pass, 1 fail (+5 new), 1 skipped. The one failure is `repo.postgres.test.ts` "two connections: a concurrent appendRevision..." = base (no Postgres in the container). After commit 3, set = post + pages + every test mentioning expectedVersion in post/page/assistant + posts/pages route test dirs (1541 tests): 1535 pass, 5 fail, 1 skipped; all 5 are `psql: connection ... failed` (the base one + 4 `*.compare-and-set.postgres.test.ts` in entries/navigation, files outside the touched code, not run on base because they were not in the base set).
- Jini: no Jini source edit, so the Jini V1/V2 (`typecheck`, package tests, `pnpm guard`) was not run; only the install + full `pnpm -r build` above.
- Tovu `git push` pre-push hook: no apps/desktop change; `--no-verify` not used. Stash/reset/amend/force-push: none.

## Overlaps / left
- File overlaps with parallel runs: none observed (write set = `post/go-live*.ts`, `post/index.ts`, `serving-app.ts`, `error-gate-debt.json` go-live entry, `post/expected-version.ts`, new tests). `post/index.ts` is a shared file in the INDEX (T-PO-01/01g/02): this run changed 1 line there.
- Stale comment-only mentions of `go-live.ts` for the sweep remain in files outside the write set (e.g. `cli/commands/serve-listen.ts`, `site-search/INFO.md`).
- Tovu `package.json` still carries the published `@jini-ai/*` range; CI on this branch needs the T-PO-01 Jini publish (or the link step).
- Next: T-PO-02 after S1a/S1b land; T-PO-03 (posts domain, takes the pure go-live part).
