# COMMON-LO (revision 2): the one execution contract for every left-out-areas sheet

Assemble a run: `cat left-out-areas/COMMON-LO.md <the ONE sheet section>`. Nothing else. Never add the shared `COMMON.md`, `T-MOVE.md`, `T-SPLIT.md` or `T-SQLREPO.md`: they forbid running tests and leave edits "for the coordinator", which contradicts the gate below (judge finding 3, lesson 29). Where a sheet and this file disagree, this file wins and the run reports the contradiction.
Derived from `COMMON-KT.md` revision 2 (`plan/lanes-k-t-2026-11-16` cafebcaa); commands checked to exist on Tovu `integ/merge-a-2026-11-16` e801e9ae (`package.json` scripts `link:jini`, `check:size`, `check:complexity`, `check:hooks`; `tsconfig.tests.json`; `development/test-support/composed-bundle-env.ts`) and Jini `integ/merge-final-2026-11-16` af33fcdb (`pnpm guard`).

## Session
- One sheet = one run. Stop before 300k tokens of context; near 250k start nothing new, finish or restore the current step, push, report done/left.
- Clones: Tovu `{TOVU_CLONE}`, Jini `{JINI_CLONE}` (directory named exactly `Jini`, sibling of the Tovu clone), both on `{BRANCH}`, both created from the SAME final integration merge (`{BASE_TOVU}` / `{BASE_JINI}` written by the dispatcher). Different merges = STOP.
- Bootstrap files do not apply. No subagents. Edit only files the sheet names. Never touch `node_modules`, `ADS-memory`, `*.sql`, `platform/db/drizzle/**`, applied files under `platform/db/migrations/**`, `content-database.generated.ts`. Lockfiles and `package.json` dependency lists change only in a sheet whose `manifest:` line says so.
- Nothing is left "for the coordinator". A step that needs an edit the sheet does not list = STOP.

## Sheet kinds (the sheet's first line names one)
| kind | commits | rule |
|---|---|---|
| TESTS | Tovu or Jini, test files only | every test is GREEN on the unmodified parent. A test that would be red today is NOT committed: it is written into the report as "requirement, not current behaviour" and belongs to a HARDEN sheet |
| HARDEN | behaviour change | the failing test and its implementation are in the SAME commit; RED is shown with V4 before committing |
| SEAM+MOVE | M1 tests, M2 Tovu seam in place, M3 Jini add, M4 Tovu repoint + delete | each of M1..M4 is its own commit and is green alone |
| JINI-ADD | additive Jini code + tests | Tovu stays green without edits |

## V. Verification (every commit is proven green before the next step starts)
V0 setup, once, before reading source: Jini `cd {JINI_CLONE} && pnpm install --frozen-lockfile && pnpm -r build`; Tovu `cd {TOVU_CLONE} && npm ci && JINI_PACKAGES_DIR={JINI_CLONE}/packages npm run link:jini`.
V1 baseline on the UNMODIFIED trees (paste the last lines; red baseline = STOP "baseline red", never fix it):
- Jini: `pnpm --filter @jini-ai/{pkg} run typecheck && npm --prefix packages/{pkg} run test && pnpm guard`
- Tovu: `npx tsc -p tsconfig.json --noEmit`; `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit`; the sheet's `tests:` files with `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <files>`
V2 after EVERY Tovu commit: both `tsc` commands, the sheet's tests, `npx eslint <touched files>`, `npm run check:size`, `npm run check:complexity`.
V2 after EVERY Jini commit: `pnpm --filter @jini-ai/{pkg} run build`, `... run typecheck`, `npm --prefix packages/{pkg} run test`, `pnpm guard`, then the two Tovu `tsc` commands (a Jini commit is additive: Tovu stays green with no edit).
V3 proof a characterization test can fail: apply the ONE mutation the test names, run it, paste the failing assertion, restore with `git show HEAD:<path> > <path>` and `git diff --quiet -- <path>`.
V4 (HARDEN only) proof of RED on the parent: with the new test and the new implementation both in the working tree, `cp <impl> {TMP}/new && git show HEAD:<impl> > <impl>`, run the test, paste the failing assertion, `cp {TMP}/new <impl>`, run again GREEN, then commit.
Red after a commit = fix inside the sheet's listed edits or restore the step and STOP; never commit on top of red.
"Green" for a Tovu commit = green against the linked Jini clone at the Jini SHA written in the Tovu commit body. Tovu's `package.json` keeps the published range; publishing is not part of a sheet.

## W. Verifier stage (dispatcher, between waves; not a sheet)
For every SHA a run reports, in order: fresh clones at that Tovu SHA and the Jini SHA named in its body, V0, then the V2 commands for that repo. A wave is released only when every SHA of every prerequisite sheet replays green. A sheet whose prerequisite has no green replay record is SKIPPED "prerequisite not verified" (its `precondition:` command is the enforcing check).

## Owner rules (acceptance criteria; a sheet never weakens one)
1. Generic code goes to Jini behind typed ports the host passes in; product policy, routes, env names, table names, permission ids, wording and saved-install file names stay in Tovu.
2. A Jini package file imports only its own package (by leaf file), `@jini-ai/core`, `@jini-ai/protocol`. Option C: a React entry may import `@jini-ai/ui-kit/react`. Host presets `server` and `cli` only may import anything. `sqlite` and `infra` are frozen: no edits. Node `fs` / lock / process bindings in NEW Jini code live only in `@jini-ai/node-adapters` (created by xpkg sheet N1; missing package = STOP for a sheet that needs it).
3. Exported functions take `(required, optional = {})`. Exception, named per sheet: a plugin-module ABI that installed plugins already call positionally is a compatibility surface and is not reshaped.
4. Functions <= 50 code lines, complexity <= 10, files <= 500 lines, checked inside every new or edited file. Over-limit code is split in a Tovu seam commit first; never exempted; no new `size-debt.json` entry.
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

## STOP matrix ("prints nothing" is the pass condition unless the row says otherwise)
| id | when | command |
|---|---|---|
| S-BLOB | before the first edit | for each row of `<sheet>.files.tsv`: `test "$(git hash-object <path>)" = "<blob>"`; for each Jini file the sheet names: the same against `sheets/JINI.blobs.txt`. Any mismatch: SKIPPED "blob drift", name the file |
| S-PRE | before the first edit | the sheet's `precondition:` command prints at least one line; else SKIPPED "precondition not landed" |
| S-CENSUS | before M4 and at the end | `rg -n "<old specifier pattern from the sheet>" apps development packages -g '!**/node_modules/**'`: every hit is a row of `<sheet>.importers.tsv` (before M4) / no hit (end) |
| S-IMPORT | each Jini commit | `rg -n -o "from ['\"]([^'\"]+)['\"]" -r '$1' <new/edited Jini files> \| rg -v ":(\.\.?/\|@jini-ai/(core\|protocol)(/\|$))" \| rg -v ":({THIRD_PARTY_ALLOWED})$"` (the sheet gives the allow-list; default empty) |
| S-BARREL | each Jini commit | `rg -n "from ['\"]\.\.?/(\.\./)*index\.js['\"]" <new Jini files>` |
| S-TEXT | each Jini commit | `rg -n -i "tovu\|site-chat\|apps/(admin\|website\|desktop)" <new/edited Jini files>` |
| S-RUNTIME | each Jini commit | `rg -n "from ['\"]express\|process\.env\|console\.(log\|warn\|error\|info\|debug)\(\|await import\(\|from ['\"]node:" <new/edited Jini files>` (a sheet whose target is a `node` entry lists the `node:` modules it may keep) |
| S-ARGS | each Jini commit | `rg -n "_optional\??: Record<string, never>" <new Jini files>` |
| S-SUPPRESS | each commit | `git show HEAD -U0 \| rg "^\+.*(eslint-disable\|@ts-ignore\|@ts-expect-error\|@ts-nocheck)"` |
| S-MOCK | each commit that adds tests | `git show HEAD -U0 \| rg "^\+.*(vi\.(mock\|doMock)\|mock\.module)\("` |
| S-SIZE | each commit | Tovu `npm run check:size && npm run check:complexity` exit 0; Jini `wc -l <new files>` all <= 500 and `npx eslint <new files>` prints no `max-lines-per-function` / `complexity` message |
| S-FORWARD | each Tovu commit | `rg -n "^export (\*\|\{[^}]*\}) from ['\"]@jini-ai/" <touched Tovu files>` |
| S-COMMENT | each M3/M4 pair | `git show <M4 sha> -U0 -- <deleted file> \| rg "^-\s*(//\|\*\|/\*\*)" \| wc -l` and the same count of `+` comment lines in the M3 commit plus the Tovu binding are reported side by side; a drop is explained line by line or it is a STOP |
| S-SCHEMA | end | `git diff --name-only {BASE_TOVU}..HEAD \| rg "platform/db/drizzle/\|\.sql$\|content-database\.generated"` and `git diff --diff-filter=MD --name-only {BASE_TOVU}..HEAD -- apps/website/src/platform/db/migrations` |
| S-DELETE | end, both repos | `git diff {BASE}..HEAD -U0 \| rg -i "^\+.*(\.deleteFrom\(\|delete from\|unlinkSync\|rmSync\|fs\.rm\(\|\brm\()"`: every hit is a line moved verbatim (the same text is a `-` line in the same or the other repo's diff); else STOP |
| S-CRED | end | `git diff {BASE_TOVU}..HEAD -U0 -- apps/website/src/features/source-control apps/website/src/features/site-backup \| rg "^\+.*(updateSourceControlCredential\|deleteSourceControlCredential\|setDefault\|\.seal\()"`: every hit is a moved line, as in S-DELETE |
| S-BOOT | end | `git diff {BASE}..HEAD -U0 \| rg "^\+.*process\.exit\("` |
| S-NET | each commit that adds tests | `git show HEAD -U0 \| rg "^\+.*(https?://(?!127\.0\.0\.1\|localhost\|example\.)[a-z0-9.-]+)" -P`: every hit is a string asserted on, never fetched (the tests run with the network denied by the fake transport the sheet names) |

## Git
- Jini commit first, then Tovu. `git add -- <path>` per file, `git rm -q -- <path>` for deletions, `git commit -F <msgfile> -- <every path>`; check `git show --stat HEAD`. Never `add -A`, stash, reset, rebase -i, amend, force-push.
- After each green commit: `git pull --rebase origin {BRANCH} && git push -u origin {BRANCH}`. A rebase that does not apply cleanly: push to `{BRANCH}-fallback` and say so first in the report.
- Message ends with a blank line then the co-author trailer the dispatcher gives.

## Report
DONE or SKIPPED (+ step + reason); every pushed SHA per repo and the branch; V1 baseline tails; V3 / V4 RED evidence; every STOP-matrix command with its output; every count recomputed with the command, never copied from the plan; anything that differed from the sheet; tokens used.
