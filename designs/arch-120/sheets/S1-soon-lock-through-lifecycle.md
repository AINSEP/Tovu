# Sheet S1 — site-backup asks the agent-plugins lifecycle owner the Soon question (removes edge E085)

Executor: Sonnet, unattended. Budget: ≤ 120k context, ≤ 80 tool calls, 60 min. One responsibility: remove the cross-feature edge `site-backup/import-plugin-state.ts → agent-plugins/soon-lock.ts` without changing behaviour.
Design: `origin/plan/design-arch-120-2026-11-17:designs/arch-120/DESIGN.md` §3.5, §4 (RC6). Do not read further than this sheet unless a STOP tells you to.

Owner rules that apply here: args `(required, optional = {})`; no `vi.mock`/module mocks; functions ≤ 50 lines, complexity ≤ 10, files ≤ 500; why-comments stay with their code; every commit green against the base output; the failing test comes first. Never force-push. Push only your branch.

## 0. Setup (run exactly; Node 24)

```bash
# Start in the folder that holds both checkouts, named exactly `Tovu` and `Jini` (Tovu links ../Jini/packages).
export PATH="$HOME/.local/node24/bin:$PATH"
BASE="${BASE:-origin/refactor/import-cycle-b}"      # the coordinator may name a later integration branch that contains it
cd Jini && git fetch origin refactor/terra && git checkout --detach origin/refactor/terra && pnpm install --frozen-lockfile && pnpm --no-bail -r build && cd ..
cd Tovu && git fetch origin "${BASE#origin/}" plan/design-arch-120-2026-11-17
git checkout -b refactor/arch-120-s1 "$BASE"
npm ci && JINI_PACKAGES_DIR="$PWD/../Jini/packages" node development/scripts/link-jini.mjs
npm --prefix packages/contracts run build && npm --prefix packages/sdk run build
mkdir -p /tmp/arch120 && git archive origin/plan/design-arch-120-2026-11-17 designs/arch-120 | tar -x -C /tmp/arch120
T=/tmp/arch120/designs/arch-120/tools
```

## 1. Prerequisites (each one STOPs on failure; run them all before editing)

```bash
F=apps/website/src/features
test "$(grep -c 'from "#src/features/agent-plugins/soon-lock"' $F/site-backup/import-plugin-state.ts)" = 1 || { echo "STOP P1: the E085 import is not there exactly once (already fixed, or the file moved: report it)"; exit 1; }
test "$(grep -c 'findSoonAgentPlugin({ catalog: lifecycle.soonCatalog, workspaceRoot: workspace.root, pluginId: plugin.id })' $F/site-backup/import-plugin-state.ts)" = 1 || { echo "STOP P2: the call site changed since the design"; exit 1; }
test "$(grep -c '^function buildPolicyGuardedMethods(' $F/agent-plugins/lifecycle.ts)" = 1 || { echo "STOP P3: buildPolicyGuardedMethods not found"; exit 1; }
! grep -q 'findSoonPlugin' $F/agent-plugins/lifecycle.ts || { echo "STOP P4: findSoonPlugin already exists"; exit 1; }
grep -q 'NEW cross-feature edge: apps/website/src/features/site-backup/import-plugin-state.ts -> apps/website/src/features/agent-plugins/soon-lock.ts' <(npm run check:architecture 2>&1) || { echo "STOP P5: the gate does not report E085 on this base"; exit 1; }
```

Each STOP was checked to fire on a planted case (the file with the import removed, a lifecycle with `findSoonPlugin` added).

## 2. Record the base (before any edit)

```bash
bash $T/sheet-gates.sh /tmp/arch120/base
# The globs are quoted on purpose: node expands `**` itself; an unquoted `**` is expanded by bash to one level only.
run_tests() { TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \
  "apps/website/src/features/agent-plugins/**/*.test.ts" "apps/website/src/features/site-backup/**/*.test.ts" "apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts" > "$1.log" 2>&1; grep -E '^✖ ' "$1.log" | sed -E 's/ \([0-9.]+ms\)$//' | sort -u > "$1.failed"; grep -E '^ℹ (tests|pass|fail)' "$1.log"; }
run_tests /tmp/arch120/tests-base
```

Keep `/tmp/arch120/base/` and `/tmp/arch120/tests-base.failed`: every later check compares against them. On the design's base the test run prints `tests 2723 / pass 2717 / fail 0` (about 5 minutes).

## 3. Red tests first (not committed on their own)

File: `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts`. Append at the end (it reuses the file's `installed()` helper, which installs a real plugin into a temp agent-plugins root and returns `{ lifecycle, workspaceRoot }`):

```ts

test("the lifecycle owner names a Soon plugin from its own catalog", async t => {
  const { lifecycle, workspaceRoot } = await installed(t, { maturity: "soon" });
  assert.deepEqual(await lifecycle.findSoonPlugin({ workspaceRoot, pluginId: "notes" }), { name: "Notes" });
});

test("the lifecycle owner answers undefined for a plugin that may be switched on", async t => {
  const { lifecycle, workspaceRoot } = await installed(t, { maturity: "untested" });
  assert.equal(await lifecycle.findSoonPlugin({ workspaceRoot, pluginId: "notes" }), undefined);
});
```

Run the file and confirm exactly these two fail (on the design's base: `pass 8 / fail 2`):

```bash
R=$(TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts 2>&1)
echo "$R" | grep -E '^ℹ (pass|fail)|^✖ the lifecycle owner'
test "$(echo "$R" | grep -E '^ℹ fail')" = "ℹ fail 2" && test "$(echo "$R" | grep -E '^✖ the lifecycle owner' | sed -E 's/ \([0-9.]+ms\)$//' | sort -u | wc -l)" = 2 || { echo "STOP R1: expected exactly the two new tests to fail"; exit 1; }
```

**Do not commit yet**: the tests reference a method that does not exist, so `tsc -p tsconfig.tests.json` is red now, and the owner rule is "every commit green". The red run above is the failing-test-first evidence; put its two `✖` lines in your report. The tests are committed together with the fix in §4.

## 4. The binding and the repoint (one commit, with the tests)

Exact files: `apps/website/src/features/agent-plugins/lifecycle.ts`, `apps/website/src/features/site-backup/import-plugin-state.ts` (+ the test file from §3). No other file.

4a. `lifecycle.ts`, inside `buildPolicyGuardedMethods`, as the first property of the returned object (directly above `setAgentPluginEnabled:`):

```ts
    // The Soon question for callers outside this feature (backup import), answered from this owner's own catalog.
    findSoonPlugin: (input: { workspaceRoot: string; pluginId: string }, _optional: Record<string, never> = {}) => findSoonAgentPlugin({ catalog: soonCatalog, ...input }),
```

`findSoonAgentPlugin` and `soonCatalog` are already in scope there (`lifecycle.ts:29` import, `:159` parameter). Do not change `soonCatalog`'s public exposure (`lifecycle.ts:260`, `:291` `explicitRootSoonCatalog`): boot and composition use it.

4b. `import-plugin-state.ts`: delete line 4 (`import { findSoonAgentPlugin } from "#src/features/agent-plugins/soon-lock";`) and change the call (today `:43`) to

```ts
      && !(await lifecycle.findSoonPlugin({ workspaceRoot: workspace.root, pluginId: plugin.id }));
```

Leave the two comment lines above it (`// A "Soon" plugin is locked off …`) exactly where they are: they still explain this line.

4c. Prove the characterization test guards the behaviour (mutation, then restore):

```bash
F=apps/website/src/features/site-backup/import-plugin-state.ts
cp $F /tmp/arch120/ips.bak
sed -i 's/!(await lifecycle.findSoonPlugin({ workspaceRoot: workspace.root, pluginId: plugin.id }))/true/' $F
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts 2>&1 | grep -q '^✖ a backup import writes a Soon plugin off' || { cp /tmp/arch120/ips.bak $F; echo "STOP M1: dropping the Soon check is not caught"; exit 1; }
cp /tmp/arch120/ips.bak $F && git diff --stat
```

(On the design's base this mutation gives `pass 9 / fail 1`.)

```bash
git add apps/website/src/features/agent-plugins/lifecycle.ts apps/website/src/features/site-backup/import-plugin-state.ts apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts
git commit -m "refactor(site-backup): ask the agent-plugins lifecycle owner whether a plugin is Soon (arch-120 S1)

The backup import imported findSoonAgentPlugin from agent-plugins/soon-lock.ts and bound the
owner's catalog itself. The lifecycle owner already binds that catalog for its own enable paths
(soon-lock.ts header), so it now exposes findSoonPlugin and the import calls it. Same function,
same catalog object, same arguments. Removes the NEW cross-feature edge
site-backup/import-plugin-state.ts -> agent-plugins/soon-lock.ts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## 5. Gates (after the commit; any STOP = do not push, report)

```bash
bash $T/sheet-gates.sh /tmp/arch120/after-s1
bash $T/sheet-gates.sh --compare /tmp/arch120/base /tmp/arch120/after-s1 || { echo "STOP G1: a gate got worse"; exit 1; }
! grep -q 'agent-plugins/soon-lock.ts' /tmp/arch120/after-s1/architecture.lines || { echo "STOP G2: E085 still reported"; exit 1; }
test $(( $(wc -l < /tmp/arch120/base/architecture.lines) - $(wc -l < /tmp/arch120/after-s1/architecture.lines) )) = 1 || { echo "STOP G3: expected exactly one gate line fewer"; exit 1; }
run_tests /tmp/arch120/tests-after-s1
comm -13 /tmp/arch120/tests-base.failed /tmp/arch120/tests-after-s1.failed | grep . && { echo "STOP G4: a test fails that passed on the base"; exit 1; } || true
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
for f in apps/website/src/features/agent-plugins/lifecycle.ts apps/website/src/features/site-backup/import-plugin-state.ts; do
  npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > /tmp/arch120/lim-after
  git show "$BASE:$f" | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > /tmp/arch120/lim-before
  comm -13 /tmp/arch120/lim-before /tmp/arch120/lim-after | grep . && { echo "STOP G5: new limit finding in $f"; exit 1; } || true
done
```

Expected on the design's base: `architecture` 120 → 119 lines, every other gate identical; tests: the two new ones pass, no new failure.

## 6. Push and report

```bash
git pull --rebase origin refactor/arch-120-s1 2>/dev/null || true
git push -u origin refactor/arch-120-s1
git log --oneline "$BASE"..HEAD
```

Report (≤ 15 lines): the SHA, branch, the `--compare` output, the test counts before/after, the mutation result, any STOP hit.
