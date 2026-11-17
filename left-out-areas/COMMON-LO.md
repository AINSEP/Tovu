# COMMON-LO (revision 3): the one execution contract for every left-out-areas sheet

Assemble a run: `cat left-out-areas/COMMON-LO.md <the ONE sheet section>`. Nothing else. Never add the shared `COMMON.md`, `T-MOVE.md`, `T-SPLIT.md` or `T-SQLREPO.md`: they forbid running tests and leave edits "for the coordinator", which contradicts the gate below (judge finding 3, lesson 29). Where a sheet and this file disagree, this file wins and the run reports the contradiction.
Derived from `COMMON-KT.md` revision 2 (`plan/lanes-k-t-2026-11-16` cafebcaa); STOP commands rewritten as fenced blocks after the Opus review (revision 3), modelled on xpkg `COMMON.md` revision 3 (`plan/xpkg-lane-sheets-2026-11-16` 78fa7ef32). Commands checked to exist on Tovu `integ/merge-final-2026-11-16` 232764af5 (`package.json` scripts `link:jini`, `check:size`, `check:complexity`, `check:hooks`, `typecheck:tests`; `tsconfig.tests.json`; `development/test-support/composed-bundle-env.ts`; `eslint.config.mjs` loads `eslint-plugin-sonarjs` for every `.ts`/`.tsx`) and Jini `integ/merge-final-2026-11-16` 65d73b0d5 (`pnpm guard`, `pnpm check:size`, `pnpm check:complexity`, `pnpm api:check`, `pnpm api:update`; `eslint.config.mjs` loads `sonarjs`). Every pattern below was run against a sample file that contains each forbidden form and printed it (revision 3 self-test).

## Session
- One sheet = one run. Stop before 300k tokens of context; near 250k start nothing new, finish or restore the current step, push, report done/left.
- Clones: Tovu `{TOVU_CLONE}`, Jini `{JINI_CLONE}` (directory named exactly `Jini`, sibling of the Tovu clone), both on `{BRANCH}`, both created from the SAME final integration merge (`{BASE_TOVU}` / `{BASE_JINI}` written by the dispatcher; today Tovu 232764af5, Jini 65d73b0d5). Different merges = STOP.
- Owner decisions reach a run only as `{DECISIONS}` (a list like `D-SI1=approved D-DB0=approved`, written by the dispatcher from the owner's recorded answers). A decision-gated sheet checks it with its `precondition:` command; an unset or missing decision = SKIPPED "decision not made". A run never decides for the owner.
- Bootstrap files do not apply. No subagents. Edit only files the sheet names. Never touch `node_modules`, `ADS-memory`, `*.sql`, `platform/db/drizzle/**`, applied files under `platform/db/migrations/**`, `content-database.generated.ts`. Lockfiles and `package.json` dependency lists change only in a sheet whose `manifest:` line says so.
- Nothing is left "for the coordinator". A step that needs an edit the sheet does not list = STOP.
- Where runs execute: the full Tovu test typecheck (`tsconfig.tests.json`, about 6 GB) and every test suite run in the CLOUD container only (owner rules: no local full `tsc` for small edits; tests run in the cloud; one test job per machine). A local run executes no V1/V2 command and reports "not run: local".
- No test process is left running: every test command runs in the foreground and the run checks after each suite that no `node --test` / `vitest` child of this run is alive (by pid, never `ps` with environment output).

## Sheet kinds (the sheet's first line names one)
| kind | commits | rule |
|---|---|---|
| TESTS | Tovu or Jini, test files only | every test is GREEN on the unmodified parent. A test that would be red today is NOT committed: it is written into the report as "requirement, not current behaviour" and belongs to a HARDEN sheet |
| HARDEN | behaviour change | the failing test and its implementation are in the SAME commit; RED is shown with V4 before committing. It may edit exactly the existing assertions the sheet names (they pin the behaviour being changed); every other existing test stays unedited |
| SEAM+MOVE | M1 tests, M2 Tovu seam in place, M3 Jini add, M4 Tovu repoint + delete | each of M1..M4 is its own commit and is green alone |
| JINI-ADD | additive Jini code + tests | Tovu stays green without edits |

## V. Verification (every commit is proven green before the next step starts)
V0 setup, once, before reading source: Jini `cd {JINI_CLONE} && pnpm install --frozen-lockfile && pnpm -r build`; Tovu `cd {TOVU_CLONE} && npm ci && JINI_PACKAGES_DIR={JINI_CLONE}/packages npm run link:jini`.
V1 baseline on the UNMODIFIED trees (paste the last lines; red baseline = STOP "baseline red", never fix it). Also save the Jini guard output as the S-GUARD baseline.
```bash
# Jini ({pkg} = each package the sheet edits)
pnpm --filter @jini-ai/{pkg} run typecheck && npm --prefix packages/{pkg} run test -- --maxWorkers=2 && pnpm guard > {TMP}/guard-before.txt 2>&1; tail -5 {TMP}/guard-before.txt
# Tovu
npx tsc -p tsconfig.json --noEmit
npm run typecheck:tests
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <the sheet's tests: files>
```
V2 after EVERY Tovu commit: the two `tsc` commands and the sheet's tests exactly as in V1, `npx eslint <touched files>`, then the S-LIM block (it ends with `npm run check:size && npm run check:complexity`).
V2 after EVERY Jini commit:
```bash
pnpm --filter @jini-ai/{pkg} run build && pnpm --filter @jini-ai/{pkg} run typecheck && npm --prefix packages/{pkg} run test -- --maxWorkers=2
pnpm guard > {TMP}/guard-after.txt 2>&1; diff {TMP}/guard-before.txt {TMP}/guard-after.txt
pnpm api:check
# then the S-LIM block, then the two Tovu tsc commands (a Jini commit is additive: Tovu stays green with no edit)
```
A Jini commit that adds or changes an export runs `pnpm api:update` and commits the changed baseline file of THAT package in the same commit (the baseline file is shared by every sheet that changes the same package's exports: INDEX "Order" serializes them).
V3 proof a characterization test can fail: apply the ONE mutation the test names, run it, paste the failing assertion, restore with `git show HEAD:<path> > <path>` and `git diff --quiet -- <path>`.
V4 (HARDEN only) proof of RED on the parent: with the new test and the new implementation both in the working tree, `cp <impl> {TMP}/new && git show HEAD:<impl> > <impl>`, run the test, paste the failing assertion, `cp {TMP}/new <impl>`, run again GREEN, then commit.
Red after a commit = fix inside the sheet's listed edits or restore the step and STOP; never commit on top of red.
"Green" for a Tovu commit = green against the linked Jini clone at the Jini SHA written in the Tovu commit body. Tovu's `package.json` keeps the published range; publishing is not part of a sheet (it is INDEX stage P, before any merge to `main`).

## W. Verifier stage (dispatcher, between waves; not a sheet)
For every SHA a run reports, in order: fresh clones at that Tovu SHA and the Jini SHA named in its body, V0, then the V2 commands for that repo. A wave is released only when every SHA of every prerequisite sheet replays green. A sheet whose prerequisite has no green replay record is SKIPPED "prerequisite not verified" (its `precondition:` command is the enforcing check).

## Owner rules (acceptance criteria; a sheet never weakens one)
1. Generic code goes to Jini behind typed ports the host passes in; product policy, routes, env names, table names, permission ids, wording and saved-install file names stay in Tovu.
2. A Jini package file imports only its own package (by leaf file), `@jini-ai/core`, `@jini-ai/protocol`. Option C: a React entry may import `@jini-ai/ui-kit/react`. Host presets `server` and `cli` only may import anything. `sqlite` and `infra` are frozen: no edits. Node `fs` / lock / process bindings in NEW Jini code live only in `@jini-ai/node-adapters` (created by xpkg sheet N1; missing package = STOP for a sheet that needs it).
3. Exported functions take `(required, optional = {})`. Exception, named per sheet: a plugin-module ABI that installed plugins already call positionally is a compatibility surface and is not reshaped.
4. Functions <= 50 code lines (blank and comment lines not counted), cyclomatic complexity <= 10, cognitive complexity <= 10, files <= 500 lines, in every new or edited file: enforced by S-LIM, not by eye. Over-limit code is split in a Tovu seam commit first; never exempted; no new `size-debt.json` entry.
5. No barrels, re-export shells or forwarders are created. A moved file is deleted in Tovu and every importer repointed in the same commit. (`theme/index.ts` is an existing barrel owned by lane T: sheets here delete their own lines from it and add none.)
6. Why-comments move with the code (reworded neutral); Tovu-specific why stays beside the Tovu binding.
7. Tests use in-memory fakes of port interfaces. No mock of another package's internals. Never delete or weaken an assertion. Every custom hook is injected.
8. Errors are plain words plus a "Copy details" payload; never swallowed. No `console.*`, `process.env` or `express` in Jini (inject `report`).
9. Declared dependencies are imported statically. A new third-party dependency in a Jini package needs the owner decision named in the sheet.
10. Schema changes are ADR-066 TypeScript migrations only: the Drizzle chain is frozen, applied migrations are never edited, each change ships an N-1 fixture and migrates existing installs automatically.
11. Never a permanent delete of user data: Trash / parking adapters only, and what is replaced stays recoverable.
12. Credentials are never changed automatically. Production warns, never refuses to boot.
13. No new `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`. No silent behaviour change.
14. Jini commits are additive; one `.changeset/<pkg>-<slug>.md` per Jini commit that changes shipped code. A new subpath = `exports` entry + `jini.entries` runtime tag + README line in the commit that adds its first file, and it builds in that commit. A `universal` entry never reaches `node:`.
15. Both repos are public: security wording by class and location only; no reproduction steps.

## STOP matrix (revision 3: commands live ONLY in the fenced blocks below)
**Copy commands only from the fenced blocks.** The table names each check, when it runs and what it does not prove; it holds no commands, because a `\|` inside a markdown table cell is not a shell pipe or a regex alternation when copied, and a check written that way matches nothing and "passes" (Opus review N1). "Prints nothing" is the pass condition unless the table says otherwise.
"Jini files" in S-IMPORT, S-BARREL, S-TEXT, S-RUNTIME and S-ARGS means production files: paths under `__tests__/` and `*.test.*` are excluded (tests may import the test runner and `node:` modules; S-MOCK and S-NET cover tests). Placeholders: `{BASE}` = `{BASE_TOVU}` in the Tovu clone and `{BASE_JINI}` in the Jini clone; `JFILES` = the new or edited Jini production files of this commit, space-separated; `NEWJ` = the new ones only; `TOUCHED` = the Tovu files this commit touches; `ALLOW` = the sheet's `THIRD_PARTY_ALLOWED` as a regex alternation (for example `kysely` or `parse5`).
| id | when | pass condition / what the command does NOT prove |
|---|---|---|
| S-BLOB | before the first edit | prints nothing; any line = SKIPPED "blob drift" naming the file |
| S-PRE | before the first edit | the sheet's `precondition:` command prints at least one line; else SKIPPED "precondition not landed" |
| S-CENSUS | before M4 and at the end | before M4 every hit is a row of `<sheet>.importers.tsv`; at the end no hit. Names reached through a barrel are not seen: trace them per name |
| S-IMPORT | each Jini commit | prints nothing. Side-effect imports (`import "x"`) are not seen: list any you added |
| S-BARREL | each Jini commit | prints nothing |
| S-TEXT | each Jini commit | prints nothing |
| S-RUNTIME | each Jini commit | prints nothing, except the `node:` modules a sheet whose target is a `node` entry lists |
| S-ARGS | each Jini commit | prints nothing; S-LIM and review cover the rest of rule 3 |
| S-SUPPRESS | each commit | prints nothing |
| S-MOCK | each commit that adds tests | prints nothing |
| S-LIM | each commit | prints nothing new versus `{BASE}` (a function that was already over a limit and SHRANK may print: say so); then both repo ratchets exit 0. The repo ratchets alone fail only at 80 lines: S-LIM is the 50 / 10 / 10 / 500 gate (Opus review N2) |
| S-FORWARD | each Tovu commit | prints nothing; a multi-line forwarding function is not seen: list every exported function you added whose body is one call, with why it is not a forwarder |
| S-COMMENT | each M3/M4 pair | the two counts are reported side by side; a drop is explained line by line or it is a STOP |
| S-SCHEMA | end | prints nothing |
| S-DELETE | end, both repos | every hit is a line moved verbatim (the same text is a `-` line in the same or the other repo's diff); else STOP |
| S-CRED | end | every hit is a moved line, as in S-DELETE |
| S-BOOT | end | prints nothing |
| S-NET | each commit that adds tests | every hit is a string asserted on, never fetched (the tests run with the network denied by the fake transport the sheet names) |
| S-GUARD | each Jini commit | the diff shows only findings this sheet removes; a new finding = STOP |

S-BLOB (Tovu rows from the sheet's own sidecar; Jini rows for every Jini file the sheet EDITS, from `JINI.blobs.txt`):
```bash
tail -n +2 left-out-areas/sheets/<SHEET>.files.tsv | while IFS=$'\t' read -r path lines blob rest; do
  test "$(git -C {TOVU_CLONE} hash-object "$path")" = "$blob" || echo "BLOB DRIFT: $path"
done
for path in <Jini files the sheet edits>; do
  want=$(awk -v p="$path" '$1 == p { print $3 }' left-out-areas/sheets/JINI.blobs.txt)
  test -n "$want" && test "$(git -C {JINI_CLONE} hash-object "$path")" = "$want" || echo "BLOB DRIFT OR UNLISTED: $path"
done
```
S-CENSUS (the sheet gives `<old specifier pattern>` as a regex with unescaped `|`):
```bash
rg -n '<old specifier pattern>' apps development packages -g '!**/node_modules/**'
```
S-IMPORT (with no allow-list, drop the last stage):
```bash
rg -n -o "from ['\"]([^'\"]+)['\"]" -r '$1' $JFILES | rg -v ':(\.\.?/|@jini-ai/(core|protocol)(/|$))' | rg -v ":($ALLOW)$"
```
S-BARREL:
```bash
rg -n "from ['\"]\.\.?/(\.\./)*index\.js['\"]" $NEWJ
```
S-TEXT:
```bash
rg -n -i 'tovu|site-chat|apps/(admin|website|desktop)' $JFILES
```
S-RUNTIME:
```bash
rg -n "from ['\"]express|process\.env|console\.(log|warn|error|info|debug)\(|await import\(|from ['\"]node:" $JFILES
```
S-ARGS:
```bash
rg -n '_optional\??: Record<string, never>' $NEWJ
```
S-SUPPRESS:
```bash
git show HEAD -U0 | rg '^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck)'
```
S-MOCK:
```bash
git show HEAD -U0 | rg '^\+.*(vi\.(mock|doMock)|mock\.module)\('
```
S-LIM (run in each repo the commit touches; copied from xpkg `COMMON.md` S8, Opus review N2):
```bash
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
FILES=$(git diff --name-only --diff-filter=AM {BASE}..HEAD -- packages apps | rg '\.(ts|tsx|mts|mjs|js)$' | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$)')
T=$(mktemp -d)
# eslint has no line formatter here: print "rule message" per finding from the JSON report
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
for f in $FILES; do
  npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > "$T/after"
  { git show "{BASE}:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > "$T/before"
  comm -13 "$T/before" "$T/after" | sed "s|^|$f: |"
done
# Jini clone:
pnpm check:size && pnpm check:complexity
# Tovu clone:
npm run check:size && npm run check:complexity
```
S-FORWARD:
```bash
rg -n "^export (\*|\{[^}]*\}) from ['\"]@jini-ai/" $TOUCHED
```
S-COMMENT (comment lines leaving the deleted Tovu file vs. comment lines arriving in the M3 commit plus the Tovu binding):
```bash
git -C {TOVU_CLONE} show <M4 sha> -U0 -- <deleted file> | rg '^-\s*(//|/?\*)' | wc -l
git -C {JINI_CLONE} show <M3 sha> -U0 | rg '^\+\s*(//|/?\*)' | wc -l
git -C {TOVU_CLONE} show <M4 sha> -U0 -- <binding file> | rg '^\+\s*(//|/?\*)' | wc -l
```
S-SCHEMA (Tovu clone):
```bash
git diff --name-only {BASE_TOVU}..HEAD | rg 'platform/db/drizzle/|\.sql$|content-database\.generated'
git diff --diff-filter=MD --name-only {BASE_TOVU}..HEAD -- apps/website/src/platform/db/migrations
```
S-DELETE (each clone with its own base):
```bash
git diff {BASE}..HEAD -U0 | rg -i '^\+.*(\.deleteFrom\(|delete from|unlinkSync|rmSync|fs\.rm\(|\brm\()'
```
S-CRED (Tovu clone):
```bash
git diff {BASE_TOVU}..HEAD -U0 -- apps/website/src/features/source-control apps/website/src/features/site-backup | rg '^\+.*(updateSourceControlCredential|deleteSourceControlCredential|setDefault|\.seal\()'
```
S-BOOT (each clone):
```bash
git diff {BASE}..HEAD -U0 | rg '^\+.*process\.exit\('
```
S-NET:
```bash
git show HEAD -U0 | rg -P '^\+.*https?://(?!127\.0\.0\.1|localhost|example\.)[a-z0-9.-]+'
```
S-GUARD: the `diff` line of V2 (Jini).

## Git
- Jini commit first, then Tovu. `git add -- <path>` per file, `git rm -q -- <path>` for deletions, `git commit -F <msgfile> -- <every path>`; check `git show --stat HEAD`. Never `add -A`, stash, reset, rebase -i, amend, force-push.
- After each green commit: `git pull --rebase origin {BRANCH} && git push -u origin {BRANCH}`. A rebase that does not apply cleanly: push to `{BRANCH}-fallback` and say so first in the report.
- Message ends with a blank line then the co-author trailer the dispatcher gives.

## Report
DONE or SKIPPED (+ step + reason); every pushed SHA per repo and the branch; V1 baseline tails; V3 / V4 RED evidence; every STOP-matrix command with its output; every count recomputed with the command, never copied from the plan; anything that differed from the sheet; tokens used.
