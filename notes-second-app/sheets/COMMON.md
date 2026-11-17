# COMMON rules for every notes-second-app sheet

Each sheet is ONE Sonnet run. It inherits everything here. Read `../DESIGN.md` §2, §5, §7 first.

## Revision 2 (2026-11-17): this file and a sheet are ONE contract

A sheet's "Revision 2 corrections" block (top of the sheet) overrides any step below it that it names. If COMMON, a
corrections block and a step still disagree: STOP and report; do not pick one.

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
4. Owner limits inside every file you touch or create: functions <= 50 lines, cyclomatic **and cognitive**
   complexity <= 10, file <= 500 lines, exported functions `(required, optional = {})`, explicit return types.
   Examples are held to the same limits (the repo checker skips `examples/` and allows 80 lines, so check them with
   `node scripts/check-size.mjs --help` first; if it cannot take a path, count with
   `awk` per function and paste the three longest functions per new file in the report).
5. Imports: a Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`; React entries may also import
   `@jini-ai/ui-kit/react` (owner option C); `server` and `cli` are host presets; `sqlite`/`infra` are frozen. Node
   `fs`/lock/process bindings come from the owner-approved new package `@jini-ai/node-adapters` (planned in the xpkg
   plan; it does not exist at the plan's base: a sheet that needs it lists it as a prerequisite). Declared
   dependencies are imported statically.
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
| Jini repo gates (G/D sheets) | `pnpm guard && pnpm typecheck && pnpm check:size && pnpm check:complexity`. (`api:check` and `check:cross-package` are **not** root scripts at the plan's base: `rg -n '"api:check"|"check:cross-package"' package.json` prints nothing. Do not invoke them.) |
| New export | `(cd packages/<consumer> && node --input-type=module -e "await import('@jini-ai/<pkg>/<entry>')")` after `pnpm -r build` |
| Tovu link check (G sheets) | the linked typecheck in Setup |

## STOP conditions (stop, push what is committed, report). `D="git diff $BASE...HEAD"`.

| Stop when | Command that detects it |
|---|---|
| a gate fails and the fix is outside the sheet's file list | the gate's exit code |
| a prerequisite branch, export or decision is missing | the sheet's "Landed check" line; `grep -nE "^\| OD-N<n> .*\| DECIDED: " notes-second-app/INDEX.md` |
| the inventory differs from "expected" (rule 1) | the sheet's inventory commands |
| a step needs a file another lane owns | the sheet's lane list; `git ls-files --error-unmatch <path>` for each file you edit |
| a security test cannot be made to fail by the named mutation | run the mutation once, paste the failure, restore |
| a lazy import, module mock, lint/type escape, barrel or shell appears | `$D \| grep -nE '^\+.*(await import\(\|vi\.mock\(\|jest\.mock\(\|eslint-disable\|@ts-ignore\|@ts-expect-error\|@ts-nocheck)'` and `$D -- '*.ts' '*.tsx' \| grep -nE '^\+\s*export (\*\|\{[^}]*\}) from '` both print nothing |
| a hook is called without being injected | `$D -- '*.tsx' \| grep -nE '^\+.*\buse[A-Z]\w*\('` : every hit is either a React built-in or a prop default (`= useX`), listed in the report |
| a why-comment is lost in a move | `$D \| grep -E '^-\s*(//\|/?\*)' \| sed -E 's/^-\s*//' \| sort -u > /tmp/c.del; $D \| grep -E '^\+\s*(//\|/?\*)' \| sed -E 's/^\+\s*//' \| sort -u > /tmp/c.add; comm -23 /tmp/c.del /tmp/c.add` : every line printed is explained in the report |
| a count the sheet states is stale | re-run the sheet's census command; a different number is reported before continuing |
| you are about to copy more than 10 lines between files instead of moving or importing | review of `$D --stat` against the sheet's move list |
| a test is skipped, weakened or deleted | test counts before/after per touched package; `$D \| grep -nE '^\+.*\.(skip\|only\|todo)\('` prints nothing |

## Report (last message)

Branch, every pushed SHA, base ref + SHA, baseline result, per-step result, gate output summary, test count
before/after for each touched package, out-of-list edits, what was not verified, and for G sheets the deletion
ledger (file, lines removed, why deletable).
