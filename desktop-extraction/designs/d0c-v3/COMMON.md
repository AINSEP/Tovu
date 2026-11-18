# d0c-v3 COMMON (read first; every sheet inherits it)

Design: `../D0c-REVISION-3.md` (option C: no `@tovu/host-shared`). Sheets: `J1`-`J4` (Jini), `T1`-`T7` (Tovu, executable), `T8`, `T9` (outlines, gated on owner Q2-b). One sheet = one run = one branch = one or two commits. Product rules in force: no re-export shells (an old path is deleted, never forwarded); DI/ports; exported functions `(required, optional = {})`; functions <= 50 lines, complexity <= 10, files <= 500 lines; no new bespoke script (gate = the repo commands below); no over-engineering (a sheet does exactly its list).

## 1. Base and branches
- Tovu start: `origin/integ/merge-3-2026-11-18` **2d82735a** (or its successor the coordinator names). Jini start: `origin/integ/merge-3-2026-11-18` **d37821a4**.
- Branch per sheet: `desktop-x/d0c-v3-<sheet>` (e.g. `desktop-x/d0c-v3-T3`) in the sheet's repo, created from the start SHA. Push every 5-10 minutes (`wip:` commits allowed on `wip/desktop-x/d0c-v3-<sheet>`); the sheet branch gets a commit only after its gate passed. `git pull --rebase` before every push; never force-push; never `--no-verify`.
- `B` = the sheet's start SHA (`B=$(git rev-parse HEAD)` before the first edit). Record it in the report.
- **Do not** `git revert dd639c1fd` (the reverted host-shared merge). The reverted commits `e17f1a7d`, `8e4f68f1`, `26c8df0c`, `09669849` are reading material only (their new characterization tests are cited by sheet).

## 2. Setup (once per run, before reading source)
Tovu (Node 24; npm 11.12.1 for lockfile writes, as `desktop-d0c-2.md` found the bundled npm rewrites unrelated lines):
```bash
set -euo pipefail
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix apps/desktop
npm ci --ignore-scripts --prefix apps/admin
npm --prefix packages/contracts run build
npm --prefix packages/sdk run build
```
When the sheet needs an unreleased Jini change (T1, T2, T4, T7): build the Jini sheet's branch (`pnpm install --frozen-lockfile && pnpm -r build` in the Jini checkout, which must be named exactly `Jini` beside `Tovu`), then
```bash
JINI_PACKAGES_DIR=../Jini/packages node development/scripts/link-jini.mjs
for p in ../Jini/packages/*/; do n=$(node -p "require('./$p/package.json').name"); case "$n" in @jini-ai/*) [ -e "apps/desktop/node_modules/$n" ] && ln -sfn "$(cd "$p" && pwd)" "apps/desktop/node_modules/$n";; esac; done
```
(the second line is what combine-3/combine-3-fix did by hand: the desktop has its own `node_modules`). `npm run build` refuses a linked Jini by design (`check-no-linked-jini.mjs`); the gate therefore uses `npm run build:server`.

Jini: `pnpm install --frozen-lockfile && pnpm -r build`. Lockfiles are never edited by hand.

## 3. Step 0 of every sheet (baseline on the unmodified tree; a red here is BASE-RED, not yours)
```bash
/bin/bash -n <file holding gate G>             # must exit 0 on the shell in use (Bash 3.2 included: G has no mapfile, no case inside $( ))
<run the sheet's gate G once on B, save output to $OUT/base.txt, record each command's exit status>
```
Record in the report: each gate command's exit status on `B`, and for Tovu the line `N metric(s) regressed` of `npm run check:architecture` (combine-3-fix: 1). If that line is absent while the command exits non-zero: STOP (the gate below cannot fail closed). Then run the sheet's census commands and compare with the sheet's expected lists: **any difference is a STOP** (report it; do not edit the plan by hand).

## 4. Gate G (per commit; run on the commit, from the repo root; any non-zero exit = the commit is not ready)
Tovu, with `FILES` = the sheet's literal test-file list and `ARCH` = the base count from step 0:
```bash
set -euo pipefail
npm run build:server
npm run typecheck
npm run typecheck:tests
npm --prefix apps/desktop run typecheck
npm run check:size
npm run check:complexity
npm run check:hooks
npm run check:errors -- --strict
npm run check:why-comments -- --base "$B"
if npm run check:architecture >"$OUT/arch.txt" 2>&1; then :; else
  n=$(sed -nE 's/^.*[^0-9]([0-9]+) metric\(s\) regressed.*$/\1/p' "$OUT/arch.txt" | head -n 1)
  test -n "$n"
  test "$n" -le "$ARCH"
fi
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks $FILES
(cd apps/desktop && npm run gates)          # the six desktop gates: tree-quiet, tests, typecheck, coverage, complexity, js-backslide
```
Jini, with `PKGS` = the sheet's package list:
```bash
set -euo pipefail
pnpm -r build
pnpm guard
pnpm api:check
pnpm check:size
pnpm check:complexity
pnpm check:hooks
pnpm check:errors
pnpm check:why-comments
for p in $PKGS; do npm --prefix "packages/$p" run test; done
```
Not in G, run once at the end of the sheet and reported (BASE-RED known): Tovu `npm run check:boundaries` (count must not grow vs step 0).

**G-DEP** (a Tovu sheet that makes the desktop main load a new package at runtime). One name per command, both must pass:
```bash
test "$(npm pkg get "dependencies.$NAME" --prefix apps/desktop)" != "{}"
npm ls "$NAME" --prefix apps/desktop >/dev/null
```

**Import gate** (no new script): every T sheet appends the website module it frees to `MOVED_WEBSITE_MODULES` in `apps/desktop/src/dist-import-check.test.ts:111-121`. That test reads every desktop source file and fails on any quoted `../website/src/<module>` specifier, wherever it sits (multiline imports included); it runs inside `npm run gates`. Mutation proof per T sheet: re-add the old import line in a scratch commit -> `(cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/dist-import-check.test.ts)` must fail with test name `no desktop source file imports the website's contracts or daemon exit codes by relative path`; drop the scratch commit.

**Staging check** (T1-T7): `node apps/desktop/scripts/stage-website-shared.ts` prints `bundled N module(s)` and the list; the sheet states the expected N and list. A different list is a STOP.

## 5. Allowed test edits (anything else is a STOP)
(a) import specifiers of moved names, pointed at the new owner's **public** subpath; (b) a `t.mock.module(...)`/`module(...)` call whose target moved to a Jini public subpath: the specifier becomes that subpath and the stub object becomes `{ ...await import("<subpath>"), <stubbed name>: <same stub> }` so every other export of the subpath stays real; plus the paired `await import(...)`; mocked names and every assertion unchanged; proof: make the stub throw -> the test goes RED, restore; (c) comment-only lines naming the old path; (d) the edits a sheet lists by line. A moved test file keeps its test names and assertions byte for byte except import lines.

## 6. Proof levels
T = gate G green on every commit of the sheet (each commit alone, checked out read-only), plus the sheet's mutation proofs. P = packaged: `npm --prefix apps/desktop run stage`, `electron-builder`, `node --experimental-import-meta-resolve apps/desktop/scripts/verify-staged-closure.ts --asar <archive>`, release workflow on macOS and Windows. P for T1-T7 is owed until one Jini release contains J1-J4 (a cold release install resolves `@jini-ai/*` from the registry: `.github/workflows/desktop-release.yml:156-159`). The release workflow calls `npm run stage` (`:87`, `:162`, `:406`); **no sheet in T1-T7 edits the `stage` script, `stage-website-shared.ts`, `electron-builder.yml` or the verifier.**

## 7. Report (last commit of the run, `cloud-results/d0c-v3-<sheet>.md` on the sheet branch)
Start SHA `B`; every pushed SHA; per commit the gate commands and exit codes; mutation proofs (edit, failing test name, restore); census output vs expected; BASE-RED list; what was not run (P).
