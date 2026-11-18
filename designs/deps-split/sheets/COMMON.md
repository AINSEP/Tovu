# deps-split sheets — COMMON (revision 3; read with your sheet — a sheet overrides COMMON only where it says "replaces COMMON §n")

Executor: Sonnet, unattended, one sheet per session. Repo: Tovu, with Jini checked out as the sibling `../Jini`. Work branch `refactor/deps-split`, created once by S0 from the base S0 pins; later sheets continue it. Single writer: no one else pushes it. Never force-push, never rebase it, never push `main` or `refactor/terra`. No subagents. DESIGN = `designs/deps-split/DESIGN.md`; revision notes = `REVISION-3.md` (it wins over DESIGN and over `REVISION-2.md` where they differ). S0 vendors `designs/deps-split/` into the work branch; later sheets use the vendored copy.

**Revision 3 has no gate script.** Every check is one of the repository's own commands, run in plain `bash` blocks that start with `set -euo pipefail`. A command's own exit status decides; nothing is wrapped in `|| echo`, `&& echo`, `| head`/`tail`/`wc`/`xargs`, or a process substitution. The only exits a block ignores are named below with the reason (the base-red architecture check, and `diff`'s status 1 = "files differ"). A STOP = stop the sheet, push nothing more to `refactor/deps-split`, write the report (§8) with the STOP line verbatim.

Paths used in every block: `D=apps/website/src/server/runtime/composition`, `W=${TMPDIR:-/tmp}/deps-split-$DS_SHEET` (session scratch, never committed).

## §1 Setup (only what the session lacks; fail closed)

```bash
set -euo pipefail
export DS_SHEET=S<n>; export W=${TMPDIR:-/tmp}/deps-split-$DS_SHEET; mkdir -p "$W"
node -v | grep -q '^v24\.'          # Node 24 (package.json engines). Missing: install it, then re-run this block
JINI_SHA=$(sed -n 's/^JINI=//p' designs/deps-split/work/BASE)      # S0 writes this file (§2); S0 itself uses origin/refactor/terra of Jini
git -C ../Jini fetch -q origin refactor/terra
git -C ../Jini checkout -q --detach "${JINI_SHA:-origin/refactor/terra}"
(cd ../Jini && pnpm install --frozen-lockfile && pnpm -r build)
npm ci
npm run build -w packages/contracts -w packages/sdk                 # @tovu/sdk has no dist after npm ci; without it typecheck fails (12 TS2307/TS7006, checked on b5fbf2a5)
JINI_PACKAGES_DIR="$PWD/../Jini/packages" npm run link:jini          # the script's default path is the owner's laptop; the env var is required here
```
A failure in this block is a setup failure, not your breakage: report `STOP-SETUP <the failing line>` and stop. `npm run build` refuses a linked Jini by design (`check-no-linked-jini.mjs`); the build used by the gates is `npm run build:server`.

## §2 The base and the freeze (one rule)

`designs/deps-split/work/BASE` (written and committed by S0, never edited later) holds three lines: `TOVU_BASE=<sha>` (the `origin/refactor/terra` commit S0 branched from), `JINI=<sha>` (Jini `origin/refactor/terra` at that moment), `NODE=<node -v>`.

**Freeze rule (SEQUENCE H1 step 4; owned by the coordinator):** from S0's first push until H1 step 5 has merged (the unfreeze), no lane other than this plan merges a change to `$D/deps.ts` or `$D/site-deps/**` into `refactor/terra`. Lanes that need those paths either merge before S0 (then they are in the base) or wait for the unfreeze and rebase. The sheets only **detect** a breach — they never merge, rebase or resolve one:

```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
BASE=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/BASE)
git fetch -q origin refactor/terra
git merge-base --is-ancestor "$BASE" origin/refactor/terra || { echo "STOP-FREEZE terra no longer contains TOVU_BASE $BASE"; exit 1; }
hits=$(git log --oneline "$BASE..origin/refactor/terra" -- "$D/deps.ts" "$D/site-deps")
[ -z "$hits" ] || { echo "STOP-FREEZE terra changed a frozen path since $BASE: $hits"; exit 1; }
```
It runs at the start of every sheet and again inside the per-commit block (§5), so a breach is seen before the next push. Shared files (`app.ts`, `src/index.ts`, `size-debt.json`, `error-gate-debt.json`, tests) are **not** frozen: the coordinator's integration merge of `refactor/deps-split` into terra surfaces their conflicts, and the merged tree runs §5 and §6 again before it is pushed.

## §3 Finding code (no indices, no committed TSV as evidence)

Line numbers in the sheets are at Tovu `b5fbf2a5` (the design base) and only orient you; the S0 base (terra + `wave3/import-cycle-b-2`) and every earlier sheet shift them. Each sheet names every move by **binding** and **anchor text**. Regenerate the census into scratch whenever you need current lines:
```bash
set -euo pipefail
node designs/deps-split/work/closure-census.cjs . > "$W/closure.tsv"
awk -F'\t' -v b='<binding>' 'NR>2 && ("," $5 ",") ~ ("," b ",") {print $1, $2}' "$W/closure.tsv"
```
Empty output means the binding is gone: STOP (`STOP-ANCHOR <binding>`), do not guess. The committed `work/*.tsv` are the design's evidence at `b5fbf2a5`; no sheet compares against them or refreshes them.

## §4 Sheet start: record the base-red outputs

`check:architecture` exits non-zero on the base (see INDEX "Base gate status"), so its exit status cannot gate. Each sheet records its output once at sheet start, on the sheet's first `HEAD` (= the previous sheet's last pushed commit, which passed this same comparison):
```bash
set -euo pipefail
npm run -s check:architecture > "$W/arch.base" 2>&1 || [ $? -eq 1 ]     # 1 = the known base-red findings; any other status stops here
grep -q '<ARCH_SENTINEL>' "$W/arch.base"                                # the run reached its summary (INDEX "Base gate status" names the line)
```
`check:boundaries` is handled the same way only if INDEX "Base gate status" lists it as base-red; otherwise it is a plain gate in §5.

## §5 Per commit: commit locally, run the block on the committed tree, then push

```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
git fetch -q origin refactor/deps-split
P=$(git rev-parse origin/refactor/deps-split)        # pinned parent = last pushed, gated commit
git add -A
git commit -m "<message>"                            # more than one local commit since $P is fine; the block covers all of them
npm run typecheck
npm run typecheck:tests
git diff --name-only --diff-filter=d "$P" HEAD -- '*.test.ts' '*.test.mjs' > "$W/changed-tests"
mapfile -t CHANGED_TESTS < "$W/changed-tests"
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks "${SR_TESTS[@]}" "${SHEET_TESTS[@]}" "${CHANGED_TESTS[@]}"
npm run check:size
npm run check:complexity
npm run check:errors -- --strict                     # plain check:errors is WARN mode and exits 0 on a new finding
npm run check:hooks
npm run -s check:architecture > "$W/arch.now" 2>&1 || [ $? -eq 1 ]
grep -q '<ARCH_SENTINEL>' "$W/arch.now"
diff "$W/arch.base" "$W/arch.now" > "$W/arch.diff" || [ $? -eq 1 ]     # 2 = diff trouble: stops
awk '/^>/ { print "STOP-ARCH-NEW-LINE " $0; n++ } END { exit n > 0 }' "$W/arch.diff"
npm run check:why-comments -- --base "$P"            # diffs $P..HEAD: the committed candidate itself
# freeze (§2), same block as at sheet start:
BASE=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/BASE)
git fetch -q origin refactor/terra
git merge-base --is-ancestor "$BASE" origin/refactor/terra
hits=$(git log --oneline "$BASE..origin/refactor/terra" -- "$D/deps.ts" "$D/site-deps")
[ -z "$hits" ] || { echo "STOP-FREEZE $hits"; exit 1; }
git push origin HEAD:refactor/deps-split             # never forced; a rejection means someone else pushed: STOP-BRANCH-MOVED (do not pull or rebase)
```
`SR_TESTS` (set once per session; the source readers of DESIGN §1.2 + every composition test, which includes the S0 pins):
```bash
SR_TESTS=(
  apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
  apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts
  apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts
  apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts
  development/scripts/__tests__/dependency-cruiser.test.ts
  apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts
  'apps/website/src/server/runtime/composition/__tests__/*.test.ts'
  'apps/website/src/server/runtime/composition/memory-deps/__tests__/*.test.ts'
)
```
`SHEET_TESTS` = every test file named in the sheet's "Carries" table (the sheet prints the array). Rules:
- The runner's exit status decides: any failing, cancelled or unloadable test file is non-zero and stops the block. S0 proves every `SR_TESTS` file and every sheet's `SHEET_TESTS` file is green on the base (S0 step 4); a red one there is `STOP-BASE-RED-TEST` for the coordinator, never a tolerated failure.
- Postgres-only tests skip themselves on this host; record "not run: `create-site-route-deps.postgres.test.ts`" in each report.
- A failing step after `git commit`: fix it in a new local commit and run the whole block again (same `P`). If you cannot make it green, push the local commits to `refactor/deps-split-stop-$DS_SHEET` (a new branch; never to `refactor/deps-split`) and STOP with the failing command's last lines.
- Debt files are never edited to silence a gate. When `check:size` prints `Delete stale debt entry: …` for a `composition/deps.ts` row this commit shrank, delete exactly that entry from `development/scripts/size-debt.json` (rows live under `.violations`; identity is `file` + `function` + `rule`, e.g. `"function": "<file>"` / `"composeSiteRouteDeps#1"`), in the same commit, and name it in the report. When a counted error finding moves file, transfer exactly its count in `development/scripts/error-gate-debt.json` (top-level array; identity `file` + `rule`; value = count): lower the `deps.ts` row (delete it at 0) and add the new file's row; the total stays equal. `check:size` and `check:errors -- --strict` in the block are what prove the edit right; any other debt change is a STOP.

## §6 Sheet end (after the last product commit, before the report commit)

```bash
set -euo pipefail
npm run unlink:jini && npm run build && JINI_PACKAGES_DIR="$PWD/../Jini/packages" npm run link:jini   # the real build (refuses linked Jini, so unlink around it)
npm run check:boundaries > "$W/bnd.txt" 2>&1 || [ $? -eq <BOUNDARIES_BASE_EXIT> ]               # INDEX "Base gate status"
```
plus the §5 block once more on the final tree (it is the report commit's gate). If `npm run build` cannot run here because the published Jini lacks something terra needs (INDEX says whether it did on `b5fbf2a5`), use `npm run build:server` with Jini linked and say so in the report.

## §7 Moving code

- Move statements **verbatim with the comment lines directly above them** (`git diff --color-moved=zebra` shows the block as moved); only identifiers that become `required.x` or getter calls change. `check:why-comments` (§5) fails a deleted why-comment that has no matching addition.
- A moved function takes `(required, optional = {})` (owner rule). A positional helper that moves is converted **in the same commit**, with every caller and every source-reading anchor of its call text.
- **Retained public factories keep their published shape** (owner rule): `createSiteRouteDeps(_required = {}, { dbPath, overrides } = {})` — an unused required bag is `_required = {}`, never typed `Record<string, never>` (S4 converts today's `_required: Record<string, never> = {}`). `createSiteRouteDepsForWorkspace` already has real required inputs.
- Getters for late reads are named after the binding (`settingsRepo: () => settingsRepo`) and are read **only when called** — never at slice entry, never at module scope.
- **Awaits stay where they are.** Every top-level `await` of today's closure stays a top-level statement of `composeSiteRouteDeps`, verbatim except renamed identifiers (DESIGN §2.2 lists the nine). Slices are **synchronous**; no new `async` function wraps an original await, no synchronous block becomes async.
- **No stage files before S13.** S5-S12 move slices only; the root calls each slice directly at the original position. S13 measures the root and groups adjacent synchronous slice calls into a stage file only as far as the 50-line limit needs (DESIGN §2.2). A root statement (a cell write, `const kernel = store.content`, an await) is never moved into a stage.
- One commit = one slice (or one helper group), with every importer and every source-reading test anchor it moves repointed in the **same** commit; no assertion is deleted; a moved anchor is asserted in its new file; an order between anchors in different files is asserted as the order of the calls in the root.
- **Carries.** Each sheet lists the behaviour that must travel and the test that fails when it does not; those files are the sheet's `SHEET_TESTS`. A new test is shown red once by its named mutation (applied, run, output saved for the report, reverted, never committed).

## §8 Report (last commit of each sheet): `cloud-results/deps-split-<sheet>.md`

Commits (SHA + one line each); for each §5/§6 command: exit status and, for the architecture comparison, the line count of `arch.diff`; test files run and their pass counts; the carries table with each new test's red-once mutation and output; deviations; the exact next step. On a STOP: the STOP line verbatim, the last pushed commit, the stop branch if any, the next step.

## §9 Slice extraction rules (S5-S12)

1. Top-down, in DESIGN §1.3 order: one slice per commit — statements verbatim into `site-deps/slices/<slice>.ts`, called from the closure at the same position.
2. The closure keeps today's local names: the block becomes `const { a, b, … } = composeX(required, optional)` — **never `await`ed**. The destructured names are exactly the block's names a later statement reads (census eager/deferred columns, by binding). Later code does not change.
3. A read of a binding declared **later** (census "forward(late)") is passed as a getter: `{ settingsRepo: () => settingsRepo }`.
4. Root cells (`pendingLifecycleEvents`, `lifecycleTracker`, `routeDepsBuiltForPluginHost`, `formCollectionProviders`, `bindSharedApiOAuth`, `resolveRouteDeps`/`routeDepsBuilt`) stay in the closure; slices get getters; every write stays in the closure at its position (DESIGN §2.3).
5. A slice that logs receives `required.logger`; the closure passes `logger: consoleLogger`. No file under `site-deps/` calls `createConsoleLogger`.
6. A single-user module helper (DESIGN §1.3 table) moves into its user's slice file in the same commit.
7. `composition-boot-order.unit.test.ts`'s top-level-await list keeps reading `composeSiteRouteDeps`; its "no `db` identifier" / "no `sqliteDb`" checks apply to the **extracted composition bodies** (each moved slice function's body, read with the same `functionBody` helper), not to whole `site-deps` files — `open-store.ts` legitimately uses `db` (`deps.ts:694` on `b5fbf2a5`).
8. Structural checks in a sheet's STOP block use one form only — the match list goes to a file, then its line count is compared:
   ```bash
   grep -rnE 'PATTERN' FILE_OR_DIR… > "$W/hits" || [ $? -eq 1 ]      # 1 = no match (fine); 2 = missing path or bad pattern: stops
   test "$(wc -l < "$W/hits")" -eq N || { cat "$W/hits"; echo "STOP-<NAME>"; exit 1; }
   ```
   `N` is the expected count (0 for "forbidden"). A missing path is never "zero matches".
