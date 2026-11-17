# T-SQLREPO (revision 2): shared rules for every lane S / U sheet

Lane-local template for lanes S and U. Revision 2 (2026-11-17) fixes judge findings 13 and 14: the brief is ONE contract,
every commit has a gate command, nothing is left for a coordinator, shared files are scheduled.
Executor: Sonnet, one sheet = one run (stop before 250k tokens; each sheet names its cut point).

## 0. The brief is one contract (LESSONS 29)
Assemble: `cat <X>/untangle/sheets-2026-11-16/COMMON.md T-SQLREPO.md <sheet>.md <sheet>.facts.md > job.md`
(`<X>` = `ADS-memory/.local-artifacts/terra-refactor-2026-11-13` on `plan/xpkg-lane-sheets-2026-11-16`).
- The xpkg `COMMON.md` (revision 2) is the shared rule file: its STOP table, "no coordinator-only files", pairs, git and
  owner rules apply here unchanged. **`move-templates/COMMON.md` is NOT part of this brief** (its line 9 forbids tests,
  typechecks and builds; that contradicts every gate below).
- Precedence: xpkg COMMON > this file > the sheet > the facts file. If two of them disagree: **STOP**, report both lines.
- Where xpkg COMMON says "census", lanes S/U use the facts generator (§3). Branch names: `lanes-su/<sheet-id>` in both repos.

## 1. Base and setup
Verified for this revision on Jini `integ/merge-final-2026-11-16` @ `af33fcdb` (contains merge-a `dde69a6d` and merge-b
`9c982fd9`) and Tovu `integ/merge-a-2026-11-16` @ `e801e9ae`, cross-checked with merge-b `450ac748` (lane files differ in
one file: `platform/db/repos/change-set-repo.ts`, 2 lines; Tovu had no `merge-final` on 2026-11-17). Start only from a pair
where each repo contains both merges (xpkg COMMON "Base" commands). Then, before reading source:
```
# Jini                                                   # Tovu
pnpm install --config.prefer-workspace-packages=true     npm ci && npm run link:jini
pnpm -r build && pnpm guard > /tmp/guard-before.txt      npm run typecheck && npm run typecheck:tests     # red on the unmodified pair = STOP
npm --prefix packages/<pkg> run test   (each package the sheet touches; record the summary line)
```
`TT` below means Tovu's single-file test command (the `test` script without its globs):
`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <files>`.

## 2. What moves and what stays (the same for every SQL sheet)
- MOVES to Jini: query bodies (`Sql*Repo` classes / `create*Store` factories), their row mappers, the lock-key strings
  they own, their why-comments (reworded neutral; the comment gate in xpkg COMMON lists every vanished line).
- STAYS in Tovu: `repo.sqlite.ts` (the binding: Tovu kernel + Tovu table names -> the Jini class), the generated
  `ContentDatabase`, migrations, the dialect-matrix tests, composition.
- NEVER touched: `platform/db/drizzle/**` (frozen), `platform/db/migrations/**` (ADR-066), `content-database.generated.ts`,
  `*.sql`. No sheet changes a schema, a stored format or a default. A sheet that seems to need one = STOP. (If one is
  ever approved it is an ADR-066 TS migration with an N-1 fixture and automatic migration, in its own sheet.)
- Never permanent deletes: a sheet adds no `deleteFrom`; every existing one is listed in the sheet with the reason it
  exists today (credential material, a Trash purge behind the retention check) and moves verbatim.
- Dependency rule (option C): a Jini file written here imports only its own package (relative leaf paths),
  `@jini-ai/core`, `@jini-ai/protocol`, and `kysely` where the manifest declares it. **Never `@jini-ai/db`** from cms,
  user-management or integrations: the kernel type is `StorageKernel<Kysely<unknown>, unknown>` from
  `@jini-ai/core/contracts/storage`, dialect helpers arrive as an injected port (the sheet declares it; precedent:
  xpkg R6-R9 §2 `ColumnCatalogPort`). A Node fs/lock/process need = a port the host fills from `@jini-ai/node-adapters`.
- Shapes copied from the landed precedent (read it first): `packages/cms/src/comments/sql/{repo.ts,repo.rows.ts}` and
  `packages/cms/src/redirects/sql/repo.ts` in Jini; `apps/website/src/features/redirects/repo.sqlite.ts` in Tovu.
  Constructor `({ kernel, tables, ...ports }, _optional: Record<string, never> = {})`; every query starts from
  `db.withTables<LocalTables>()`; table names come only from `tables` (no default); methods take
  `(required, _optional = {})`. A method the PORT declares positionally keeps the port's signature (the sheet lists it).
- Kernel erasure: the precedent bindings cast `contentKernel({ store }) as unknown as XSqlRequired["kernel"]`. xpkg COMMON
  forbids new casts on bindings, so S0 adds ONE helper, `schemaErasedKernel({ store })`, in
  `platform/db/content-kernel.ts` (the single place the cast lives, with its why-comment); every binding in lanes S/U
  calls it and adds no cast. `git diff $BASE..HEAD | rg "^\+.*as unknown as"` must print nothing in every later sheet.
- No Jini `index.ts` uses `export *` for anything the sheet's `split` does not list (xpkg COMMON shell gate; the two
  `export *` lines in the comments precedent are not copied: write named exports).

## 3. Facts, successor guards, shared files (finding 14)
- Regenerate before step 1: `LANE_ROOT=<tovu> python3 scripts/inv.py && LANE_ROOT=<tovu> python3 scripts/rep.py &&
  LANE_ROOT=<tovu> python3 scripts/facts.py /tmp/facts && diff /tmp/facts/<sheet>.facts.md <sheet>.facts.md`.
  Allowed differences, and only these: (a) blob and line changes of files that a sheet listed in this sheet's
  `successor_of` edited, exactly in the declarations that sheet names; (b) new test importers under
  `apps/website/src/__tests__/lane-su-pins/` (S0); (c) the header line. Anything else: **STOP** and report the diff.
  A refreshed guard never widens the sheet: a new importer of a moved file that is not (b) is a STOP, not a to-do.
- Shared Tovu files and who may edit them (by chain order in INDEX §3; two sheets that edit the same file never run in
  the same wave):
  | File | Edited by | Rule |
  |---|---|---|
  | `platform/db/content-kernel.ts` | S0 only | adds `schemaErasedKernel` |
  | `platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` | S6a only (line 2, `outboxEventValues`) | every other binding it imports keeps its path and name; a sheet that would need to edit it = STOP |
  | `features/identity/wiring.ts`, `features/identity/repo.sqlite.ts`, `features/identity/repo.ts` | S3a, S3b, U3a, U3b, serial in that order | text-guarded: each OLD line occurs exactly once |
  | `server/runtime/composition/deps.ts` | any sheet whose `wiring` lists a line there | one chain at a time per wave (INDEX §3); text-guarded |
  | `development/scripts/write-path-inventory.baseline.json` and the other path-keyed baselines | the sheet whose commit moves the write site | in THAT commit: delete only your own rows by hand, never regenerate the file; parallel chains make disjoint hunks |
  | `packages/<pkg>/package.json` + `pnpm-lock.yaml` (Jini) | one sheet per package per wave | export entry, `jini.entries` line, README row and (first SQL sheet of user-management / integrations) the `kysely` optional peer + lockfile, all in the J1 commit that needs them (this replaces the round-1 "P-DEP coordinator step") |

## 4. Sheet fields (every sheet fills all of them; `-` when empty)
`id / jini_target / prerequisites (each with its proving command) / successor_of / port_compat / split (every top-level
declaration: MOVE -> file | STAY-WIRING | STAY-PRODUCT | DELETE) / partition (file and function sizes of the new files,
when the source is over a limit) / tables / lock_keys / ports (name, signature, Tovu binding expression, binding test) /
characterization (test, risk, mutation) / wiring (exact Tovu text) / commits / stops (each with its command) / estimate`.
Table types: the sheet names the tables; the executor copies each column set from
`platform/db/content-database.generated.ts` into a Jini-local interface in the same key order, and S0-P6 (run under
`typecheck:tests`) fails if a later copy drifts from the generated type.

## 5. Commits and their gates
Every commit is pushed only after its gate is green; a red gate is fixed inside the same commit or the run stops there
(report: step, command, output). Never push red and fix forward.
| Commit | Content | Gate (all must pass; paste output) |
|---|---|---|
| **T0** (Tovu, tests only) | the sheet's characterization tests, on unmoved code | `TT <new test files>` green; `npm run typecheck:tests` green; then the **mutation loop**: for each row apply the one-line mutation to the SOURCE file, run that test file, expect a non-zero exit naming that test, `git checkout -- <source>`; finish with `git status --porcelain` empty. A test that stays green under its mutation is rewritten or the row is reported as NOT CHARACTERIZED (the sheet then does not move that code path: STOP for security rows) |
| **J1** (Jini) | new adapter files + their tests + manifest/export/README/changeset (+ lockfile) | `pnpm --filter @jini-ai/<pkg> build`; `npm --prefix packages/<pkg> run test`; `pnpm typecheck`; `pnpm guard` (diff against `/tmp/guard-before.txt` shows no new finding); the eslint limits line of xpkg COMMON on every new file; `pnpm check:size && pnpm check:complexity` |
| **T1** (Tovu, names the Jini SHA) | binding rewritten, importers repointed, moved files `git rm`'d, baseline rows | `npm run link:jini` to that SHA; `npm run typecheck && npm run typecheck:tests`; `TT` on T0's tests + every test file in the facts file (all still green, same count); `npx tsx development/scripts/write-path-inventory.ts --check`; `npm run check:boundaries && npm run check:architecture && npm run check:size && npm run check:complexity`; `rg -n "<each deleted path stem>" apps development -g '!**/node_modules/**'` prints nothing |
A sheet with two runs (a/b) states the exact tree after run a; run a's T1 gate is the proof that it compiles alone
(LESSONS 30). Jini tests use fakes that implement the interface (`StorageKernel`, the port types); no `vi.mock`.
Each locking method also gets a Jini `lock-keys.test.ts` driving a recording fake kernel and asserting the exact key.

## 6. STOP conditions, each with its command
| STOP | Command (prints nothing = ok, unless stated) |
|---|---|
| Source changed since planning | the facts diff of §3 |
| A moved body reads a table or column the sheet did not list | after J1: `rg -n "(selectFrom|insertInto|updateTable|deleteFrom|innerJoin|leftJoin)\(" <new files>` and compare each target with the sheet's `tables` |
| A moved body imports something the sheet did not turn into a port | `rg -n "^import .* from ['\"](\.\./\.\./\.\.|@jini-ai/(?!core|protocol))" -P <new Jini files>` |
| Raw SQL / dialect branch the sheet did not list | `rg -n "sql\`|\.dialect\b|sql\.raw" <new files>`: every hit is named in the sheet |
| Lock key, stored format, table or column name changed | S0 pins: `TT apps/website/src/__tests__/lane-su-pins/*.test.ts` green after T1 |
| A permanent delete was added | `git diff $BASE..HEAD \| rg "^\+.*deleteFrom\("` lists only moved lines; each has a matching `^-` line in the Tovu diff |
| `kysely` used where the manifest does not declare it | `node -e 'const j=require("./packages/<pkg>/package.json");if(!((j.peerDependencies\|\|{}).kysely\|\|(j.dependencies\|\|{}).kysely))process.exit(1)'` after J1 |
| Port and class differ (step 0 `port_compat`) | the sheet's print command; any differing member: SKIPPED with the member named, never adapted silently |
| A security step would become a host callback, or its test cannot go red | the T0 mutation loop |
| Prerequisite missing | each prerequisite's own command; missing = SKIPPED, nothing committed |
Report file (last commit, both repos): `cloud-results/lanes-su/<sheet-id>.md` with DONE / PARTIAL / SKIPPED, every SHA,
each gate's output, test counts before/after, what the sheet got wrong.
