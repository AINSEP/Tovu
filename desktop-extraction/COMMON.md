# COMMON: rules every desktop-extraction sheet inherits (read first, then your sheet)

Planning only; nothing here was built, typechecked or run. Written 2026-11-17 (UTC). **Revised 2026-11-17 (round 2)**
after the Codex judge review; re-checked on Tovu `integ/merge-b-2026-11-16` @ `450ac748` (the held desktop patch is
now committed there, so `apps/desktop` on merge-b is the desktop-args form) and `integ/merge-a` @ `e801e9ae`; Jini
merge-b @ `9c982fd9`. A sheet and this file are one contract: where they disagree, STOP and report both lines.
**Revision 3 (2026-11-16, Opus review):** `integ/merge-final-2026-11-16` now exists (Tovu `f70017dc`, Jini `65d73b0d`); the facts re-checked in revision 3 cite it. It becomes BASE only when the six desktop gates are green on it **without** `--no-verify` (INDEX P0).

## 1. Base (what the counts were measured on)

No pushed branch held the whole desktop state when this plan was written, so a **local reading tree** was assembled and never pushed:

| Part | Source |
|---|---|
| Tovu, everything except `apps/desktop` | `integ/merge-b-2026-11-16` @ `dd70b057` |
| Tovu `apps/desktop` | `integ/merge-a-2026-11-16` @ `f354cfbd` (holds `fix/desktop-waveb`) **plus** `cloud-results/merge-b-desktop.patch` from merge-b (holds `refactor/desktop-args` and the security dependency bumps), applied with `git apply --3way` |
| Jini | `integ/merge-b-2026-11-16` @ `674a19ea` (merge-a @ `96aade8c` differs in `desktop-host` only by the same `electron/app-version.ts`) |

The patch conflicts with merge-a in **13 files** (11 tests, `src/main/index.ts`, `src/main/updates/desktop-updater.ts`); for those 13 the merge-a side was read. `integ/merge-final-2026-11-16` did not exist.

**Your base (call it BASE)** is the Tovu branch that contains merge-a, merge-b **and** the desktop patch with those 13 conflicts resolved (INDEX prerequisite P0), and the matching Jini merge branch. If BASE does not exist yet: **STOP**, report, do nothing.

## 2. First commands (before reading source)

```
# Jini (checkout must be named exactly `Jini`, beside Tovu)
cd ../Jini && pnpm install --config.prefer-workspace-packages=true && pnpm -r build
# Tovu
cd ../Tovu && npm ci && npm --prefix packages/contracts run build && npm ci --prefix apps/desktop
cd apps/desktop && npm run build && npm run typecheck      # record as the baseline
# the full desktop test suite is NOT run on this machine: use the last cloud gate run on BASE as the test baseline (S1)
```
A red baseline is **reported, not fixed**. Record both repo SHAs. Then run your sheet's **Inventory** block and compare with the sheet's numbers; a difference of more than the stated tolerance, or a file the sheet does not name: **STOP** and report.

## 3. STOP conditions (each has the command that detects it; `B` = your starting SHA)

**Revision 3 (Opus review): every command is in the fenced blocks below the table, never inside the table.** A table cell must escape `|` as `\|`, and a command copied from the raw file then passes a literal `\|` (git gets a path argument, `rg`/`grep -E` match a literal pipe) and prints nothing, so the STOP silently passes. Copy commands from the fenced blocks only. Run them from the repository root of the repo you changed (Jini or Tovu), with `B` set first.

| # | Mistake a build run already made | Rule (command: block of the same number below; it must print nothing unless stated) |
|---|---|---|
| S1 | Red commit, "fixed forward" | Work in progress goes to `wip/desktop-x/<sheet>` (push every 5-10 min, red allowed, never merged). The lane branch `desktop-x/<sheet>` gets a step only after its gate passes, and every lane commit is proven green alone before the push with `git rebase --exec`. The gate is the script in block S1 under `set -e`: build (`npm run build:server`: contracts, host-shared, sdk, root `tsc` to `dist/`) + typecheck (root, e2e, desktop, tests) + the desktop build + the tests of the files the commit changed (owner rule: only changed files locally). A gate that is a one-line `A && T=$(...); [ -z "$T" ] || ...` chain is wrong: it exits 0 when `A` fails; the full desktop suite runs once per wave in the cloud gate run (INDEX section 5), never on this machine. A failure not in the baseline stops the rebase: fix on wip, rebuild the lane commit. |
| S2 | Custom hook imported, not injected | Every `.ts`/`.tsx` file you created, moved or edited, whole file (not only added lines, multiline-safe): a **call** of an imported `use*` name inside a component or hook body is a violation; the only allowed use is as the default value of a prop/option. Plus the repo's hook gate with no new key. Includes `useT`, `useAdminLocale`, kit hooks. |
| S3 | Lazy import of a declared dependency | No **new** runtime `import()` call, `createRequire(` or `loadOptionalPeer`. Counted on the TypeScript syntax tree, so type-position `typeof import("x")`, `x: import("x").T` and JSDoc `{@link import(...)}` are not counted (the round-2 regex counted about 28 such lines on the desktop; the real runtime `import()` calls are the 8 sites D0e owns). A missing module is fixed by **declaring the dependency** in `package.json`, never by deferring the import. `electron-updater` stays a static import. A run that **moves** a file containing one of the existing sites stops unless its sheet names that site. |
| S4 | Re-export shell left at the old path | The old file is **deleted** and every importer repointed in the same commit. A pre-existing alias line in a real module (for example `apps/admin/src/lib/assistant-subagents.ts:3`) that is only repointed is listed in the report with its line at `B`. |
| S5 | `vi.mock` / `mock.module` of another package's file | Tests pass a fake that implements the port type. |
| S6 | Why-comments dropped in a move | By content, not count; every printed line needs a reason in the report. |
| S7 | Stale counts | the sheet's Inventory block (section 2). A sheet whose Inventory is its "Measured" table (D3-D6) runs block S7. |
| S8 | Test weakened or deleted | Report `# tests` / `# pass` before and after (desktop `node --test` prints both; Jini vitest prints `Tests N passed`). A moved test moves with its file; none is dropped. |
| S9 | Limits broken inside a new or grown file | Functions <= 50 lines (blank and comment lines not counted), cyclomatic complexity <= 10, cognitive complexity <= 10, file <= 500. **The repo gates do not enforce 50**: Jini `check:size` errors only at 80 (`scripts/check-size.mjs:15` sets `max-lines-per-function: 80`; 50 is a warning, `:39`), and Tovu's ratchets compare against debt lists. So block S9 runs ESLint with the limits as errors: files created or moved by the run must pass outright; files edited in place may not gain an error. Also run the repo gates (Tovu `npm --prefix apps/desktop run gates`, root `npm run check:size && npm run check:complexity`; Jini `pnpm check:size && pnpm check:complexity`, `package.json:27-28` on merge-final; `pnpm guard` checks boundaries and neutrality only). No new debt entry; a moved file's old debt key is **deleted** in the same commit. A function that is over a limit **before** the move is split in its own commit first (the sheet names them). |
| S10 | Package rule broken | Jini: no new import of another `@jini-ai/*` package than `core`/`protocol`. Approved exceptions, applied before planning (lesson 27; owner rules in the round-2 brief): React entries may import `@jini-ai/ui-kit/react` (option C); host presets `server`/`cli`; `sqlite`/`infra` frozen; `@jini-ai/node-adapters` (kind `runtime-adapter`) may import `@jini-ai/platform`, and only a host, a preset or an example may import it (xpkg N1's gate rule). No `express`/`fastify`/`hono` import in any Jini domain package. **No new package directory.** `@jini-ai/node-adapters` is created only by xpkg sheet **N1** (`plan/xpkg-lane-sheets-2026-11-16`, wave 0b); this plan adds subpaths to it, never creates it, and puts only fs/lock/process bindings in it (OD-3, decided 2026-11-16). No `desktop-*` package. |
| S11 | Pre-push gate bypassed | never `--no-verify`. If the desktop hook cannot run here (no Electron binary), push the Jini branch, save the Tovu desktop commits as `cloud-results/desktop-extraction/<sheet>.patch` on a docs-only branch, and say so first in the report. |
| S12 | Export-map entry that does not build | for every `exports` key you add, from a host that depends on it, in the commit that adds the key. Add the same key to `jini.entries` with its runtime; `pnpm guard` must pass. |

```bash
B=<your starting SHA>            # set once; every block below uses it
SRC='\.(ts|tsx|mts|cts|js|mjs)$'; TESTS='(__tests__/|\.test\.|\.spec\.|\.d\.ts$)'

# S1: gate each lane commit. GATE = build + typecheck (root, e2e, desktop) + the changed files' tests, all under `set -e`.
# The earlier one-liner `A && T=$(...); [ -z "$T" ] || (...)` exited 0 when typecheck FAILED (the `&&` skipped the
# assignment, `T` stayed empty, and `[ -z "$T" ]` then short-circuited the test step to success) and it never built,
# so a red commit passed. Found 2026-11-18 by the d0c-verify-fix run, which re-checked every D0c commit by hand.
GATE="${TMPDIR:-/tmp}/tovu-commit-gate.sh"
cat > "$GATE" <<'GATE_EOF'
#!/usr/bin/env bash
set -euo pipefail                                   # any failing step fails the whole gate
cd "$(git rev-parse --show-toplevel)"
# Stale dist must not satisfy an import whose source this commit deleted or moved.
rm -rf packages/contracts/dist packages/host-shared/dist packages/sdk/dist dist/src apps/desktop/dist
npm run build:server                                # contracts, host-shared, sdk, root tsc into dist/, runtime assets
npx tsc -p tsconfig.json --noEmit                   # root + website
npx tsc -p development/tsconfig.e2e.json --noEmit
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run build                 # preload + renderer
NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit
# Tests: every changed test file, plus the test beside each changed desktop source file. `|| true` keeps a missing
# sibling test from failing the list under pipefail; the test commands below are the only thing that may fail it.
CHANGED=$(git diff --name-only --diff-filter=AMR HEAD~1 HEAD)
DESK=$(for f in $CHANGED; do case "$f" in
  apps/desktop/src/*.test.ts|apps/desktop/src/*.test.tsx) echo "$f";;
  apps/desktop/src/*.ts|apps/desktop/src/*.tsx) t="${f%.*}.test.${f##*.}"; [ -f "$t" ] && echo "$t" || true;;
esac; done | sed 's#^apps/desktop/##' | sort -u)
ROOT=$(for f in $CHANGED; do case "$f" in
  apps/desktop/*) ;;
  *.test.ts|*.test.tsx|*.test.mjs) [ -f "$f" ] && echo "$f" || true;;
esac; done | sort -u)
REND=$(echo "$DESK" | grep '^src/renderer/' || true); MAIN=$(echo "$DESK" | grep -v '^src/renderer/' || true)
if [ -n "$MAIN" ]; then (cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test $MAIN); fi
if [ -n "$REND" ]; then (cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test $REND); fi
if [ -n "$ROOT" ]; then TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks $ROOT; fi
GATE_EOF
git rebase --exec "bash $GATE" "$B"                 # stops at the first red commit
# Prove the gate once before trusting it: break one typecheck on purpose (for example a bad import in a scratch file the
# root tsconfig includes) and confirm `bash "$GATE"` exits non-zero and the rebase stops.
# Jini example (one package): git rebase --exec 'pnpm --filter @jini-ai/<pkg> build && pnpm --filter @jini-ai/<pkg> exec vitest run --changed HEAD~1' "$B"
# (renderer tests use the desktop's second runner: node --import ./scripts/one-react.ts --import tsx --test <files>)

# S2: hooks
for f in $(git diff --name-only --diff-filter=ACMR "$B"..HEAD -- '*.ts' '*.tsx'); do
  rg -n -U -P "import\s+(type\s+)?\{[^}]*\buse[A-Z]\w*[^}]*\}\s+from\s+['\"](?!react['\"])" "$f"
done   # for each hook name printed: rg -n "\b<useName>\(" <file>  -> a call in a body is a violation
node scripts/check-hook-injection.mjs          # Jini (Tovu: npm run check:hooks); no new key

# S3: lazy imports (runtime import() calls on the syntax tree; prints "<call>\t<file>:<line>")
lazy() { node --input-type=module -e '
import ts from "typescript"; import { readFileSync } from "node:fs";
for (const f of process.argv.slice(1)) {
  const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const walk = (n) => { if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)
    console.log(n.getText(sf).replace(/\s+/g, " ") + "\t" + f + ":" + (sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1));
    ts.forEachChild(n, walk); };
  walk(sf);
}' "$@"; }
S3() {   # usage: S3 <dirs the run touched>, e.g. S3 apps/desktop/src apps/desktop/bin   or   S3 packages/sidecar/src
  T=$(mktemp -d); git archive "$B" -- "$@" | tar -x -C "$T"
  lazy $(cd "$T" && rg --files "$@" -g '*.{ts,tsx,mts,cts,js,mjs}' -g '!*.test.*' | sed "s#^#$T/#") | cut -f1 | sort > "$T/.before"
  lazy $(rg --files "$@" -g '*.{ts,tsx,mts,cts,js,mjs}' -g '!*.test.*') | cut -f1 | sort > "$T/.after"
  comm -13 "$T/.before" "$T/.after"            # new runtime import() calls: must print nothing
}
git diff "$B"..HEAD | rg -n '^\+.*(loadOptionalPeer|createRequire\()'          # must print nothing
lazy $(rg --files apps/desktop/src apps/desktop/bin -g '*.{ts,tsx,mts,cts}' -g '!*.test.*')   # census of existing sites (D0e list; 8 on merge-final)

# S4: re-export shells
git diff "$B"..HEAD | rg -n '^\+\s*export (\*|(type )?\{[^}]*\}) from'
# S5: mocks of another package's file
git diff "$B"..HEAD | rg -n "^\+.*(vi\.mock|mock\.module)\(['\"](@jini-ai/|@tovu/|(\.\./)+website/)"
# S6: why-comments (one pair per moved file)
diff <(git show "$B":<old file> | rg '^\s*(//|/?\*)' | sed -E 's/^[[:space:]]*//' | sort) \
     <(rg -I '^\s*(//|/?\*)' <new file(s)> | sed -E 's/^[[:space:]]*//' | sort)
# S7: Measured-table inventory (D3-D6): every file in the sheet's table, with the line count it states
wc -l <each file named in the sheet's Measured table>     # missing file, or > 5 % off the stated count: STOP
# S8: weakened tests
git diff "$B"..HEAD | rg -n '^\+.*(\.skip\(|\.todo\(|toBeDefined\(\)|istanbul ignore|c8 ignore)'

# S9: function <= 50 (blank/comment lines skipped), complexity <= 10, cognitive <= 10, file <= 500
LIMITS='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
esl() { npx eslint --no-inline-config --rule "$LIMITS" "$@"; }             # Jini: root eslint.config.mjs registers sonarjs + TS parser
# Tovu: esl() { npx eslint --no-config-lookup --config development/scripts/complexity-eslint.config.mjs --no-inline-config --rule "$LIMITS" "$@"; }
NEW=$(git diff --name-only --diff-filter=AR "$B"..HEAD | rg "$SRC" | rg -v "$TESTS")
[ -z "$NEW" ] || esl $NEW       # (a) created or moved files: must print nothing; a "File ignored" warning = not checked: STOP
for f in $(git diff --name-only --diff-filter=M "$B"..HEAD | rg "$SRC" | rg -v "$TESTS"); do   # (b) edited files may not gain an error
  b=$(git show "$B:$f" | esl --stdin --stdin-filename "$f" | rg -c '^\s+[0-9]+:[0-9]+\s+error\s' || true)
  h=$(esl "$f" | rg -c '^\s+[0-9]+:[0-9]+\s+error\s' || true)
  [ "${h:-0}" -le "${b:-0}" ] || echo "GREW $f: ${b:-0} -> $h"
done
git diff "$B"..HEAD -- '*debt*.json' | rg '^\+' | rg -v '^\+\+\+'           # no new debt entry

# S10: package rule (Jini; new lines only)
git diff "$B"..HEAD -- 'packages/*/src' | rg -n -P "^\+.*from ['\"]@jini-ai/(?!core['\"/]|protocol['\"/])"   # each line must be an approved exception
git diff --name-only --diff-filter=A "$B"..HEAD -- 'packages/*/package.json'   # a new package: STOP

# S12: each added export key (run from a host that depends on it)
node -e "import('@jini-ai/<pkg>/<entry>').then(m=>console.log(Object.keys(m).length))"
```

## 4. Rules in force (acceptance criteria)

- Dependencies arrive through **typed ports** as arguments. Exported functions take `(required, optional = {})`.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. `desktop-host` has **no** `electron` dependency: Electron objects are passed in as structurally typed ports (as `speech/speech-ipc.ts` does).
- No new `desktop-*` package. Node bindings of ports (process observation and signalling, file locks) go to `@jini-ai/node-adapters` (created by xpkg N1 only; fs/lock/process bindings only, OD-3 decided 2026-11-16); a domain package declares the port and never imports it. Homes: `desktop-host` subpaths, `sidecar`, `platform/fs`, `ui`, `chat`, `diagnostics`, `devops/packaging/electron`.
- New entry files are real modules (the `sidecar` pattern: `"./supervisor" -> supervision/supervisor.js`), not barrels.
- **Windows is a target.** Any process, path or signal code needs a Windows branch and a test that runs with `platform: 'win32'` injected. No `ps`, no POSIX-only signal as the only path. Where today's Windows branch is "unknown, do nothing" (orphan identity, D3b), a move keeps that behaviour, says so as a stated limit, and owes a manual Windows check; changing it is its own owner decision (OD-5b).
- Errors: plain words for the user plus a details field; typed errors at module boundaries; no `catch {}`.
- Security text in commits, sheets and reports: **class and location only** (the repositories are public).
- Port bindings are checked for **behaviour**: argument order, object versus positional, which object a field sits in. Each sheet names the binding lines and the test that fails when an argument is dropped.

## 5. Cross-repo pairs and git

- A step that changes something Tovu calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against (link with Tovu's `development/scripts/link-jini.mjs`).
- **Landing unit (round-1 judge finding 7).** A commit contains everything it needs to install and build: manifests, export-map and `jini.entries` keys, **and the lockfile produced by `pnpm install` / `npm install`** (never hand-edited, never left for a coordinator). After `git pull --rebase` re-run the install instead of merging a lockfile by hand.
- **Linked proof is T only.** `npm run release:inputs` (`apps/desktop/package.json:22`) refuses a linked Jini, and unlinking restores the *registry* packages, which do not contain a new export. So level P needs the Jini half **published**: the Jini lane is merged, a snapshot/prerelease version is published by the release owner (INDEX OD-10), and the Tovu commit pins that version in `apps/desktop/package.json` (and the root, if it declares it) with its lockfile. Until then the report says "T passed on linked Jini `<sha>`; P owed, waiting for published `<version>`" and the sheet is not done.
- Branches: `wip/desktop-x/<sheet>` and `desktop-x/<sheet>` in each repo (S1). Commit by explicit paths. `git pull --rebase` before every push; never force-push.
- `development/scripts/size-debt.json`: you may only **delete** keys for files you removed or brought under the limit.
- Shared with other programmes (check `git log -5 -- <file>` at start; if it moved since BASE, re-run Inventory): `apps/desktop/src/desktop-agent.ts` (daemon R7 and R8), `apps/desktop/src/main/index.ts` (every D sheet adds or removes wiring lines here; one sheet at a time), `apps/desktop/electron-builder.yml`, `packages/sidecar/src/supervision/supervisor-node.ts` and `json-file.ts` (xpkg R11b).

## 6. Proof levels (named per sheet in INDEX section 5)

| Level | What it means | Who can run it |
|---|---|---|
| T | typecheck + unit tests + `npm run gates` | any run |
| P | packaged proof, in this order, on an **unlinked** tree pinned to the published Jini version: (1) `npm --prefix apps/desktop run stage`; (2) package (`electron-builder`, as the `package` script does after `gates`, `build`, `stage`); (3) audit the **built archive**: `node --experimental-import-meta-resolve scripts/verify-staged-closure.ts --asar <archive>` from `apps/desktop` — the script throws without `--asar` (`:32-34`), and `createNodeRuntimeResolver` throws "staged closure needs node --experimental-import-meta-resolve" without the flag (`@jini-ai/devops` `staged-closure-node.ts`; `verify-package.ts:49` passes it): the flag is mandatory on every manual run. It reads the archive's sibling resource directories. `<archive>` = `app.asar` in the packaged app's resources directory: macOS `<out>/mac*/<App>.app/Contents/Resources/app.asar`, Windows `<out>/win-unpacked/resources/app.asar`, `<out>` = `directories.output` in `electron-builder.yml` (print the path you used); (4) the `build` job of `.github/workflows/desktop-release.yml` on macOS **and** Windows (`verify-package`, `smoke-native`, `smoke-bridge`). Every run that moves a module the packaged main process or child loads at runtime owes steps 1-3, not only D0c2. | needs a machine with Electron; CI or owner |
| E | a look at the running Electron app (screenshots at 2x, light and dark) for the screens the sheet lists | owner machine or a run with a display |

A sheet marked P or E is **not done** at T. Its report says "T passed; P/E pending" and lists the exact screens or smokes still owed.

## 7. Report (last commit of every run)

`cloud-results/desktop-extraction/<sheet>.md`: DONE / PARTIAL / STOPPED; both SHAs and branches; each step done or skipped with the reason; Inventory differences; test counts before/after; comment-line counts before/after; each S1 to S12 command with its output; lines moved (old file, new file, count); debt keys deleted; shared files edited (manifests, lockfiles); what the sheet got wrong; proof level reached.
