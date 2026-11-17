# COMMON-ADMIN: rules every admin-UI sheet inherits (read first, then your sheet)

Planning only. Nothing here was executed. Written 2026-11-17 against Tovu `integ/merge-a-2026-11-16` @ `f354cfbd`
and Jini `integ/merge-a-2026-11-16` @ `96aade8c`. Every count in every sheet is from those two commits.
Three other branches change `apps/admin` and were NOT merged into what I read (INDEX section 2): re-measure on the
branch you are given.

Also read, and obey, the xpkg `COMMON.md` (branch `plan/xpkg-lane-sheets-2026-11-16`,
`ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/sheets-2026-11-16/COMMON.md`). Where the two differ,
this file wins for admin sheets.

## 0. First commands (before reading any source)
```
# Jini (checkout must be named exactly Jini, beside Tovu)
pnpm install --config.prefer-workspace-packages=true && pnpm -r build
pnpm guard && pnpm typecheck                      # baseline; red baseline is REPORTED, not fixed
npm --prefix packages/<pkg> run test              # each package you will touch; record the test count
# Tovu
npm ci && npm run link:jini                       # link to the Jini checkout you just built
npm --prefix apps/admin run typecheck
cd apps/admin && npx vitest run <the feature's __tests__ folders>   # record the test count
npm run check:hooks && npm run check:size && npm run check:complexity && npm run check:boundaries
```
Then the stale-count guard. `inventory.tsv` has one row per admin file with its line count and git blob:
```
awk -F'\t' '$5=="<area>"{print $1"\t"$4}' admin-ui-extraction/inventory.tsv | while IFS=$'\t' read p b; do
  [ "$(git rev-parse --short=10 HEAD:apps/admin/src/$p 2>/dev/null)" = "$b" ] || echo "CHANGED $p"; done
```
Every `CHANGED` or missing file: re-read it and write the difference into your report before editing. If more than a
third of an area's files changed (this WILL happen for `f/posts` once size-05 merges, and for `c/AssistantDock`,
`f/members`, `f/users`, `f/sites` once merge-b merges): **STOP**, report, do not improvise a new plan.

## 1. Destination shape in Jini (owner rules; these are acceptance criteria)
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. React entries may also import
  `@jini-ai/ui-kit/react`. Nothing else: not `@jini-ai/ui`, not `@jini-ai/admin`, not another domain package.
  Check after every step: `pnpm guard` and
  `rg -n "from ['\"]@jini-ai/(?!core|protocol|ui-kit/react)" -P packages/<pkg>/src -g '!**/__tests__/**'` prints nothing new.
- A screen is an admin module of its owner: `defineAdminModule` + `adminPort` from `@jini-ai/core/contracts/admin-module`
  (exists, 115 lines). Precedent to copy: `packages/user-management/src/admin/` (`roles.module.ts`, `controllers/`,
  `adapters/`, `conformance/`, `react/{pages,tabs,components,hooks}`, `messages.en.ts`, `ports.ts`).
- Everything the screen needs from the host arrives as a typed port (`requires` on the module) or a kit slot. The
  owner package declares the port/kit interface; the host implements it in
  `apps/admin/src/integrations/jini-admin/<domain>-ports.ts`. No host type is imported by Jini.
- **Hooks are props.** Every custom hook a component calls (including `useT`, `useAdminLocale`, kit hooks, UI-chrome
  hooks) is a prop defaulted to the real hook. Each component gets one fake-hook output test: render with fake hooks
  returning fixed values, assert the rendered output, and assert the real hook was not called.
  Gates: Jini `node scripts/check-hook-injection.mjs`; Tovu `npm run check:hooks`. A moved component must not appear
  in either baseline. Never run `--update` to add entries; only to remove the ones you retired.
- **Classes.** Jini markup uses `jini-` prefixed class names only. The host styles them. When a moved component
  carried a Tovu class, rename it to `jini-<domain>-<name>` in the component and in the host CSS **in the same pair of
  commits**, and list every renamed selector in the report. Never copy host CSS into Jini.
  `rg -n "className=\"(?!jini-)" -P packages/<pkg>/src/<path>` prints nothing for moved files.
- **Copy.** Screen text is `t('Full English sentence.')`. The owner package ships `messages.en.ts` (the key list);
  the dictionaries stay in Tovu at `apps/admin/src/features/<x>/<x>-i18n.ts` (precedent: seo, comments, forms; INDEX
  D-2). The host test `<x>-i18n-parity.unit.test.ts` (copy `features/seo/__tests__/seo-i18n-parity.unit.test.ts`)
  must list all 20 translated locales and fail for a key missing in any of them. English makes 21. A key you add
  must be translated in all 20 in the same commit; a machine translation is marked in the report for owner review.
- Limits measured inside every file you create or grow: function <= 50 lines (hooks and components are judged per
  file by the repo gate), complexity <= 10, file <= 500 lines, exported functions take `(required, optional = {})`.
  No barrels, no `export * from`, no re-export left at an old path.
- Errors shown to the user: plain words plus a "Copy details" control (use the kit `Notice` the precedent uses).
- No permanent deletes: a delete action in a moved screen keeps going through the trash port it uses today.
- Motion: never gate an animation off on small screens. A `@media (max-width …)` or `matchMedia` branch that removes
  motion is a STOP. `prefers-reduced-motion` handling stays exactly as it is.
- Why-comments move with the code. Report `rg -c "^\s*(//|/?\*)" <file>` before and after for every moved file.
- Security: both repos are public. Describe any security-relevant change by class and location only.

## 2. Step discipline (each of these was broken by an earlier build run; each is a STOP)
| Rule | Command that proves it |
|---|---|
| Every commit is green alone; no "fix forward" | after each commit: `pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test` (Jini) or `npm --prefix apps/admin run typecheck && npx vitest run <folders>` (Tovu) |
| Tests first | the sheet's test table is written and shown RED (new behaviour) or GREEN-then-RED-under-the-named-mutation (characterization) before the production edit; paste both runs |
| No lazy import of a declared dependency | `git diff <base> -- packages apps | rg "^\+.*(await import\(|loadOptionalPeer)"` prints nothing |
| No re-export shell | `git diff <base> | rg "^\+\s*export (\*|\{[^}]*\}) from"` prints nothing outside a package's single public entry file |
| No `vi.mock` of another package's file | `git diff <base> | rg "^\+.*vi\.mock\(['\"]@(jini-ai|tovu)/"` prints nothing |
| No weakened or deleted test | report test count before/after per package and per admin feature; a deleted `it(` needs its new location named |
| No new suppression | `git diff <base> | rg "^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|as any|as unknown as)"` prints nothing |
| Export-map entries exist when introduced (lesson 25) | every new `exports` key in a `package.json` resolves after `pnpm --filter @jini-ai/<pkg> build`: `node -e "import('@jini-ai/<pkg>/<subpath>')"` from `examples/minimal-host` |
| Debt does not follow moved code silently (lesson 10) | remove the moved file's keys from Tovu `development/size-debt.json`, `development/src-complexity-debt.json`, `development/hook-injection-debt.json` in the commit that deletes the file; never add a key to a Jini debt file |

## 3. Cross-repo pairs
A screen move is at least two commits: one Jini commit that adds the module (green alone, nothing consumes it yet),
then one Tovu commit that binds it, repoints the panel, deletes the Tovu copy and its tests that moved. The Tovu commit
message names the Jini SHA it was checked against. Tovu is typechecked and tested linked to that SHA.
The Tovu commit is the only place a screen changes for users, so it is the unit of the Chrome check.

Coordinator-only files (report the exact lines; do not edit): Jini `packages/core/package.json`, `pnpm-lock.yaml`,
`scripts/*-debt.json` additions; Tovu `apps/admin/src/main.tsx`, `apps/admin/src/integrations/jini-kits.ts`,
`apps/admin/src/panels.tsx` (51 panels, every screen sheet touches one entry: report the line, the coordinator
applies it, or the coordinator runs screen sheets serially on this file).

## 4. Chrome visual check (for every sheet marked YES)
A unit test cannot see a broken layout. After the Tovu commit, on a real running admin (not jsdom):
1. Before the move, on the base commit, capture the screen: list view, editor/detail view, each dialog, each tab;
   in the `classic` and `glass` admin themes; light and dark; at 1440 px and 390 px wide.
   Save under `cloud-results/admin-ui/<sheet>/before/`.
2. After the move, capture the same set under `after/`. Compare side by side.
3. Also check by hand: keyboard focus order through the screen, the mobile drawer opens and animates, a failing
   request shows the plain-words error with "Copy details", and the network log shows no extra request per action
   compared with the before run (count requests for: open screen, save, delete).
4. A difference you cannot explain as an intended class rename is a failure: revert the Tovu commit, report.
If you have no browser in your environment, say so in the first line of the report and mark the sheet
`MOVED, NOT VISUALLY CHECKED`. Do not claim it works.

## 5. Report (last commit: `cloud-results/admin-ui/<sheet>.md`)
DONE / PARTIAL / SKIPPED; both repo SHAs; every pushed commit; each step done or skipped with the reason; test
counts before/after; debt keys retired; coordinator lines; renamed selectors; new or changed copy keys; checks run,
each error classified LANE-CAUSED / PRE-EXISTING / ENV; what the sheet got wrong.

## 6. Git
Branch `admin-ui/<sheet>` in each repo. Commit by explicit paths. `git pull --rebase` before every push; never
force-push. Push after every step (5-10 minutes). Commit first, verify, then commit fixes; never withhold work
because a check is red, and say plainly that it is red.
