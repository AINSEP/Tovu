# COMMON rules for every notes-second-app sheet

Each sheet is ONE Sonnet run. It inherits everything here. Read `../DESIGN.md` §2, §5, §7 first.

## Revision 2 (2026-11-17): this file and a sheet are ONE contract

A sheet's corrections block (top of the sheet) overrides any step below it that it names. If COMMON, a
corrections block and a step still disagree: STOP and report; do not pick one.

**Revision 3 (2026-11-16, Opus review).** Precedence is now fixed so that a stale step cannot stop a run:
**COMMON > the sheet's corrections blocks (revision 3 over revision 2) > the sheet's step text.** A step that a block
contradicts is **void**: skip it, do not STOP, and list it in the report as "void step". STOP only when a block
contradicts COMMON, the code, or another block. Rewritten in place in revision 3 (block and steps agree): N0, N2, N5,
G1, G7, G19, D1 (D0 is a pointer table); N1, N3, N4, G2, G4, G5, G6, D2 still carry older step text under their blocks.
Coordinator decisions recorded in `../INDEX.md` section 00 apply to every sheet.

## Setup (before reading any source)

```sh
# Checkouts side by side, named exactly `Jini` and `Tovu`, both on the SAME-named integration branch.
cd Jini && git fetch origin && git checkout -B <branch named in the sheet> origin/<BASE>
pnpm install && pnpm -r build
```

`<BASE>` = `integ/merge-final-2026-11-16` if it exists in both repos, else the one of `integ/merge-b-2026-11-16` /
`integ/merge-a-2026-11-16` that contains the sheet's prerequisites (use the sheet's "Landed check"). Never mix
merge-a in one repo with merge-b in the other. Say which, with both SHAs, in the report.

Tovu (only for a sheet with a Tovu step): `npm ci`, then link the exact local Jini build with the repo's own script:
`JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini`, and confirm with `-- --dry-run` that nothing is
left to link. Tovu pins `@jini-ai/*` to registry versions; without the link a Tovu typecheck proves nothing about
your Jini SHA. Then `npm run typecheck` plus `(cd apps/admin && npx tsc --noEmit)` and `(cd apps/site-chat && npx tsc --noEmit)`
for each app the sheet's change can reach. Never run `npm run build` while linked. Never edit Tovu's `@jini-ai/*`
ranges or lockfile (release step, not a sheet).

Green baseline on the unmodified tree for the packages the sheet names (typecheck + tests), pasted in the report.
**A red baseline is a STOP** (report it; do not start), except a characterization test the sheet tells you to add.

## Working rules

1. Run the sheet's **Inventory** commands first and compare with "expected". A mismatch that changes a file list,
   an export name or a signature is a STOP.
2. Tests first, two kinds. A **characterization** test pins what the code does today: it passes on the unmodified
   tree and is committed alone (green). A **red-first** test must fail for the stated reason: run it, paste the
   failure, and commit it only together with the change that makes it pass. Behaviour that is already correct is
   characterized, never "made to fail".
3. One commit per step on the sheet branch, and **every commit there passes the gates below by itself**. Work that
   is not green yet goes to `wip/<sheet-id>` (push it as often as you like; it is the progress signal). Nothing is
   left for a coordinator mid-sheet: a `package.json` `exports` entry ships in the same commit as the file it names,
   together with the caller updates, tests and the deletion of the old copy (move, re-point, delete: one commit).
   `git pull --rebase` before every push; never force-push.
4. Owner limits inside every file you touch or create: functions <= 50 lines (blank and comment lines not counted),
   cyclomatic **and cognitive** complexity <= 10, file <= 500 lines, exported functions `(required, optional = {})`,
   explicit return types. Packages **and examples**. The repo gates do not enforce 50 (`scripts/check-size.mjs:15`
   errors only at 80; 50 is a warning, `:39`; `sourceGlob` covers `packages/*/src` only), so run **block L** below on
   every commit: files you created or moved must pass outright, files you edited may not gain an error.
5. Imports: a Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`; React entries may also import
   `@jini-ai/ui-kit/react` (owner option C); `server` and `cli` are host presets; `sqlite`/`infra` are frozen. Node
   `fs`/lock/process bindings come from `@jini-ai/node-adapters`, which **only xpkg sheet N1** creates and which holds
   **fs/lock/process bindings only** (OD-3, owner, 2026-11-16). Nothing else goes there: no HTTP server adapter (the
   `node:http` bridge already exists as `@jini-ai/http-kit/node-bridge`, see G1). No sheet in this plan needs
   node-adapters today; a sheet that later names a concrete fs/lock/process binding lists N1 as a prerequisite.
   Declared dependencies are imported statically.
6. No barrels, no re-export shells, no forwarders, no "stub left behind". An export-map entry points at the
   implementation file.
7. Errors: plain words plus Copy details; never swallowed (every `catch` answers the caller or reports through the
   injected reporter). No schema change without an ADR-066 TS migration, an N-1 fixture and automatic migration.
   Never a permanent delete. New CSS classes use the `jini-` prefix. New UI strings exist in every locale.
8. Every custom hook a component uses (including `useT` and `useAdminLocale`) is a prop defaulted to the real hook,
   with a fake-hook output test. Tests use fakes of interfaces, never a module mock of another package.
9. No behaviour change outside the sheet's file list. Never edit `pnpm-lock.yaml` by hand, `scripts/*-debt.json`,
   `scripts/injection-*.json`, or any file in Tovu unless the sheet names it.
10. No text, path or identifier from Tovu in Jini. `rg -ni "tovu" <files you touched>` must be empty.

## Gates (run those that apply before every commit on the sheet branch; paste real output)

| Scope | Command |
|---|---|
| Example server | `cd examples/notes-app && pnpm typecheck && node --test 'src/**/*.test.ts' && node scripts/smoke.ts` |
| Example web | `cd examples/notes-web && pnpm typecheck && pnpm test && pnpm build` |
| Example desktop | `cd examples/notes-desktop && pnpm typecheck && pnpm test && pnpm build` |
| Touched Jini package | `npm --prefix packages/<pkg> run typecheck && npm --prefix packages/<pkg> run test` (never a root `npx vitest`). A test moved into a package is rewritten for that package's runner (the packages run Vitest; `node:test` files stay in examples) |
| Jini repo gates (G/D sheets) | `pnpm guard && pnpm typecheck && pnpm check:size && pnpm check:complexity`, then block L. (`api:check` and `check:cross-package` are **not** root scripts at the plan's base: block G checks it. Do not invoke them.) |
| New export | `(cd packages/<consumer> && node --input-type=module -e "await import('@jini-ai/<pkg>/<entry>')")` after `pnpm -r build` |
| Tovu link check (G sheets) | the linked typecheck in Setup |

## STOP conditions (stop, push what is committed, report)

**Revision 3: commands live only in the fenced block below** (a table cell must write `|` as `\|`; copied raw, `git`
gets a `|` argument and BSD `grep -E` matches a literal pipe, so the STOP prints nothing and silently passes).

| # | Stop when | Block |
|---|---|---|
| X1 | a gate fails and the fix is outside the sheet's file list | the gate's exit code |
| X2 | a prerequisite branch, export or decision is missing | the sheet's "Landed check"; X2 |
| X3 | the inventory differs from "expected" (rule 1) | the sheet's inventory commands |
| X4 | a step needs a file another lane or plan owns | the sheet's lane list; X4; `../INDEX.md` section 4 collision table |
| X5 | a security test cannot be made to fail by the named mutation | run the mutation once, paste the failure, restore |
| X6 | a lazy import, module mock, lint/type escape, barrel or shell appears | X6 (prints nothing) |
| X7 | a custom hook is called without being injected (any `.ts`/`.tsx` you created, moved or edited, whole file, multiline imports) | X7 |
| X8 | a why-comment is lost in a move | X8 (every printed line explained) |
| X9 | a count the sheet states is stale | re-run the sheet's census command |
| X10 | you are about to copy more than 10 lines between files instead of moving or importing | `git diff --stat` against the move list |
| X11 | a test is skipped, weakened or deleted | test counts before/after; X11 |
| L | a function, complexity or file limit is broken (rule 4) | L |

```bash
BASE=<the base ref you checked out>; D() { git diff "$BASE"...HEAD "$@"; }
# X2: owner decision gate
grep -nE "^\| OD-N<n> .*\| DECIDED: " notes-second-app/INDEX.md
# X4: every file you edit exists on BASE (a new file is fine) and is not in another lane's list
git ls-files --error-unmatch <path>
# X6: lazy imports, module mocks, escapes; re-export shells
D | grep -nE '^\+.*(await import\(|vi\.mock\(|jest\.mock\(|eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck)'
D -- '*.ts' '*.tsx' | grep -nE '^\+\s*export (\*|(type )?\{[^}]*\}) from '
# X7: hooks. Whole files, multiline-safe, .ts and .tsx; then the repo gate (no new key)
for f in $(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD -- '*.ts' '*.tsx'); do
  rg -n -U -P "import\s+(type\s+)?\{[^}]*\buse[A-Z]\w*[^}]*\}\s+from\s+['\"](?!react['\"])" "$f"
done      # for each imported hook name: rg -n "\b<useName>\(" <file>; a call in a body is a violation, `= useX` prop default is the only allowed use
node scripts/check-hook-injection.mjs
# X8: why-comments lost
T=$(mktemp -d)
D | grep -E '^-\s*(//|/?\*)' | sed -E 's/^-[[:space:]]*//' | sort -u > "$T/del"
D | grep -E '^\+\s*(//|/?\*)' | sed -E 's/^\+[[:space:]]*//' | sort -u > "$T/add"
comm -23 "$T/del" "$T/add"
# X11: skipped tests
D | grep -nE '^\+.*\.(skip|only|todo)\('
# G: the two scripts that are not root scripts (prints nothing)
rg -n '"api:check"|"check:cross-package"' package.json
# L: limits as errors (root eslint.config.mjs registers sonarjs and the TS parser; it does not ignore examples/)
LIMITS='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
esl() { npx eslint --no-inline-config --rule "$LIMITS" "$@"; }
SRC='\.(ts|tsx|mts|cts|js|mjs)$'; TESTS='(__tests__/|\.test\.|\.spec\.|\.d\.ts$)'
NEW=$(git diff --name-only --diff-filter=AR "$BASE"...HEAD | rg "$SRC" | rg -v "$TESTS")
[ -z "$NEW" ] || esl $NEW      # created or moved files: must print nothing ("File ignored" = not checked: STOP)
for f in $(git diff --name-only --diff-filter=M "$BASE"...HEAD | rg "$SRC" | rg -v "$TESTS"); do   # edited files may not gain an error
  b=$(git show "$BASE:$f" | esl --stdin --stdin-filename "$f" | rg -c '^\s+[0-9]+:[0-9]+\s+error\s' || true)
  h=$(esl "$f" | rg -c '^\s+[0-9]+:[0-9]+\s+error\s' || true)
  [ "${h:-0}" -le "${b:-0}" ] || echo "GREW $f: ${b:-0} -> $h"
done
```

## Report (last message)

Branch, every pushed SHA, base ref + SHA, baseline result, per-step result, gate output summary, test count
before/after for each touched package, out-of-list edits, what was not verified, and for G sheets the deletion
ledger (file, lines removed, why deletable).
