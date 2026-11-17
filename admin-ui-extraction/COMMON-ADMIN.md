# COMMON-ADMIN: rules every admin-UI sheet inherits (read first, then your sheet)

Planning only. Nothing here was executed. Written 2026-11-17 against Tovu `integ/merge-a-2026-11-16` @ `f354cfbd`
and Jini `integ/merge-a-2026-11-16` @ `96aade8c`; **revised 2026-11-17 (round 2)** against Tovu merge-a @ `e801e9ae`
(4 admin files differ from `f354cfbd`, none in a sheet's file list) and Jini merge-a @ `dde69a6d`, with merge-b
(Tovu `450ac748`, Jini `9c982fd9`) read for the dock. `integ/merge-final-2026-11-16` did not exist.
Other branches change `apps/admin` and were NOT merged into what I read (INDEX section 2): re-measure on the
branch you are given.

**One contract.** A run is `cat COMMON-ADMIN.md [T-SCREEN.md] <sheet section>`. Where a sheet and this file
disagree, STOP and report the two lines; do not pick one. There are **no coordinator-only files** any more
(round-1 judge blocker 3): a run edits every file its own commit needs to be green, section 3 says how shared
files are kept safe.

Also read, and obey, the xpkg `COMMON.md` (branch `plan/xpkg-lane-sheets-2026-11-16`,
`ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/sheets-2026-11-16/COMMON.md`). Where the two differ,
this file wins for admin sheets.

## 0. First commands (before reading any source). `$T` = the Tovu checkout, `$J` = the Jini checkout
Every command names its directory. Never rely on a previous `cd`.
```
# Jini (checkout must be named exactly Jini, beside Tovu)
(cd $J && pnpm install --config.prefer-workspace-packages=true && pnpm -r build)
(cd $J && pnpm guard && pnpm typecheck)            # baseline; a red baseline is REPORTED, not fixed
npm --prefix $J/packages/<pkg> run test            # each package you will touch; record the test count
# Tovu
(cd $T && npm ci && npm run link:jini)             # link to the Jini checkout you just built
npm --prefix $T/apps/admin run typecheck
npm --prefix $T/apps/admin run test -- <the feature's __tests__ folders, relative to apps/admin>   # record the count
(cd $T && npm run check:hooks && npm run check:size && npm run check:complexity && npm run check:boundaries)
```
Admin tests always run through `npm --prefix $T/apps/admin run test -- <paths>` (that is `vitest run` with
`apps/admin/vitest.config.ts`, which supplies the globals and the React setup). A bare `npx vitest` from the repo
root uses no admin config and fails misleadingly: never use it.

Then the stale-base guard. `inventory.tsv` has one row per admin file with its line count and git blob. It checks
**both** directions (changed rows and files the inventory does not know):
```
cd $T
awk -F'\t' '$5=="<area>"{print $1"\t"$4}' admin-ui-extraction/inventory.tsv | while IFS=$'\t' read p b; do
  [ "$(git rev-parse --short=10 HEAD:apps/admin/src/$p 2>/dev/null)" = "$b" ] || echo "CHANGED $p"; done
comm -13 <(awk -F'\t' '$5=="<area>"{print $1}' admin-ui-extraction/inventory.tsv | sort) \
         <(git ls-tree -r --name-only HEAD apps/admin/src/<area-folder> | sed 's|^apps/admin/src/||' | sort) | sed 's/^/NEW /'
```
Every `CHANGED`, missing or `NEW` file: read it and write the difference into your report before editing. If more
than a third of an area's files are CHANGED or NEW (this WILL happen for `f/posts` once size-05 merges, and for
`c/AssistantDock`, `f/members`, `f/users`, `f/sites` once merge-b merges): **STOP**, report, do not improvise.

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
  Gates: Jini `node scripts/check-hook-injection.mjs`; Tovu `npm run check:hooks`. Both are **count ratchets keyed
  `Component::hook`** (`scripts/check-hook-injection.mjs:41-47`), so a debt-bearing component moved unchanged between
  packages passes them. The real check for a moved file set is therefore by file, on both baselines:
  `node -e "const d=require('./scripts/hook-injection-debt.json');const hit=Object.entries(d.entries??d).filter(([k,v])=>(v.files??[]).some(f=>process.argv.slice(1).some(p=>f.startsWith(p))));console.log(hit.map(([k])=>k).join('\n')||'CLEAN')" <new folder> <old folder>`
  after `node scripts/check-hook-injection.mjs --update` must print `CLEAN` (same one-liner on Tovu's
  `development/hook-injection-debt.json`). `--update` may only shrink the file: `git diff --stat` on a debt file
  shows deletions only, else STOP.
- **Classes.** Jini markup uses `jini-` prefixed class names only. The host styles them. When a moved component
  carried a Tovu class, rename it to `jini-<domain>-<name>` in the component and in the host CSS **in the same pair of
  commits**, and list every renamed selector in the report. Never copy host CSS into Jini.
  Two checks, because a regex cannot see expression-valued class names: (1)
  `rg -n "className=\"(?!jini-)" -P packages/<pkg>/src/<path>` prints nothing; (2) each component's fake-hook output
  test ends with `for (const el of container.querySelectorAll('[class]')) for (const c of el.classList) expect(c).toMatch(/^jini-/)`
  (kit controls render the host's classes: render the test with the owner's fake kit, whose controls emit `jini-kit-*`).
- **Copy.** Screen text is `t('Full English sentence.')`. The owner package ships `messages.en.ts` (the key list);
  the dictionaries stay in Tovu at `apps/admin/src/features/<x>/<x>-i18n.ts` (precedent: seo, comments, forms; INDEX
  D-2). The host test `<x>-i18n-parity.unit.test.ts` (copy `features/seo/__tests__/seo-i18n-parity.unit.test.ts`)
  must take its locale list from the supported set, not a typed literal: `ADMIN_LOCALES` from
  `@tovu/contracts/admin-locales` (22 entries at `e801e9ae`: English + **21** translated; the SEO precedent hard-codes
  the same 21 at `seo-i18n-parity.unit.test.ts:12`). `ADMIN_LOCALES.filter(l => l.code !== 'en')` is the `it.each`
  table. A key you add is translated in every one of them in the same commit; a machine translation is marked in
  the report for owner review.
- Limits measured inside every file you create or grow: function <= 50 lines (hooks and components are judged per
  file by the repo gate), complexity <= 10, file <= 500 lines, exported functions take `(required, optional = {})`.
  No barrels, no `export * from`, no re-export left at an old path.
- Errors shown to the user: plain words plus a "Copy details" control (use the kit `Notice` the precedent uses).
- No permanent deletes: a delete action in a moved screen keeps going through the trash port it uses today.
- Motion: never gate an animation off on small screens. A `@media (max-width …)` or `matchMedia` branch that removes
  motion is a STOP. `prefers-reduced-motion` handling stays exactly as it is.
- Why-comments move with the code, compared by **content**, not by count:
  `diff <(git show <base>:<old path> | rg "^\s*(//|/?\*)" | sed 's/^\s*//' | sort) <(rg "^\s*(//|/?\*)" <new path(s)> -I | sed 's/^\s*//' | sort)`
  prints only lines you can name a reason for (a path inside a comment that changed). Paste the diff in the report.
- Security: both repos are public. Describe any security-relevant change by class and location only.

## 2. Step discipline (each of these was broken by an earlier build run; each is a STOP)
| Rule | Command that proves it |
|---|---|
| Every commit **on the lane branch** is green alone; no "fix forward" (section 6 says where unfinished work goes) | before each lane commit: `(cd $J && pnpm --filter @jini-ai/<pkg> build) && npm --prefix $J/packages/<pkg> run test` (Jini) or `npm --prefix $T/apps/admin run typecheck && npm --prefix $T/apps/admin run test -- <folders>` (Tovu); enforced by `git rebase --exec` in section 6 |
| Tests first | the sheet's test table is written and shown RED (new behaviour) or GREEN-then-RED-under-the-named-mutation (characterization) before the production edit; paste both runs |
| No lazy import of a declared dependency | `git diff <base> -- packages apps | rg "^\+.*(\bimport\(\s*['\"\`]@(jini-ai|tovu)/|loadOptionalPeer|React\.lazy|\blazy\()"` prints nothing new (catches `await import(…)` and `() => import('@jini-ai/…')`; an existing route-level `lazy(() => import('./local'))` that only moves is listed in the report) |
| No re-export shell, no wildcard barrel | `git diff <base> | rg "^\+\s*export (\*|\{[^}]*\}) from"` prints nothing outside an export-map entry file, and `rg -n "export \* from" <every entry file you created or moved>` prints nothing (entry files list names explicitly) |
| No `vi.mock` of another package's file | `git diff <base> | rg "^\+.*vi\.mock\(['\"]@(jini-ai|tovu)/"` prints nothing |
| No weakened or deleted test | report test count before/after per package and per admin feature; a deleted `it(` needs its new location named |
| No new suppression | `git diff <base> | rg "^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|as any|as unknown as)"` prints nothing |
| Export-map entries exist when introduced (lesson 25) | every new `exports` key resolves after `pnpm --filter @jini-ai/<pkg> build`: universal/node entries `node -e "import('@jini-ai/<pkg>/<subpath>')"` from `$J/examples/minimal-host`. A `browser` (`/react`) entry is **not** proven by Node: the proof is the real admin browser bundle, `(cd $T/apps/admin && npx vite build)` linked to the Jini commit (`npm run build` there refuses a linked Jini on purpose; use `npx vite build`), plus `rg -n "from ['\"]node:|require\(" <the entry's source folder>` printing nothing |
| Debt does not follow moved code silently (lesson 10) | remove the moved file's keys from Tovu `development/scripts/size-debt.json`, `development/scripts/src-complexity-debt.json` (read by `check-size-drift.ts:13`, `check-src-complexity-drift.ts:24`), `development/hook-injection-debt.json`, and its row in `development/scripts/size-exceptions.json`, in the commit that deletes the file. Jini `scripts/*-debt.json` are path-keyed for size and file-listed for hooks: a moved file's keys are **retired before or in the move commit, never re-keyed to the new path** (`git diff <base> -- scripts/*-debt.json | rg "^\+" | rg -v "^\+\+\+"` prints nothing) |

## 3. Cross-repo pairs and shared files (replaces round 1's "coordinator-only" list)
A screen move is at least two commits: one Jini commit that adds the module (green alone, nothing consumes it yet),
then one Tovu commit that binds it, repoints the panel, deletes the Tovu copy and its tests that moved. The Tovu commit
message names the Jini SHA it was checked against. Tovu is typechecked and tested linked to that SHA.
The Tovu commit is the only place a screen changes for users, so it is the unit of the Chrome check.

**The run edits every file its commit needs.** A commit that imports a new subpath contains the `exports` entry,
the `jini` runtime tag and the lockfile change that make it resolve; a commit that mounts a module contains the
`modules.hooks.ts`, `jini-kits.ts` and `panels.tsx` lines. Nothing is left as "lines for the coordinator".
- `pnpm-lock.yaml` / `package-lock.json` change only as the output of `pnpm install` / `npm install`; never by hand.
- Shared files (each is edited by more than one sheet): Jini `packages/admin/package.json`, `packages/cms/package.json`,
  `packages/core/package.json`, `packages/ui-kit/package.json`, `pnpm-lock.yaml`; Tovu `apps/admin/src/panels.tsx`,
  `apps/admin/src/integrations/jini-kits.ts`, `apps/admin/src/integrations/jini-admin/modules.hooks.ts`,
  `apps/admin/src/main.tsx`, `package-lock.json`. Rule: **two sheets that edit the same shared file never run at
  the same time** (INDEX section 6 is the serial order). The coordinator's only job is to start the next sheet
  after the previous one's lane branch is merged; it applies no lines.
- Enforced, not trusted: the first command of a run is `git fetch && git log --oneline HEAD..origin/<base>` (must
  be empty) and the last, before the lane push, is `git pull --rebase` followed by the gate commands again. A
  rebase conflict in a shared file is a STOP (push to `admin-ui/<sheet>-conflict`, report).

## 4. Chrome visual check (for every sheet marked YES)
A unit test cannot see a broken layout. After the Tovu commit, on a real running admin (not jsdom):
1. Before the move, on the base commit, capture the screen: list view, editor/detail view, each dialog, each tab;
   in the `classic` and `glass` admin themes; light and dark; at 1440 px, 390 px and (shell sheets J/T1, S-DOCK)
   one width inside the dock auto-rail band (default 1024 px; the band is the media query in
   `apps/admin/src/hooks/use-dock-auto-rail.hooks.ts`) with the dock open and closed.
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
counts before/after (per destination, section 2); debt keys retired; shared files edited; renamed selectors; new or changed copy keys; checks run,
each error classified LANE-CAUSED / PRE-EXISTING / ENV; what the sheet got wrong.

## 6. Git: two branches per run, so "push often" and "every commit green" are both true
- `wip/admin-ui/<sheet>`: push here every 5-10 minutes, `wip:` prefix, red allowed. It is telemetry and insurance
  (the Jini repo's standing cloud rule: never lose work, never gate a WIP commit on tests). Nobody merges it.
- `admin-ui/<sheet>` (the lane branch): receives a step only after the step's gate commands pass. Build it from
  the wip branch as one commit per step (`git checkout admin-ui/<sheet> && git merge --squash` of that step's wip
  commits, or `git cherry-pick`), then prove every lane commit is green alone:
  `git rebase --exec '<the section-2 gate command for this repo>' <base>` must finish with no stop.
  Only then `git pull --rebase && git push -u origin admin-ui/<sheet>`. Never force-push either branch.
- Out of time or budget with a red step: the lane branch stays at the last green step; the red work is on the wip
  branch; the report says PARTIAL, names both SHAs and says plainly which check is red. Never put red work on the
  lane branch "to save it".
Commit by explicit paths.
