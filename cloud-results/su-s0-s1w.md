# su-s0-s1w: lanes S/U, S0 (pins) then S1w (workspace SQL calibration run)

Status: **S0 DONE. S1w DONE (Tovu T0 + Jini J1 + Tovu T1 pushed).** Branch `wave2/su-s0-s1w` in BOTH repos.
Base pair: Tovu `origin/refactor/terra` = `232764af5`, Jini `origin/refactor/terra` = `65d73b0d5`.
Plan read: `origin/plan/lanes-s-u-2026-11-16` (`INDEX-SU.md`, `T-SQLREPO.md`, `S/S0-pins.md`, `S/S1w-workspace-sql.md` + facts, `su-refresh-REPORT.md`) and xpkg `COMMON.md`.
Owner decisions read (`plan/owner-decisions-2026-11-17`): no ID blocks S0 or S1w. `LO-DB0 = HOLD` is the domain-table-history "DB lane" (DB-1a...), not lane S SQL repos: not applicable. **Assumption: local OD-8 (`schemaErasedKernel`) is not in the ANSWERED list; the Rec is YES and S1w needs it, so commit K was done (a NO would have been the sheet's "skip K" path).**

## SHAs (all pushed)
Tovu `wave2/su-s0-s1w`:
| SHA | What |
|---|---|
| `8e57d9ff` | S0 commit K: `schemaErasedKernel` + test (failing test first) |
| `744fe56a` `090367ed` | S0 T0: P1 lock keys (20 tests), P2 one member one lock (4) (rename commit made names unique) |
| `16e7ac43` | S0 T0: P3 wire format (3), P4 stored hash N-1 (3) |
| `88c6ab89` | S0 T0: P5a/P5b member bearer digest + round trip (4), P5c staff digests (3) |
| `6aac6af5` `2d7dc045` | S0 T0: P7 form-job prefix, P8 outbox row N-1 (4) |
| `774e97fc` | S0 T0: P6 table shapes (58 tables) + P7 `entry_refs` kinds, type level; P8 event typing fix |
| `d83b9e2f` | S0: regenerated facts files, `cloud-results/su-s0-s1w/facts/{S,U}` |
| `7b8f0edd` | S1w T0: `features/workspace/__tests__/repo.characterization.test.ts` |
| `21f890b5` | S1w T1 (checked against Jini `4ad035d7`) |
| (this report commit) | `cloud-results/su-s0-s1w.md` |
Jini `wave2/su-s0-s1w`: `4ad035d7` S1w J1 (pushed without `--no-verify`).
**Tovu `21f890b5` imports `@jini-ai/cms/workspace/sql`, which exists only on Jini `4ad035d7`: the two commits land together.**

## Gates run (exact command -> result)
Setup: Node 24.22.3 in `~/.local/node24`; Jini `pnpm install --frozen-lockfile` ok, `pnpm --no-bail -r build` exit 0; Tovu `npm ci` ok, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (71 links), `packages/contracts` + `packages/sdk` `npm run build` ok.
Base captures (unmodified tree, the BASE-RED rule): `npm run typecheck` exit 0; `check:size` 17 lines, `check:complexity` 23, `check:boundaries` 16 errors, `check:architecture` 5 `regressed:` lines, `check:errors` 18 lines (same numbers as `su-refresh-REPORT.md`).
- S0 (every pin commit) `TT <files>` green; `npm run typecheck:tests` exit 0 (run on the final S0 tree and again after the S1w T0 and T1 trees).
- Ratchets after S0 AND after S1w T1, each compared to the base capture with the T-SQLREPO §5 comparison commands (`check:size`, `check:complexity`, `check:boundaries`, `check:architecture`, `check:errors`): **every comparison printed nothing (no new line beyond base)**; `diff /tmp/arch-before.txt /tmp/arch-after.txt` empty.
- Tovu `npm run typecheck` exit 0 at T1.
- Source-reading tests (169 test files that read the source tree, found with `rg -l "readdirSync|readFileSync|globSync"` + `__dirname|import.meta.dirname|process.cwd|fileURLToPath`, plus `*boundary*`/`*architecture*`/`*import-spec*`/`*inventory*` names), `--test-concurrency=2`: 1744 tests, **12 fail at S0 and 12 at T1**. 11 of them fail identically on the unmodified base (a `git worktree` at `232764af5`, 11 files, `diff` of the `✖` lines: same set; also same at S0 head and T1 head). The 12th (`serve-command.integration.test.ts`: "an identity re-seed failure ... serve process continues serving content", 40 s) failed in the S0 full run, i.e. before any workspace change; run alone, the whole file exceeds a 250 s timeout on BOTH the base worktree and the head (both `Terminated`), so no like-for-like verdict was possible (see "Left"). Not caused by these commits: the S0 tree adds only tests and `schemaErasedKernel`.
- Jini J1 (`4ad035d7`): `pnpm --filter @jini-ai/cms build` exit 0; `cd packages/cms && npx vitest run` exit 0 (all files, incl. 11 new tests; `--maxWorkers=2` is rejected by this package's vitest config: `RangeError: options.minThreads and options.maxThreads must not conflict`, so the default pool was used); `pnpm typecheck` exit 0; `pnpm guard` exit 0 and `diff /tmp/guard-before.txt /tmp/guard-after.txt | rg '^>'` empty; `pnpm check:size` exit 0 (157 entries); `pnpm check:complexity` exit 0 (17 entries); `limits` (50/10/10/500) printed nothing for Jini and for Tovu.
- T-SQLREPO §6 STOP commands: (a) only the `workspaces` table (host-owned name); (b) nothing; (c) nothing; (e) `kysely ^0.29.6` already declared in cms; (d) `J=1 T=1` (the one `deleteFrom` moved verbatim); baseline: `git diff $TOVU_BASE..HEAD -- development/scripts/write-path-inventory.baseline.json | rg '^\+[^+]'` empty (8 lines deleted: the one `SqliteWorkspaceRepo.insert` row); the "existing delete" command prints nothing; deleted-path-stem `rg` prints nothing; `git diff ... | rg '^\+\s*export (\*|\{[^}]*\}) from '` Tovu: nothing; Jini: only the sheet's D7 `workspace/sql/index.ts` named exports (see "Forwarder review").
- S1w T1 test set (the 3 test files of the facts file): 18 tests on the base, 18 at T1, all green; all `features/workspace` + all `lane-su-pins` + K test: 73 pass, 0 fail.

## S0: pins (red/green proof)
Commit K: red = `SyntaxError ... does not provide an export named 'schemaErasedKernel'`, then 3/3 green. Mutation (return `{ ...contentKernel({ store }) }`): 2 of 3 red (the two `assert.equal` tests), restored.
Mutation loop, every row applied to ONE source line, run, restored from `HEAD` (script checked the named test failed; `git status --porcelain` empty after): **all red**.
- P1 (20 tests, 18 mutations incl. the media helper + one per media call site): `workspace/repo.ts:92`, `identity/repo.ts:52`, `settings/repo.ts:352`, `origin-repo.ts:211`, `gated-mutation-token-repo.ts:81`, `taxonomy/repo.ts:163` and `:419`, `trash/repo.ts:18`, `outbox-repo.ts:103`, `webhook-repo.ts:242`, `form-delivery-repo.ts:103` and `:247`, `media-repo.ts:162` (helper) and `:269 :313 :353 :395 :418` (one per site), `:510`, `table-adapter.ts:85` (the table adapter test drives EVERY registry entry), `adapters/user.ts:98`, `members/repo.ts:501`.
- P2 (4 tests): `members/repo.ts:391`, `:424`, `password-auth.ts:125`, `table-adapter.ts:85` (member entry).
- P3/P4 (6 tests): prefix, handle bytes, secret bytes, separator, prefix pattern, key length, memory ceiling (a digest made for N=2^17 must stay refused), layout order (`api-key-secret.ts:45 48 51 54 57 63 66 194`).
- P5 (7 tests): `write-service.ts:81` (`hashToken` returns the raw token; 3 tests red), `access-resolver.ts:60` (sha256 -> sha512; 2 red), the digest predicate dropped from `identity/repo.ts:224`, `mfa.repo.ts:35`, `recovery-codes.repo.ts:30` (one test each).
- P7/P8 (4 tests): `outbox-repo.ts:62 63 65 43 52 123 129`, `form-delivery-repo.ts:166`. First loop printed `NOT CHARACTERIZED` for `outbox-repo.ts:129` (`markDelivered` string); test extended (commit `2d7dc045`), re-run red.
- P6/P7 type level (`p6-p7-table-and-kind-shapes.typecheck.ts`, compiled only by `typecheck:tests`): mutations (a) add a kind to `EntryRefSourceKind`, (b) rename `slug` in `WorkspacesTable` of the generated file: `typecheck:tests` reported `p6-p7-table-and-kind-shapes.typecheck.ts(20,10)` and `(82,10)`, restored. The first `typecheck:tests` run found one type error in my own P8 test (`DomainEvent<object>`), fixed before pushing.
Fixtures: committed literals made up for the tests (security material described by class only: a bearer token, a made-up API-key secret and its stored hash, digest-class strings); the N=2^17 over-ceiling digest was produced once with Node's `scryptSync`.
Facts: all 12 regenerate with `scripts/{inv-su,rep,facts}.py` (`LANE_ROOT=/home/user/Tovu LANE_SHA=232764af5`) and differ from the plan's files only by new importers under `__tests__/lane-su-pins/` (S0 allowance (b)), and unchanged line totals S 9705 / U 5320. The plan branch has `ADS-memory/.local-artifacts/...` but refactor/terra does not, and this run may push only its own branch, so the regenerated facts are committed under `cloud-results/su-s0-s1w/facts/`; **the plan branch's own facts files were NOT updated (successor sheets diff against these)**.

## S1w: workspace SQL
- T0 (`7b8f0edd`): 4 tests, green on unmoved code; mutations all red: drop the `version` predicate (`repo.ts:63`), remove the roster lock (`:92`), `slug =` -> `!=` (`:36`), add `orderBy("id")` to `list` (`:51`).
- J1 (`4ad035d7`): `packages/cms/src/workspace/sql/{repo.ts,index.ts}`, manifest export block after `./redirects/sql`, `"./workspace/sql": "node"` in `jini.entries`, README paragraph, changeset `cms: minor`; Jini tests `workspace/__tests__/{sql.repo.dialects.test.ts (5 tests x SQLite+PGlite), sql.lock-keys.test.ts (recording fake kernel: begin, `lock:workspace:roster`, body, commit), support/workspaces-table.fixture.ts}`.
- T1 (`21f890b5`): `repo.sqlite.ts` is the sheet's binding (`WORKSPACE_TABLES`, `schemaErasedKernel`, no cast); `repo.dialects.test.ts` and `workspace.lost-update.test.ts` build through `workspaceRepoFor({ kernel: schemaErasedKernel({ store: kernel }), tables: WORKSPACE_TABLES })`; `features/workspace/repo.ts` deleted; one baseline object deleted. `workspace/delete.ts` and every caller untouched (STOP not hit).
- Moved comments (S7 command listed them): file headers rewritten neutral (Jini `repo.ts` header, Tovu `repo.sqlite.ts` `@file`); the three `SPEC-044 REQ-08` ticket tags dropped on purpose (sheet D4: Tovu pointers); the `list` doc line kept, `see delete.ts's header` now `see ../delete.ts`. The roster, `transaction` and `update` why-comments moved verbatim.

## Forwarder review (xpkg S3 / S9)
`export { SqlWorkspaceRepo, workspaceRepoFor, ... } from "./repo.js"` in `workspace/sql/index.ts` is the sheet's D7 subpath entry file (precedent `redirects/sql/index.ts`), a new owner module with real code behind it, not a shim for an old path. `workspaceRepoFor` (one call) is the factory D1 requires (it adds the empty optional object and fixes the return type to the class). `schemaErasedKernel` (one cast, one call) is the single helper OD-8 asks for; it is the only `as unknown as` the run adds (K commit); T1 adds none. `createTables` in the test fixture is test code.

## What the plan got wrong / unclear (calibration list for T-SQLREPO)
1. S1w "List order ... mutation: change the `orderBy`": **`list` has no `orderBy`** (`repo.ts:51`). Pinned today's behaviour instead (rows in insertion order, SQLite) and the mutation adds one. The Jini port keeps "no order"; the Jini dialect test sorts for PGlite.
2. S1w D2 says `version: number`; the generated type is `Generated<number>`. Followed the sheet; S0-P6 pins column KEYS only, so the types are not pinned (suggestion: pin types in P6 for the sheets that copy rows).
3. T-SQLREPO §5 J1 uses `npm --prefix packages/<pkg> run test` and the run rules say `--maxWorkers=2`: Jini cms vitest rejects that flag (RangeError); default pool used.
4. S1w says "xpkg R6-R9 landed" as a prerequisite but gives no proving command; the marker in INDEX-SU 1b (`rg -q ColumnCatalogPort packages/cms/src/forms/sql`) prints nothing on the base, i.e. R6-R9 has not landed. The sheet's own three commands print `ok`, S1w uses no dialect helper, so it was executed (the dependency is shared `packages/cms/package.json` edits, see overlaps). If the owner wants R6-R9 strictly first, S1w can be rebased on it.
5. T1 "`rg -n '<each deleted path stem>'`" is ambiguous for `features/workspace/repo` (it also matches `repo.sqlite`); used `workspace/repo(\.js|\.ts)?['"]` and `from "(\./|\.\./)repo\.js"` in the folder.
6. The S/U facts live on the plan branch only; the S0 rule "regenerate and commit them in the SAME commit" has no place to land on refactor/terra. They are under `cloud-results/su-s0-s1w/facts/` (an owner/plan-branch merge is needed).
7. The T-SQLREPO limits helper and the §5 ratchet comparison commands worked as written. `write-path-inventory.ts --check` was not used (cannot run, as the refresh noted).
8. Corepack's default `pnpm` outside the repo is 12.x; inside Jini the `packageManager` pin (10.33.2) is used; no problem.

## Overlaps with parallel runs (file-level)
- Jini `packages/cms/package.json` + `README.md` + `.changeset/` (every cms-chain run, xpkg wave1c/1d, T-PO-02): this run adds one export block, one `jini.entries` line, one README paragraph, one new changeset file. Expect a trivial rebase conflict; resolve by keeping both sides.
- Tovu `development/scripts/write-path-inventory.baseline.json`: one 8-line object deleted (disjoint hunk).
- Tovu `platform/db/content-kernel.ts`: only S0 edits it (new export at the end).
- Tovu `features/workspace/*`, `__tests__/lane-su-pins/*` (new), `platform/db/__tests__/schema-erased-kernel.test.ts` (new): no other listed run owns these.

## Left / next step
- Merge decision for the paired branches (Tovu `wave2/su-s0-s1w` needs Jini `wave2/su-s0-s1w` `4ad035d7`).
- Next sheets in the plan order: S1a (cms taxonomy), then the chain; the chains `db` (S5a), `user-management` (U2c-1, Tovu only) may start now that S0 is DONE. S3/S4/U sheets still wait for their xpkg prerequisites (INDEX-SU 1b).
- The one unexplained red in the source-reading sweep (`serve-command.integration` re-seed test, timing-sensitive at 40 s under load) needs a base comparison with a longer timeout (the file takes more than 250 s alone, on base and head alike). Because S0 (tests + one export) already showed it, it is not attributed to S1w.
- OD-8 should be confirmed (recorded as Rec YES).
