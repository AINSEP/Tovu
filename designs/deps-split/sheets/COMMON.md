# deps-split sheets — COMMON (read with your sheet; one contract: nothing here is overridden by a sheet unless the sheet says "replaces COMMON §n")

Executor: Sonnet, unattended. Repo: Tovu (+ Jini attached for the build). Work branch: `refactor/deps-split` (created once by S0 from the **latest** `origin/refactor/terra` that contains `origin/refactor/import-cycle-b`; later sheets continue it). Never force-push; `git pull --rebase` before every push; push after every commit. Never push `main` or `refactor/terra`. No subagents. Product code changes only as the sheet says; DESIGN = `designs/deps-split/DESIGN.md` on `origin/plan/design-deps-split-2026-11-17` (`git show origin/plan/design-deps-split-2026-11-17:designs/deps-split/DESIGN.md`). Copy `designs/deps-split/work/` from that branch into the work tree (`git checkout origin/plan/design-deps-split-2026-11-17 -- designs/deps-split/work`) and commit it once in S0.

## §1 Setup (only if the sheet runs commands; it always does)

```bash
# Node 24 (skip if `node -v` already prints v24.x)
mkdir -p ~/.local/node24 && curl -fsSL https://nodejs.org/dist/latest-v24.x/ | grep -o 'node-v24[^"]*-linux-x64.tar.xz' | head -1 | xargs -I{} curl -fsSL https://nodejs.org/dist/latest-v24.x/{} | tar -xJ -C ~/.local/node24 --strip-components=1
export PATH=~/.local/node24/bin:$PATH && node -v
cd ../Jini && pnpm install --frozen-lockfile && pnpm --no-bail -r build; cd ../Tovu
npm ci && JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" node development/scripts/link-jini.mjs
```

```bash
# STOP if the link script skipped an app that has its own node_modules (lesson 47)
for a in apps/*/; do [ -d "$a/node_modules/@jini-ai" ] || continue; for p in "$a"node_modules/@jini-ai/*; do [ -L "$p" ] || echo "STOP: $p is not linked"; done; done
```

## §2 Facts re-check (lesson 43) — first thing in every sheet, before editing

```bash
W=designs/deps-split/work
node $W/closure-census.cjs . | head -1
node $W/module-census.cjs . | head -1
node $W/deps-importers.cjs . | head -1
```
Compare with the first line of the matching committed `$W/*.tsv` **as left by the previous sheet** (each sheet commits refreshed TSVs as its last commit). STOP if they differ and the difference is not explained by the previous sheet's own commits (`git log --oneline -- apps/website/src/server/runtime/composition/deps.ts` since that commit).

## §3 Freeze check (SEQUENCE H1 step 4: nobody else writes `deps.ts` during S0-S13)

```bash
git fetch -q origin '+refs/heads/wave*:refs/remotes/origin/wave*' '+refs/heads/refactor/*:refs/remotes/origin/refactor/*'
for r in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/wave2 refs/remotes/origin/wave3 refs/remotes/origin/refactor); do
  case "$r" in origin/refactor/deps-split|origin/refactor/terra) continue;; esac
  mb=$(git merge-base "$r" HEAD) || continue
  git diff --quiet "$mb" "$r" -- apps/website/src/server/runtime/composition/deps.ts || echo "STOP-FREEZE: $r edits deps.ts"
done
```
Expected on 2026-11-18: one line, `origin/wave3/desktop-d0c` (1 import line: `startupSecretEnvironment` from `@tovu/host-shared/startup-secrets`). If D0c is merged into terra, rebase first; if not, continue — the S6 sheet owns that line and applies D0c's spelling only once D0c is in the base. Any **other** branch printed = STOP.

## §4 Base outputs (lesson 44) — S0 captures once; every later sheet compares against them

```bash
mkdir -p /tmp/ds-base && B=/tmp/ds-base
npx tsc -p tsconfig.json --noEmit > $B/tsc.txt 2>&1; echo "exit $?" >> $B/tsc.txt
NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit > $B/tsc-tests.txt 2>&1; echo "exit $?" >> $B/tsc-tests.txt
npm run check:boundaries > $B/boundaries.txt 2>&1; echo "exit $?" >> $B/boundaries.txt
npm run check:architecture > $B/architecture.txt 2>&1; echo "exit $?" >> $B/architecture.txt
for g in check:size check:complexity check:why-comments check:errors check:inventory; do npm run $g > $B/${g#check:}.txt 2>&1; echo "exit $?" >> $B/${g#check:}.txt; done
```
S0 commits these files under `designs/deps-split/work/base-outputs/` so later sessions have them. Judging rule: **no new line beyond the base output** (`diff <(sort base) <(sort now) | grep '^>'` prints nothing except lines the sheet names). Known base reds (import-cycle-b report): `check:boundaries` exit 15 (15 `no-deep-imports`), `check:architecture` exit 1 (120 cross-feature edges).

## §5 Per-commit gates (all of them, every commit; a red gate = fix before the next move, never skip)

```bash
G=/tmp/ds-now && mkdir -p $G
npx tsc -p tsconfig.json --noEmit && NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit
for g in check:boundaries check:architecture check:size check:complexity check:why-comments check:errors check:inventory; do npm run $g > $G/${g#check:}.txt 2>&1; echo "exit $?" >> $G/${g#check:}.txt; diff <(sort /tmp/ds-base/${g#check:}.txt) <(sort $G/${g#check:}.txt) | grep '^>' && echo "STOP-NEWLINE: $g"; done
# owner limits as errors on every file this commit added or changed under composition/ (deps.ts itself is exempt until S13: only its 2 base rows may remain, with smaller values)
git diff --name-only HEAD~1 -- apps/website/src/server/runtime/composition | grep '\.ts$' | grep -v '__tests__' | grep -v '/deps\.ts$' | xargs -r npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs || echo "STOP-LIMITS"
# no module-level cells and no re-exports in site-deps
grep -rnE '^(export )?(let|var) |^export \* |^export \{[^}]*\} from ' apps/website/src/server/runtime/composition/site-deps && echo "STOP-SHAPE"
grep -rnE '^(export )?const [A-Za-z_]+ *= *(new |create[A-Z]|\[|\{)' apps/website/src/server/runtime/composition/site-deps && echo "STOP-MODULE-CELL"
# the 17 bare loggers stay 17, and site-deps builds none
test "$(grep -rn 'createConsoleLogger(' apps/website/src --include=*.ts | grep -v __tests__ | grep -vc '\.test\.')" = 17 || echo "STOP-LOGGERS"
grep -rn 'createConsoleLogger' apps/website/src/server/runtime/composition/site-deps && echo "STOP-LOGGER-IN-SLICE"
# site-deps never imports app.ts, deps.ts or the exporter (module evaluation order, DESIGN R5)
grep -rnE "from \"(\.\./)+(app|deps)\.js\"|features/site-export" apps/website/src/server/runtime/composition/site-deps && echo "STOP-IMPORT"
```

Tests per commit (website tests run on `node --test` with tsx; no vitest):
```bash
T="TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 --test-reporter=tap"
SR="apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts development/scripts/__tests__/dependency-cruiser.test.ts apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts apps/website/src/__tests__/no-first-party-require.boundary.test.ts"
eval "$T $SR 'apps/website/src/server/runtime/composition/__tests__/*.test.ts'" > $G/tests.tap 2>&1
grep -E '^\s*not ok' $G/tests.tap | sed 's/^ *//' | sort -u > $G/fail.txt; grep -E '^# (tests|pass|fail)' $G/tests.tap
comm -13 /tmp/ds-base/fail.txt $G/fail.txt | grep . && echo "STOP-NEWFAIL"
```
S0 records `/tmp/ds-base/fail.txt` with the same command on the unmodified base (16 composition failures are known: Postgres/PGlite/charts names; they must be the same names). At the end of each sheet also run `apps/website/src/server/__tests__/unit/*.test.ts` and `apps/website/src/server/__tests__/integration/*.test.ts` the same way (base list captured in S0 as `fail-wide.txt`).

Test count (honest-testing): report `# tests` before and after each sheet; a drop is a STOP unless the sheet names the moved test file.

## §6 STOPs fire on a planted case (lesson 40) — S0 runs this once and commits the transcript

```bash
mkdir -p apps/website/src/server/runtime/composition/site-deps && printf 'let planted = 1;\nexport const plantedCell = new Map();\n' > apps/website/src/server/runtime/composition/site-deps/planted.ts
grep -rnE '^(export )?(let|var) ' apps/website/src/server/runtime/composition/site-deps && echo "STOP-SHAPE fired (expected)"
grep -rnE '^(export )?const [A-Za-z_]+ *= *(new |create[A-Z]|\[|\{)' apps/website/src/server/runtime/composition/site-deps && echo "STOP-MODULE-CELL fired (expected)"
rm apps/website/src/server/runtime/composition/site-deps/planted.ts
```
Both greps are the exact §5 patterns; if either does not print its planted line, STOP (the gate is broken).

## §7 Moving code

- Move statements **verbatim with the comment lines directly above them** (`git diff --color-moved=zebra` must show the block as moved); only identifiers that become `required.x`/getter calls change.
- A function that moves takes `(required, optional = {})`. Getters for late reads are named after the binding (`late.settingsRepo()`); never read a getter at module scope or at slice entry unless the census row says the read is eager.
- One commit = one slice or one helper group, with every importer and every source-reading test anchor it moves repointed in the **same** commit (no assertion deleted; a moved anchor is asserted in its new file; an order between two anchors in different files is asserted as the order of the two calls in the stage or root).
- Debt rows: never edit `size-debt.json`/`error-gate-debt.json` by hand; when `check:size` reports a smaller value or a stale row, run the script's own update mode if it has one, else STOP and report. Values only go down.

## §8 Report (last commit of each sheet): `cloud-results/deps-split-<sheet>.md` — commits (SHA, one line each), gates table (command → result vs base), test counts before/after, deviations, the exact next step. Push and print the SHAs.
