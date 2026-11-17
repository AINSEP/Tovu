# COMMON-KT (revision 3): rules pasted at the end of EVERY lane K / lane T recipe. It REPLACES the shared `COMMON.md` for these lanes.
Assembly (one run = one sheet): `cat K/K-TOOLS-PATTERN.md K/<sheet>.md COMMON-KT.md` for tool sheets, `cat T-KT-MOVE.md <lane>/<sheet>.md COMMON-KT.md` for move sheets. Never add the shared `COMMON.md`, `T-MOVE.md` or `T-SPLIT.md`: they forbid running tests and defer edits to a coordinator, which contradicts the "every commit green" gate below (judge finding 1, lesson 29). This file is self-contained.

## Session
- Stop before 300k tokens of context. Near 250k: start nothing new, finish or restore the current step, push, report done/left.
- Clones: Tovu `{TOVU_CLONE}`, Jini `{JINI_CLONE}` (directory named exactly `Jini`, sibling of the Tovu clone). Both on `{BRANCH}`, both created from the SAME integration merge (`{BASE_TOVU}` / `{BASE_JINI}` recorded by the dispatcher); else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply. No subagents.
- Edit only the sheet's WRITE SET: its source files, the rows of `<id>.importers.tsv`, the new files it names, and the bookkeeping files on its `writes:` line (`development/scripts/size-debt.json`, `src-complexity-debt.json`, `size-exceptions.json`, `error-gate-debt.json`: only the entries the sheet names). Never touch `node_modules`, `ADS-memory`, lockfiles, package versions, `*.sql`, migration folders. Nothing is left "for the coordinator": a step that needs an edit the sheet does not list = STOP.

## V. Verification (every commit is proven green before the next step starts)
V0 setup, once, before reading source:
- Jini: `cd {JINI_CLONE} && pnpm install --frozen-lockfile && pnpm -r build`
- Tovu: `cd {TOVU_CLONE} && npm ci && JINI_PACKAGES_DIR={JINI_CLONE}/packages npm run link:jini`
V1 baseline on the UNMODIFIED trees (paste the last lines into the report; a red baseline = STOP "baseline red", never fix it):
- Jini: `pnpm --filter @jini-ai/{pkg} run typecheck && npm --prefix packages/{pkg} run test && pnpm guard`
- Tovu: `npx tsc -p tsconfig.json --noEmit` and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit`, then the sheet's `tests:` globs with the single-file runner
  `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <files>`
- Tovu gates on the unmodified tree: `npm run check:size && npm run check:complexity && npm run check:architecture` exit 0 (red = STOP "baseline red").
V2 after EVERY Tovu commit (this is what CI runs; a commit green here and red in CI is lesson 10):
```bash
npx tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit
# the sheet's tests with the single-file runner (V1)
npx eslint <touched files>
npm run check:size            # exits 1 on a NEW violation AND on a stale debt entry ("Delete stale debt entry")
npm run check:complexity      # same, for src-complexity-debt.json
npm run check:architecture    # CI blocking step (ci.yml:212); exits 1 on a NEW cross-feature edge or a regressed metric. Never run it with --update
npm run check:errors | rg "^(New|Worse):"   # CI step ci.yml:254; WARN mode exits 0, so the pass condition is: prints nothing
# S-FN50 below on the files this commit created or whose function bodies it changed
```
Red = fix inside the sheet's listed edits or restore the step and STOP; never commit on top of red.
V2 after EVERY Jini commit: `pnpm --filter @jini-ai/{pkg} run build` (the linked Tovu clone reads `dist/`), `pnpm --filter @jini-ai/{pkg} run typecheck`, `npm --prefix packages/{pkg} run test`, `pnpm guard`, S-FN50 (Jini form) on the new/edited Jini files, then the two Tovu `tsc` commands (a Jini commit is additive: Tovu stays green without edits).
V3 proof a characterization test can fail: apply the ONE mutation the sheet names, run the test, paste the failing assertion, restore with `git show HEAD:<path> > <path>` and `git diff --quiet -- <path>`.
"Green" for a Tovu commit means green against the linked Jini clone at the Jini SHA written in the Tovu commit body (Tovu's package.json keeps the published range; the coordinated publish is not part of a sheet).

## STOP-on-mismatch (a SKIP is a good outcome)
- Every file in `<sheet>.files.tsv` must match its blob (`git hash-object <path>`). Files listed in `BLOB-DRIFT.tsv` differ between the two 11-16 integration merges: the dispatcher regenerates sidecars (`scripts/gen.py`, `decls.py`, `symbols.cjs`) on the final merged tree first.
- Census: run `<sheet>.census.txt`; every hit must be a row of `<sheet>.importers.tsv` (direct, barrel or moves-too). Any other hit, any Jini name the sheet assumes that is missing, any decision the sheet did not make: restore your files, report SKIPPED + reason.

## Owner rules (acceptance criteria)
1. Generic code goes to Jini behind typed ports; Tovu (the host) wires them. Product policy, routes, env names, table names, wording stay in Tovu.
2. A Jini package file imports only its own package (by LEAF file, never its barrel), `@jini-ai/core`, `@jini-ai/protocol`. Option C: a React entry may also import `@jini-ai/ui-kit/react`. Host-preset exception: packages `server` and `cli` only. `sqlite`/infra packages are frozen: no edits.
3. Exported functions take `(required, optional = {})`. Never `_optional: Record<string, never>`. Convert every caller in the same commit.
4. Functions <= 50 code lines, cyclomatic AND cognitive complexity <= 10, files <= 500 lines, enforced by S-FN50 (`check:size` alone errors only at 80). A moved unit over a limit is split in a Tovu seam commit first; never exempted, never a new debt entry. A debt entry (`size-debt.json`, `src-complexity-debt.json`) or `size-exceptions.json` row whose violation the commit removes (split, moved or deleted path) is deleted IN THAT COMMIT: `check:size`/`check:complexity` exit 1 on a stale entry. An `error-gate-debt.json` entry follows its code: when a sheet moves a counted `catch` to another Tovu file, the entry's `file` changes in the same commit. Each sheet's `writes:` line names these entries.
5. No barrels, re-export shells or forwarders: a moved file is deleted in Tovu, every importer in `<sheet>.importers.tsv` is repointed and every `re-export` row deleted in the SAME Tovu commit.
6. Why-comments move with the code (reworded neutral); Tovu-specific why stays beside the Tovu binding.
7. Tests use in-memory fakes of the port interfaces. No `vi.mock`/`mock.module` of another package's internals. Never delete or weaken an assertion; a test that no longer fits = STOP. ALLOWED behaviour-preserving test edits (not assertion edits; list each in the report): (a) an import line whose names moved is repointed to the Jini specifier, only the moved names change specifier; (b) an argument shape the sheet's seam lists (e.g. `(required, optional = {})`); (c) the moved-test copy into Jini. Any other edit to an existing test file = STOP.
8. Errors: plain words + details, never swallowed. No `console.*` in Jini (inject `report`). No `process.env` in Jini. No `express`.
9. Declared dependencies are imported statically. A new third-party dependency in a Jini package = STOP.
10. No schema change in these lanes: table names are values Tovu passes. Any needed column/table change = STOP (ADR-066 TS migration + N-1 fixture + automatic migration is its own sheet).
11. Never a permanent delete: no step removes rows or files for good; trash only.
12. New CSS classes in Jini use the `jini-` prefix; saved class/attribute names of installed themes are a compatibility surface (see D-T3). New UI text exists in ALL locales. Custom hooks (incl. `useT`, `useAdminLocale`) are props defaulted to the real hook, with a fake-hook output test.
13. No new `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`. No silent behaviour change: a behaviour change needs a failing test first, shown RED on the parent (V3) and GREEN on the commit.
14. Jini commits are additive; one `.changeset/<pkg>-<slug>.md` per Jini commit that changes shipped code. A new subpath = `exports` entry + `jini.entries` runtime tag + README line, all in the commit that adds the first file, and it must build in that commit. A `universal` entry never reaches `node:`.
15. Both repos are public: security wording by class/location only.

## STOP matrix (run each command at the step named; "prints nothing" is the pass condition)
Commands are in a code block so they run exactly as copied (a `\|` inside a markdown table does not). Replace `<...>` and `{...}` placeholders first.
```bash
# S-IMPORT, each Jini commit. THIRD_PARTY_ALLOWED comes from the sheet (an allow-list, e.g. kysely|parse5|node:util; "none" = use the regex never-match "^$")
rg -n -o "from ['\"]([^'\"]+)['\"]" -r '$1' <new/edited Jini files> | rg -v ":(\.\.?/|@jini-ai/(core|protocol)(/|$))" | rg -v ":({THIRD_PARTY_ALLOWED})$"
# S-BARREL, each Jini commit
rg -n "from ['\"]\.\.?/(\.\./)*index\.js['\"]" <new Jini files>
# S-TEXT, each Jini commit
rg -n -i "tovu|site-chat|apps/(admin|website|desktop)" <new/edited Jini files>
# S-RUNTIME, each Jini commit
rg -n "from ['\"]express|process\.env|console\.(log|warn|error|info|debug)\(|await import\(" <new/edited Jini files>
# S-ARGS, each Jini commit
rg -n "_optional\??: Record<string, never>" <new Jini files>
# S-SUPPRESS, each commit, both repos
git show HEAD -U0 | rg "^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck)"
# S-MOCK, each commit that adds tests
git show HEAD -U0 | rg "^\+.*(vi\.(mock|doMock)|mock\.module)\("
# S-FN50, each commit: functions <= 50 code lines, complexity <= 10 (owner rule; check:size errors only at 80).
# Files = the files this commit CREATED or whose function bodies it CHANGED (not files where only import lines changed).
#   Tovu (eslint.config.mjs already errors on cyclomatic + cognitive complexity 10, admin 9; this adds the 50-line error):
npx eslint --no-inline-config --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}]}' <files> 2>&1 | rg "max-lines-per-function|complexity"
#   Jini (same flags as the repo's `complexity:strict` script, plus the 50-line rule):
npx eslint --no-inline-config --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10]}' <files> 2>&1 | rg "max-lines-per-function|complexity"
#   A hit in a function this commit did not touch that the parent has too (same command on `git show HEAD~1:<file>`) is pre-existing: report it, not a STOP.
# S-SIZE, each commit
npm run check:size && npm run check:complexity          # Tovu (exit 0 required)
wc -l <new Jini files> | awk '$1 > 500 && $2 != "total"'  # Jini (prints nothing)
# S-FORWARD, each Tovu commit (the one allowed line per sheet is named in the sheet, default none)
rg -n "^export (\*|\{[^}]*\}) from ['\"]@jini-ai/" <touched Tovu files>
# S-SCHEMA, end
git diff --name-only {BASE}..HEAD | rg "migrations/|\.sql$|content-database\.generated"
# S-DELETE, end: every hit must be a line moved verbatim (the same text is a "-" line in the other repo's diff); else STOP
git diff {BASE}..HEAD -U0 | rg -i "^\+.*(\.deleteFrom\(|delete from|unlinkSync|rmSync|fs\.rm\()"
# S-UI (UI sheets only), each commit: exit 0, then every new i18n key once per locale file (all print 1), then the sheet's Chrome check
npm run check:hooks
for f in <locale files>; do rg -c "<key>" "$f"; done
```

## Git
- Jini commit first, then Tovu. `git add -- <path>` per file, `git rm -q -- <path>` for deletions, `git commit -F <msgfile> -- <every path>`; check `git show --stat HEAD`. Never `add -A`, stash, reset, rebase -i, amend, force-push.
- After each green commit: `git pull --rebase origin {BRANCH} && git push -u origin {BRANCH}` (work that is not pushed is lost with the container). A rebase that does not apply cleanly: push to `{BRANCH}-fallback` and say so first in the report.
- Message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Report
DONE or SKIPPED (+ step + reason); every pushed SHA per repo and the branch; V1 baseline tails; V3 RED evidence; every STOP-matrix command with its (empty) output; anything that differed from the sheet; tokens used.
