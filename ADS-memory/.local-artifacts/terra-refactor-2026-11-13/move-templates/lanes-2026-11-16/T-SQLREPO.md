# T-SQLREPO (revision 3): shared rules for every lane S / U sheet

Lane-local template for lanes S and U. Revision 2 (2026-11-17) fixed judge findings 13 and 14: the brief is ONE contract,
every commit has a gate command, nothing is left for a coordinator, shared files are scheduled. Revision 3 (Opus review,
INDEX-SU "Revision 3"): base re-pinned to merge-final; every STOP command is in a fenced block (§6); the delete gate,
the `kysely` manifest gate and the import gate were rewritten so they can fire; the T0 mutation loop restores with
`git show`; the 50 / 10 / 10 eslint gate is spelled out (§5 LIMITS).
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
Pinned for revision 3 on Tovu `integ/merge-final-2026-11-16` @ `232764af5` and Jini `integ/merge-final-2026-11-16` @
`65d73b0d5`. Every facts file was regenerated on that Tovu commit (`LANE_SHA=232764af5`); it contains the earlier bases
(Tovu merge-a `e801e9ae`, merge-b `450ac748`; Jini `af33fcdb`). Start only from a pair where each repo contains both
merges (xpkg COMMON "Base" commands) and whose Tovu side contains `232764af5`. Then, before reading source:
```
# Jini                                                   # Tovu
pnpm install --config.prefer-workspace-packages=true     npm ci && npm run link:jini
pnpm -r build && pnpm guard > /tmp/guard-before.txt      npm run typecheck && npm run typecheck:tests     # red on the unmodified pair = STOP
npm --prefix packages/<pkg> run test   (each package the sheet touches; record the summary line)
```
Shell setup used by every command below (paste once per shell; `<tovu>` / `<jini>` are the two clone roots):
```bash
TOVU=<tovu>; JINI=<jini>
TOVU_BASE=$(git -C "$TOVU" rev-parse HEAD); JINI_BASE=$(git -C "$JINI" rev-parse HEAD)   # before the first commit of the run
# TT = Tovu's single-file test command (the `test` script without its globs); run from $TOVU
TT() { TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks "$@"; }
```

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
- Regenerate before step 1: `LANE_ROOT=<tovu> python3 scripts/inv-su.py && LANE_ROOT=<tovu> python3 scripts/rep.py &&
  LANE_ROOT=<tovu> python3 scripts/facts.py /tmp/facts && diff /tmp/facts/<sheet>.facts.md <sheet>.facts.md`.
  Allowed differences, and only these: (a) blob and line changes of files that a sheet listed in this sheet's
  `successor_of` edited, exactly in the declarations that sheet names; (b) new test importers under
  `apps/website/src/__tests__/lane-su-pins/` (S0); (c) the header line. Anything else: **STOP** and report the diff.
  A refreshed guard never widens the sheet: a new importer of a moved file that is not (b) is a STOP, not a to-do.
- Shared Tovu files and who may edit them (by chain order in INDEX-SU §3; two sheets that edit the same file never run in
  the same wave):
  | File | Edited by | Rule |
  |---|---|---|
  | `platform/db/content-kernel.ts` | S0 only | adds `schemaErasedKernel` |
  | `platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` | S6a only (line 2, `outboxEventValues`) | every other binding it imports keeps its path and name; a sheet that would need to edit it = STOP |
  | `features/identity/wiring.ts`, `features/identity/repo.sqlite.ts`, `features/identity/repo.ts` | S3a, S3b, U3a, U3b, serial in that order | text-guarded: each OLD line occurs exactly once |
  | `server/runtime/composition/deps.ts` | any sheet whose `wiring` lists a line there | one chain at a time per wave (INDEX-SU §3); text-guarded |
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
(report: step, command, output). Never push red and fix forward. All commands are in fenced blocks; copy them only from
there (xpkg COMMON rule). `<...>` placeholders are filled from the sheet.

**T0** (Tovu, tests only): the sheet's characterization tests, on unmoved code. Commit locally, run the gate, then push.
```bash
cd "$TOVU"
TT <new test files>                 # green
npm run typecheck:tests             # green
# Mutation loop, once per characterization row (SRC = the source file the row mutates, TEST = its test file,
# NAME = the test name the row expects to fail). Restores from HEAD with `git show`, never `git checkout`.
#   <apply the row's one-line mutation to "$SRC">
if TT "$TEST" > /tmp/mut.out 2>&1; then echo "NOT CHARACTERIZED: $NAME"; else rg -q -F "$NAME" /tmp/mut.out || echo "RED FOR ANOTHER REASON: $NAME"; fi
git show HEAD:"$SRC" > "$SRC"
# after the last row:
git status --porcelain              # must print nothing
```
A row that prints NOT CHARACTERIZED or RED FOR ANOTHER REASON: rewrite the test, or report the row; the sheet then does
not move that code path (for a security row: STOP).

**J1** (Jini): new adapter files + their tests + manifest/export/README/changeset (+ lockfile).
```bash
cd "$JINI"
pnpm --filter @jini-ai/<pkg> build
npm --prefix packages/<pkg> run test
pnpm typecheck
pnpm guard > /tmp/guard-after.txt; diff /tmp/guard-before.txt /tmp/guard-after.txt | rg '^>'   # must print nothing
BASE=$JINI_BASE; limits                                                                    # LIMITS below
pnpm check:size && pnpm check:complexity
```

**T1** (Tovu, names the Jini SHA): binding rewritten, importers repointed, moved files `git rm`'d, baseline rows.
```bash
cd "$TOVU"
npm run link:jini                   # linked to the J1 SHA; record `git -C "$JINI" rev-parse HEAD`
npm run typecheck && npm run typecheck:tests
TT <T0 test files> <every test file listed in the facts file>        # all green, same count as before the run
npx tsx development/scripts/write-path-inventory.ts --check
npm run check:boundaries && npm run check:architecture && npm run check:size && npm run check:complexity
BASE=$TOVU_BASE; limits
rg -n "<each deleted path stem>" apps development -g '!**/node_modules/**'                 # must print nothing
```

**LIMITS** (owner rule: function at most 50 lines, cyclomatic and cognitive complexity at most 10, file at most 500;
modelled on xpkg COMMON S8). Prints only findings that are new or changed against `$BASE` for files the run added or
changed; must print nothing (a line for a function that was already over the limit and shrank is allowed, say so).
```bash
limits() {
  LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
  msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
  for f in $(git diff --name-only --diff-filter=AM "$BASE"..HEAD -- packages apps | rg '\.(ts|tsx|mts|mjs|js)$' | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$)'); do
    npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > /tmp/lim-after
    { git show "$BASE:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > /tmp/lim-before
    comm -13 /tmp/lim-before /tmp/lim-after | sed "s|^|$f: |"
  done
}
```
A sheet with two runs (a/b) states the exact tree after run a; run a's T1 gate is the proof that it compiles alone
(LESSONS 30). Jini tests use fakes that implement the interface (`StorageKernel`, the port types); no `vi.mock`.
Each locking method also gets a Jini `lock-keys.test.ts` driving a recording fake kernel and asserting the exact key.

## 6. STOP conditions, each with its command
Every command prints nothing when the run may continue, unless its comment says otherwise. `NEW_JINI` = the production
files J1 added (`git -C "$JINI" diff --name-only --diff-filter=A "$JINI_BASE"..HEAD -- packages | rg -v '__tests__|\.test\.'`).
- Source changed since planning: the facts diff of §3.
- Port and class differ (step 0 `port_compat`): the sheet's print command; any differing member is SKIPPED with the member
  named, never adapted silently.
- A security step would become a host callback, or its test cannot go red: the T0 mutation loop (§5).
- Prerequisite missing: each prerequisite's own command; missing = SKIPPED, nothing committed.
```bash
cd "$JINI"
NEW_JINI=$(git diff --name-only --diff-filter=A "$JINI_BASE"..HEAD -- packages | rg -v '__tests__|\.test\.')

# (a) A moved body reads a table the sheet did not list: prints each query target; compare with the sheet's `tables`
rg -n "(selectFrom|insertInto|updateTable|deleteFrom|innerJoin|leftJoin)\(" $NEW_JINI

# (b) A moved body imports something the sheet did not turn into a port. Reads whole files, so multi-line imports count.
#     Allowed: relative paths that stay inside the same package's src, @jini-ai/core[/...], @jini-ai/protocol[/...],
#     and kysely (only if (e) passes). Prints every other specifier.
python3 - $NEW_JINI <<'EOF'
import os, re, sys
SPEC = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']""", re.M)
for f in sys.argv[1:]:
    src_root = f.split("/src/")[0] + "/src/"
    for spec in SPEC.findall(open(f, encoding="utf8").read()):
        if spec.startswith("."):
            target = os.path.normpath(os.path.join(os.path.dirname(f), spec))
            if not (target + "/").startswith(src_root.rstrip("/") + "/"): print(f"{f}: leaves the package: {spec}")
        elif not re.match(r"^(@jini-ai/(core|protocol)(/|$)|kysely$)", spec):
            print(f"{f}: not allowed: {spec}")
EOF

# (c) Raw SQL or a dialect branch the sheet did not list: every hit must be named in the sheet
rg -n 'sql`|\.dialect\b|sql\.raw' $NEW_JINI

# (d) A permanent delete was added (owner rule: never permanent deletes). Run after T1.
#     Tovu production code adds no deleteFrom; Jini gains at most as many deleteFrom lines as Tovu lost.
git -C "$TOVU" diff "$TOVU_BASE"..HEAD -- apps ':!*__tests__*' | rg '^\+.*deleteFrom\('
J=$(git diff "$JINI_BASE"..HEAD -- packages ':!*__tests__*' | rg -c '^\+.*deleteFrom\(' || true)
T=$(git -C "$TOVU" diff "$TOVU_BASE"..HEAD -- apps ':!*__tests__*' | rg -c '^-.*deleteFrom\(' || true)
[ "${J:-0}" -le "${T:-0}" ] || echo "STOP: Jini adds ${J:-0} deleteFrom lines, Tovu removed ${T:-0}"

# (e) kysely imported where the manifest does not declare it (run after J1, once per touched package)
PKG=<pkg>
if rg -q "from ['\"]kysely['\"]" "packages/$PKG/src"; then
  node -e 'const j=require(process.argv[1]); const has=(j.peerDependencies||{}).kysely||(j.dependencies||{}).kysely; if(!has){console.log("STOP: kysely not declared in "+process.argv[1]); process.exit(1)}' "$PWD/packages/$PKG/package.json"
fi

# (f) Lock key, stored format, table or column name changed (run after T1; must be green)
cd "$TOVU" && TT apps/website/src/__tests__/lane-su-pins/*.test.ts && npm run typecheck:tests
```
Report file (last commit, both repos): `cloud-results/lanes-su/<sheet-id>.md` with DONE / PARTIAL / SKIPPED, every SHA,
each gate's output, test counts before/after, what the sheet got wrong.
