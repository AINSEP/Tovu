# COMMON-ADMIN: rules every admin-UI sheet inherits (read first, then your sheet)

Planning only. Nothing here was executed. Written 2026-11-17 against Tovu `integ/merge-a-2026-11-16` @ `f354cfbd`
and Jini `integ/merge-a-2026-11-16` @ `96aade8c`; revised in round 2 against merge-a/merge-b.
**Revision 3 (Opus review): the base is `integ/merge-final-2026-11-16` in both repos** (Tovu tip `232764af5`, which
contains merge-a `e801e9ae` and merge-b `450ac748`; Jini `65d73b0d5`). `refactor/size-05-posteditor` is already in
merge-a as a squash (`ffba5e382`; `features/posts/editor/` has the same tree on merge-a and merge-final), so INDEX D-0
is answered by merge-final. `inventory.tsv` was regenerated on Tovu `232764af5` (INDEX revision 3 table).

**One contract.** A run is `cat COMMON-ADMIN.md [T-SCREEN.md] <sheet section>`. Where a sheet and this file
disagree, STOP and report the two lines; do not pick one. There are **no coordinator-only files** any more
(round-1 judge blocker 3): a run edits every file its own commit needs to be green, section 3 says how shared
files are kept safe.

**This file is self-contained. Do NOT read the xpkg `COMMON.md` for an admin run** (revision 3, Opus M2: round 2 told
the run to obey it *and* said "this file wins", while both files say a disagreement is a STOP; that was two
contracts). The xpkg rules an admin run needs are copied into this file, each where it applies:
the forwarder check (xpkg S3, here C4), the 50/10/500 limits block (xpkg S8, here C8 "S-FN50"), the swallowed-catch
check (S11, here C9), the `(required, optional = {})` listing (S9, here C12), the weakened-test listing (S13, here
C6), "delete only your own debt keys by hand, never regenerate a debt file" (xpkg "no coordinator-only files", here
section 1 "Hooks are props" and C11), and the merge-final base. xpkg clauses that do NOT apply here: its census and
compliance classes (`census.mjs`, `CENSUS-*.tsv`: cleanup lanes only), its single-branch git rule (admin uses section
6's wip + lane branches), its report path (admin: section 5).

## 0. First commands (before reading any source). `$T` = the Tovu checkout, `$J` = the Jini checkout
Every command names its directory. Never rely on a previous `cd`. `BASE_T` / `BASE_J` = the SHAs you start from.
```
# both repos must contain merge-final; each line must print ok, else STOP
git -C $J merge-base --is-ancestor 65d73b0d5 HEAD && echo ok
git -C $T merge-base --is-ancestor 232764af5 HEAD && echo ok
BASE_J=$(git -C $J rev-parse HEAD); BASE_T=$(git -C $T rev-parse HEAD)
# Jini (checkout must be named exactly Jini, beside Tovu)
(cd $J && pnpm install --config.prefer-workspace-packages=true && pnpm -r build)
(cd $J && pnpm guard && pnpm typecheck)            # baseline; a red baseline is REPORTED, not fixed
npm --prefix $J/packages/<pkg> run test            # each package you will touch; record the test count
# Tovu
(cd $T && npm ci && npm --prefix apps/admin ci)     # apps/admin is its own npm project: without its own ci, vitest/@vitejs/plugin-react are missing (judge 2, ENV)
(cd $T && JINI_PACKAGES_DIR=$J/packages npm run link:jini)   # the script's default path is the owner's machine; in a cloud run it reports every package missing without the variable (judge 2)
npm --prefix $T/apps/admin run typecheck
npm --prefix $T/apps/admin run test -- <the feature's __tests__ folders, relative to apps/admin>   # record the count
(cd $T && npm run check:hooks && npm run check:size && npm run check:complexity && npm run check:boundaries)
```
Admin tests always run through `npm --prefix $T/apps/admin run test -- <paths>` (that is `vitest run` with
`apps/admin/vitest.config.ts`, which supplies the globals and the React setup). A bare `npx vitest` from the repo
root uses no admin config and fails misleadingly: never use it.

Then the stale-base guard. `inventory.tsv` lives on the **plan branch**, not in the executor's Tovu checkout
(Opus m2): the run fetches it itself into `$INV`. If the fetch fails, the dispatcher must have pasted the file at
that path; otherwise STOP. It has one row per admin file with its line count and git blob, and the guard checks
**both** directions (changed rows and files the inventory does not know):
```
INV=$(mktemp -d)/inventory.tsv
git -C $T fetch origin plan/admin-ui-extraction-2026-11-16 && git -C $T show FETCH_HEAD:admin-ui-extraction/inventory.tsv > $INV
cd $T
awk -F'\t' '$5=="<area>"{print $1"\t"$4}' $INV | while IFS=$'\t' read p b; do
  [ "$(git rev-parse --short=10 HEAD:apps/admin/src/$p 2>/dev/null)" = "$b" ] || echo "CHANGED $p"; done
comm -13 <(awk -F'\t' '$5=="<area>"{print $1}' $INV | sort) \
         <(git ls-tree -r --name-only HEAD apps/admin/src/<area-folder> | sed 's|^apps/admin/src/||' | rg -v '(__tests__/|__measurements__/|\.test\.|\.d\.ts$)' | rg '\.(ts|tsx|css|mts|js|mjs)$' | sort) | sed 's/^/NEW /'
```
Every `CHANGED`, missing or `NEW` file: read it and write the difference into your report before editing. If more
than a third of an area's files are CHANGED or NEW: **STOP**, report, do not improvise. (On `232764af5` the guard is
clean for every area: the inventory was generated there.)

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
  packages passes them. The real check for a moved file set is therefore by file. Before the move, on the base,
  list the debt keys of the old and new folders (Jini `scripts/hook-injection-debt.json`; same one-liner on Tovu's
  `development/hook-injection-debt.json`):
  `node -e "const d=require('./scripts/hook-injection-debt.json');const hit=Object.entries(d.entries??d).filter(([k,v])=>(v.files??[]).some(f=>process.argv.slice(1).some(p=>f.startsWith(p))));console.log(hit.map(([k])=>k).join('\n')||'CLEAN')" <new folder> <old folder>`
  In the move commit, **delete exactly those keys by hand**; never run `check-hook-injection.mjs --update` (it
  rewrites the whole file, so two runs that both regenerate it conflict and one can absorb the other's debt; same
  rule as the xpkg lanes). After the move the gate passes and the one-liner prints `CLEAN`. A debt file only
  shrinks: C11 below proves it.
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
- Limits measured inside every file you create or grow: function <= 50 lines, cyclomatic and cognitive complexity
  <= 10 (Tovu admin 9), file <= 500 lines (check C8, S-FN50), exported functions take `(required, optional = {})` (C12).
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
**Copy commands only from the fenced blocks below** (Opus review): the table names the rule and what its command
does not prove; it holds no commands. A `|` inside a table cell is a column break, and a `\|` copied out of a
table is a literal pipe in an `rg` pattern, not an alternation. Run each block in **both** repos (`R=$J BASE=$BASE_J`,
then `R=$T BASE=$BASE_T`) unless it names one, before every lane push, and paste its output into the report.

| # | Rule | What the command does NOT prove (review obligation in the report) |
|---|---|---|
| C1 | Every commit **on the lane branch** is green alone; no "fix forward" (section 6 says where unfinished work goes) | enforced per commit by section 6's rebase; a red step stays on the wip branch |
| C2 | Tests first | no command: the sheet's test table is written and shown RED (new behaviour) or GREEN-then-RED-under-the-named-mutation (characterization) before the production edit; paste both runs |
| C3 | No lazy import of a declared dependency | an existing route-level local lazy import that only moves is allowed: list it in the report |
| C4 | No re-export shell, forwarder or wildcard barrel | a hit inside an export-map entry file is allowed (entry files list names explicitly); a multi-line forwarding function: list every exported function you added whose body is one call, with why it is not a forwarder |
| C5 | No mock of another package's file; fakes of interfaces | a hit naming `@jini-ai/` or `@tovu/` is a STOP; any other new mock is listed with why a fake cannot be used |
| C6 | No weakened or deleted test | report the test count before/after per package and per admin feature; a removed case or `expect` needs its new location named; review every changed matcher |
| C7 | No new suppression or cast | - |
| C8 | **S-FN50**: function <= 50 code lines, cyclomatic **and** cognitive complexity <= 10 (Tovu admin: 9, already in config), file <= 500, on every source file created or changed | the repo ratchets fail only at 80 lines; a finding on a function that was already over and **shrank** is allowed: say so |
| C9 | Errors are never swallowed | a catch that only logs: list each new `catch` and what it rethrows or returns |
| C10 | Export-map entries exist when introduced (lesson 25) | a browser (`/react`) entry is not proven by Node: only the real admin bundle proves it |
| C11 | Debt does not follow moved code silently (lesson 10) | which keys are yours: name each retired key and the file it belonged to |
| C12 | Exported functions take `(required, optional = {})` | the command only lists them: for each, state the two-object shape, or the sheet line that keeps an existing positional signature |

C1, per lane commit (the same commands are the `--exec` of section 6):
```
# Jini commit
(cd $J && pnpm --filter @jini-ai/<pkg> build) && npm --prefix $J/packages/<pkg> run test
# Tovu commit, linked to the Jini SHA its message names
npm --prefix $T/apps/admin run typecheck && npm --prefix $T/apps/admin run test -- <folders>
```
C3 (prints nothing new; catches `await import(…)`, `() => import('@jini-ai/…')`, `React.lazy`):
```
git -C $R diff $BASE -- packages apps | rg "^\+.*(\bimport\(\s*['\"\`]@(jini-ai|tovu)/|loadOptionalPeer|React\.lazy|\blazy\()"
```
C4 (first two print nothing outside an entry file; the third prints nothing):
```
git -C $R diff $BASE -- packages apps | rg '^\+\s*export (\*|\{[^}]*\}) from '
git -C $R diff $BASE -U0 -- packages apps | rg '^\+export (const|function) \w+.*=> \w+(\.\w+)*\(\.\.\.|@deprecated'
rg -n 'export \* from' <every entry file you created or moved>
```
C5 (see the table for which hits STOP):
```
git -C $R diff $BASE -- packages apps | rg '^\+.*(vi\.(mock|doMock)|mock\.module)\('
```
C6 (every removed case or assertion, each with its new home in the report):
```
git -C $R diff $BASE -- '*.test.*' '*__tests__/*' | rg '^-\s*(it|test|expect)\('
```
C7 (prints nothing):
```
git -C $R diff $BASE -- packages apps | rg '^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|as any|as unknown as)'
```
C8 **S-FN50** (model: xpkg COMMON S8). Prints only findings that are new or changed against the same file at the
base; must print nothing except the "shrank" case. Tovu already errors on complexity 10 / cognitive 10, and 9 / 9
under `apps/admin/src` (`development/scripts/complexity-eslint.config.mjs:43-48`): **do not pass `complexity` on the
Tovu command line**, it would replace admin's 9 with 10. Jini's `eslint.config.mjs:66-75` already errors on both at
10 for `complexitySourceFiles` (its 50-line function rule there is only a warning); the Jini rule set repeats both at
the same level, as its `complexity:strict` script does, so a file outside that scope is still measured. Dictionaries (`*-i18n.ts`) are
size-exempt in Tovu (`size-exceptions.json` path exclusion) and are skipped.
```
FN='"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]'
LIM_T="{$FN}"
LIM_J="{$FN,\"complexity\":[\"error\",10],\"sonarjs/cognitive-complexity\":[\"error\",10]}"
# eslint has no line formatter here: print "rule message" per finding from the JSON report
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
fn50() {  # $1 repo dir, $2 base sha, $3 rule set
  ( cd "$1" || exit 1
    for f in $(git diff --name-only --diff-filter=AM "$2"..HEAD -- packages apps | rg '\.(ts|tsx|mts|mjs|js)$' \
               | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$|-i18n\.tsx?$)'); do
      npx eslint --no-inline-config --rule "$3" -f json "$f" | msgs > /tmp/fn50-after
      { git show "$2:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$3" -f json --stdin --stdin-filename "$f" | msgs > /tmp/fn50-before
      comm -13 /tmp/fn50-before /tmp/fn50-after | sed "s|^|$f: |"
    done )
}
fn50 $J $BASE_J "$LIM_J"
fn50 $T $BASE_T "$LIM_T"
(cd $J && pnpm check:size && pnpm check:complexity)
(cd $T && npm run check:size && npm run check:complexity)
```
C9 (prints nothing):
```
git -C $R diff $BASE -- packages apps | rg '^\+.*catch\s*(\(\w*\))?\s*\{\s*\}'
```
C10, for every new `exports` key:
```
(cd $J && pnpm --filter @jini-ai/<pkg> build)
(cd $J/examples/minimal-host && node -e "import('@jini-ai/<pkg>/<subpath>')")    # universal and node entries
# judge 2: minimal-host declares only 9 @jini-ai packages (not admin, among others); for a package it does not
# declare, use the package's self-reference instead: (cd $J/packages/<pkg> && node --input-type=module -e "await import('@jini-ai/<pkg>/<subpath>')")
(cd $T/apps/admin && npx vite build)    # browser (/react) entries, linked to the Jini commit; `npm run build` refuses a linked Jini on purpose
rg -n "from ['\"]node:|require\(" $J/packages/<pkg>/src/<the entry's source folder>    # prints nothing
```
C11. In the commit that deletes or moves a file, remove its keys by hand from Tovu
`development/scripts/size-debt.json`, `development/scripts/src-complexity-debt.json` (read by `check-size-drift.ts:13`,
`check-src-complexity-drift.ts:24`), `development/hook-injection-debt.json`, and its row in
`development/scripts/size-exceptions.json` (a row that only changes its path, as A1 Step D, is the one allowed
edit there). Jini `scripts/*-debt.json` keys of a moved file are **retired before or in the move commit, never
re-keyed to the new path**. Both must print nothing:
```
git -C $J diff $BASE_J -- 'scripts/*-debt.json' | rg '^\+' | rg -v '^\+\+\+'
git -C $T diff $BASE_T -- development/hook-injection-debt.json development/scripts/size-debt.json development/scripts/src-complexity-debt.json | rg '^\+' | rg -v '^\+\+\+'
```
C12 (lists every exported function you added or re-signed):
```
git -C $R diff $BASE -U0 -- packages apps | rg '^\+export (async )?function \w+'
```

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
  `git rebase --exec` with this repo's C1 line (section 2) onto the base must finish with no stop.
  Only then `git pull --rebase && git push -u origin admin-ui/<sheet>`. Never force-push either branch.
- Out of time or budget with a red step: the lane branch stays at the last green step; the red work is on the wip
  branch; the report says PARTIAL, names both SHAs and says plainly which check is red. Never put red work on the
  lane branch "to save it".
Commit by explicit paths.
