# COMMON-KT (revision 2): rules pasted at the end of EVERY lane K / lane T recipe. It REPLACES the shared `COMMON.md` for these lanes.
Assembly (one run = one sheet): `cat K/K-TOOLS-PATTERN.md K/<sheet>.md COMMON-KT.md` for tool sheets, `cat T-KT-MOVE.md <lane>/<sheet>.md COMMON-KT.md` for move sheets. Never add the shared `COMMON.md`, `T-MOVE.md` or `T-SPLIT.md`: they forbid running tests and defer edits to a coordinator, which contradicts the "every commit green" gate below (judge finding 1, lesson 29). This file is self-contained.

## Session
- Stop before 300k tokens of context. Near 250k: start nothing new, finish or restore the current step, push, report done/left.
- Clones: Tovu `{TOVU_CLONE}`, Jini `{JINI_CLONE}` (directory named exactly `Jini`, sibling of the Tovu clone). Both on `{BRANCH}`, both created from the SAME integration merge (`{BASE_TOVU}` / `{BASE_JINI}` recorded by the dispatcher); else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply. No subagents.
- Edit only the files the sheet names. Never touch `node_modules`, `ADS-memory`, lockfiles, package versions, `*.sql`, migration folders. Nothing is left "for the coordinator": a step that needs an edit the sheet does not list = STOP.

## V. Verification (every commit is proven green before the next step starts)
V0 setup, once, before reading source:
- Jini: `cd {JINI_CLONE} && pnpm install --frozen-lockfile && pnpm -r build`
- Tovu: `cd {TOVU_CLONE} && npm ci && JINI_PACKAGES_DIR={JINI_CLONE}/packages npm run link:jini`
V1 baseline on the UNMODIFIED trees (paste the last lines into the report; a red baseline = STOP "baseline red", never fix it):
- Jini: `pnpm --filter @jini-ai/{pkg} run typecheck && npm --prefix packages/{pkg} run test && pnpm guard`
- Tovu: `npx tsc -p tsconfig.json --noEmit` and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit`, then the sheet's `tests:` globs with the single-file runner
  `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks <files>`
V2 after EVERY Tovu commit: both `tsc` commands, the sheet's tests, `npx eslint <touched files>`, `npm run check:size`, `npm run check:complexity`. Red = fix inside the sheet's listed edits or restore the step and STOP; never commit on top of red.
V2 after EVERY Jini commit: `pnpm --filter @jini-ai/{pkg} run build` (the linked Tovu clone reads `dist/`), `pnpm --filter @jini-ai/{pkg} run typecheck`, `npm --prefix packages/{pkg} run test`, `pnpm guard`, then the two Tovu `tsc` commands (a Jini commit is additive: Tovu stays green without edits).
V3 proof a characterization test can fail: apply the ONE mutation the sheet names, run the test, paste the failing assertion, restore with `git show HEAD:<path> > <path>` and `git diff --quiet -- <path>`.
"Green" for a Tovu commit means green against the linked Jini clone at the Jini SHA written in the Tovu commit body (Tovu's package.json keeps the published range; the coordinated publish is not part of a sheet).

## STOP-on-mismatch (a SKIP is a good outcome)
- Every file in `<sheet>.files.tsv` must match its blob (`git hash-object <path>`). Files listed in `BLOB-DRIFT.tsv` differ between the two 11-16 integration merges: the dispatcher regenerates sidecars (`scripts/gen.py`, `decls.py`, `symbols.cjs`) on the final merged tree first.
- Census: run `<sheet>.census.txt`; every hit must be a row of `<sheet>.importers.tsv` (direct, barrel or moves-too). Any other hit, any Jini name the sheet assumes that is missing, any decision the sheet did not make: restore your files, report SKIPPED + reason.

## Owner rules (acceptance criteria)
1. Generic code goes to Jini behind typed ports; Tovu (the host) wires them. Product policy, routes, env names, table names, wording stay in Tovu.
2. A Jini package file imports only its own package (by LEAF file, never its barrel), `@jini-ai/core`, `@jini-ai/protocol`. Option C: a React entry may also import `@jini-ai/ui-kit/react`. Host-preset exception: packages `server` and `cli` only. `sqlite`/infra packages are frozen: no edits.
3. Exported functions take `(required, optional = {})`. Never `_optional: Record<string, never>`. Convert every caller in the same commit.
4. Functions <= 50 code lines, complexity <= 10, files <= 500 lines, checked INSIDE every new file. A moved unit over a limit is split in a Tovu seam commit first; never exempted, never a new `size-debt.json` entry. A debt entry keyed on a moved path is deleted in the Tovu commit that deletes the path.
5. No barrels, re-export shells or forwarders: a moved file is deleted in Tovu, every importer in `<sheet>.importers.tsv` is repointed and every `re-export` row deleted in the SAME Tovu commit.
6. Why-comments move with the code (reworded neutral); Tovu-specific why stays beside the Tovu binding.
7. Tests use in-memory fakes of the port interfaces. No `vi.mock`/`mock.module` of another package's internals. Never delete or weaken an assertion; a test that no longer fits = STOP.
8. Errors: plain words + details, never swallowed. No `console.*` in Jini (inject `report`). No `process.env` in Jini. No `express`.
9. Declared dependencies are imported statically. A new third-party dependency in a Jini package = STOP.
10. No schema change in these lanes: table names are values Tovu passes. Any needed column/table change = STOP (ADR-066 TS migration + N-1 fixture + automatic migration is its own sheet).
11. Never a permanent delete: no step removes rows or files for good; trash only.
12. New CSS classes in Jini use the `jini-` prefix; saved class/attribute names of installed themes are a compatibility surface (see D-T3). New UI text exists in ALL locales. Custom hooks (incl. `useT`, `useAdminLocale`) are props defaulted to the real hook, with a fake-hook output test.
13. No new `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`. No silent behaviour change: a behaviour change needs a failing test first, shown RED on the parent (V3) and GREEN on the commit.
14. Jini commits are additive; one `.changeset/<pkg>-<slug>.md` per Jini commit that changes shipped code. A new subpath = `exports` entry + `jini.entries` runtime tag + README line, all in the commit that adds the first file, and it must build in that commit. A `universal` entry never reaches `node:`.
15. Both repos are public: security wording by class/location only.

## STOP matrix (run each command at the step named; "prints nothing" is the pass condition)
| id | when | command |
|---|---|---|
| S-IMPORT | each Jini commit | `rg -n -o "from ['\"]([^'\"]+)['\"]" -r '$1' <new/edited Jini files> \| rg -v ":(\.\.?/\|@jini-ai/(core\|protocol)(/\|$))" \| rg -v ":({THIRD_PARTY_ALLOWED})$"` (the sheet lists `THIRD_PARTY_ALLOWED`, e.g. `kysely\|parse5\|node:util`; an allow-list, not a deny-list) |
| S-BARREL | each Jini commit | `rg -n "from ['\"]\.\.?/(\.\./)*index\.js['\"]" <new Jini files>` |
| S-TEXT | each Jini commit | `rg -n -i "tovu\|site-chat\|apps/(admin\|website\|desktop)" <new/edited Jini files>` |
| S-RUNTIME | each Jini commit | `rg -n "from ['\"]express\|process\.env\|console\.(log\|warn\|error\|info\|debug)\(\|await import\(" <new/edited Jini files>` |
| S-ARGS | each Jini commit | `rg -n "_optional\??: Record<string, never>" <new Jini files>` |
| S-SUPPRESS | each commit, both repos | `git show HEAD -U0 \| rg "^\+.*(eslint-disable\|@ts-ignore\|@ts-expect-error\|@ts-nocheck)"` |
| S-MOCK | each commit that adds tests | `git show HEAD -U0 \| rg "^\+.*(vi\.(mock\|doMock)\|mock\.module)\("` |
| S-SIZE | each commit | Tovu `npm run check:size && npm run check:complexity`; Jini `wc -l <new files>` all <= 500 and `npx eslint <new files>` shows no `max-lines-per-function`/`complexity` message |
| S-FORWARD | each Tovu commit | `rg -n "^export (\*\|\{[^}]*\}) from ['\"]@jini-ai/" <touched Tovu files>` (the one allowed line per sheet is named in the sheet, default none) |
| S-SCHEMA | end | `git diff --name-only {BASE}..HEAD \| rg "migrations/\|\.sql$\|content-database\.generated"` |
| S-DELETE | end | `git diff {BASE}..HEAD -U0 \| rg -i "^\+.*(\.deleteFrom\(\|delete from\|unlinkSync\|rmSync\|fs\.rm\()"` : every hit must be a line moved verbatim (the same text is a `-` line in the other repo's diff); else STOP |
| S-UI (UI sheets only) | each commit | `npm run check:hooks`; every new i18n key present in every `locales/*.json`: `for f in <locale files>; do rg -c "<key>" $f; done` all 1; Chrome visual check listed in the sheet |

## Git
- Jini commit first, then Tovu. `git add -- <path>` per file, `git rm -q -- <path>` for deletions, `git commit -F <msgfile> -- <every path>`; check `git show --stat HEAD`. Never `add -A`, stash, reset, rebase -i, amend, force-push.
- After each green commit: `git pull --rebase origin {BRANCH} && git push -u origin {BRANCH}` (work that is not pushed is lost with the container). A rebase that does not apply cleanly: push to `{BRANCH}-fallback` and say so first in the report.
- Message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Report
DONE or SKIPPED (+ step + reason); every pushed SHA per repo and the branch; V1 baseline tails; V3 RED evidence; every STOP-matrix command with its (empty) output; anything that differed from the sheet; tokens used.
