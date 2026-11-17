> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Findings 13, 14: the template promises green commits while `../COMMON.md:9` forbids tests, typechecks and builds, and it leaves `write-path-inventory.baseline.json` and P-DEP to a coordinator (same contradiction the xpkg COMMON removed: see `untangle/sheets-2026-11-16/COMMON.md` "There are no coordinator-only files" and its STOP table, which this template must adopt); `platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` is assigned to S3, S5, S6 and S7 in parallel chains.

# T-SQLREPO: a Tovu Kysely repo moves into the Jini package that owns its port; Tovu keeps the binding

Lane-local template for lanes S and U (2026-11-16). It generalises the one worked SQL-repo sheet,
`sheets/move-workspace.md` on `plan/w1-sheets-d` (C3 decision A / D6: "a domain SQL adapter lives behind the
existing neutral port, in a `<domain>/sql` node subpath of the package that owns the port"). Executor: Sonnet 5.5 high.
Assembly: `cat T-SQLREPO.md <sheet>.md <sheet>.facts.md ../COMMON.md > <job>.md` (COMMON.md is the move-templates one).
One sheet = one Sonnet run (stop before 250k tokens; a sheet lists its own cut points).

## What moves and what stays (the same for every sheet of this kind)
- MOVES to Jini: the query bodies (`Sql*Repo` classes / `create*Store` factories), their row mappers (`repo.rows.ts`),
  the lock-key strings they own, their why-comments (reworded neutral).
- STAYS in Tovu: `repo.sqlite.ts` (it becomes the binding: Tovu kernel + Tovu table names -> the Jini class; same shape as
  `apps/website/src/features/redirects/repo.sqlite.ts`), the generated `ContentDatabase`, migrations, the dialect-matrix
  tests (they run Tovu's migrations on SQLite/PGlite/Postgres; they cannot move), composition.
- NEVER touched: `platform/db/drizzle/**` (frozen), `platform/db/migrations/**` (applied; ADR-066), `content-database.generated.ts`,
  `*.sql`, lockfiles. No schema change belongs in these sheets. A sheet that seems to need one = STOP.

## Sheet fields (every sheet fills all of them; `-` when empty)
```
id / feature / jini_target (package, subpath, new files, runtime tag)
prerequisites        # each with the rg/git command that proves it landed; a missing one = SKIPPED
port_compat          # for each Jini port the moved class implements: the command that prints the Jini signature, and the
                     # Tovu class it must match METHOD BY METHOD (argument object fields, optional vs required, return
                     # null vs undefined vs throw, ordering guarantees). Structural `implements` passing is NOT enough.
split                # every top-level declaration of every file: MOVE -> file | STAY-WIRING | STAY-PRODUCT | DELETE
table_types          # the Jini-local table interfaces (columns copied from the generated type for the tables in facts)
tables_binding       # the `tables: {...}` object Tovu passes (real table names; none has a default in Jini)
lock_keys            # each key string: owner after the move, and the test that pins the exact string
ports                # anything else the moved body needs from Tovu (smallest set), with the Tovu binding expression
characterization     # tests written FIRST, on the UNMOVED Tovu code, each naming the risk it fails on
tests_split          # per test file: stays-repointed | moves-to-jini (only pure, kernel-fake tests move)
wiring               # exact Tovu lines after the move (repo.sqlite.ts text, composition edits old -> new)
baselines            # path-keyed debt rows to update (write-path inventory, hardwiring, architecture, size)
commits              # ordered; each lists prerequisites + caller/test updates and is green alone
stops                # sheet-specific STOP conditions
estimate             # tokens for one Sonnet run; cut points if it runs long
```

## Steps
0. Branch rule and blobs (facts file). Run every `prerequisites` and `port_compat` command. Any mismatch: SKIPPED, report the
   exact differing member. Read the landed precedent before writing a line:
   `packages/cms/src/redirects/sql/repo.ts` and `packages/cms/src/comments/sql/{repo.ts,repo.rows.ts,index.ts}` in the Jini clone;
   copy their spelling for the kernel type, the `tables` argument, `(required, _optional = {})` and the `*RepoFor` factory.
### Commit T0 (Tovu, tests only): characterization on the unmoved code
1. Add the tests listed under `characterization`. They are written against the Tovu class as it stands and must be GREEN
   on this commit in the batched cloud run. Each test names, in its title, the risk it guards. The cloud run also proves each
   one can FAIL: the sheet gives a one-line mutation per test ("delete line N" / "change the string"); the run applies it,
   expects RED, reverts. A characterization test that cannot go red is rejected (LESSONS 6, 21).
### Commit J1 (Jini): the adapter
2. NEW `<pkg>/src/<domain>/sql/repo.rows.ts` (table interfaces from `table_types` + the mappers, bodies verbatim),
   `repo.ts` (classes verbatim apart from: kernel type, `tables` names, `(required, _optional = {})` constructor, leaf imports),
   `index.ts` (named exports only, no `export *` of anything not listed in `split`).
3. `package.json`: `exports` entry + `jini.entries` `"<sub>": "node"` + README row, in THIS commit (LESSONS 25: an export-map
   entry must exist and build in the commit that introduces it). Changeset `minor`.
4. Rule checks: no Tovu text; imports only own package (leaf files), `@jini-ai/core`, `@jini-ai/protocol`, and `kysely`
   (type-only where the precedent is type-only). No `@jini-ai/db` import (the kernel comes through `@jini-ai/core/contracts/storage`).
   No `console.*`, no `process.env`, no `await import(`. Functions <= 50 lines, complexity <= 10: measure each moved method
   (`node_modules/.bin/eslint -f json` on the new files); a method over the limit is split as the sheet says, or STOP.
5. Jini tests: the kernel-fake unit tests listed `moves-to-jini`, plus a `lock-keys.test.ts` that drives each locking method
   against a recording fake kernel and asserts the exact key strings. Fakes implement the interface
   (`StorageKernel`); never `vi.mock` a package's internals.
### Commit T1 (Tovu): bind and delete
6. Census (facts file command). Every hit must be in the facts file. Else STOP.
7. Rewrite `repo.sqlite.ts` per `wiring`; repoint every importer; `git rm` the moved `repo.ts` / `repo.rows.ts`
   (no re-export shell, no forwarder; COMMON 19). Why-comments that name Tovu facts go above the binding.
8. Update `baselines` rows exactly as listed (the file stays, its write sites moved: remove the listed objects; never add an
   ignore). Re-run the census: no hit names a deleted path.
9. eslint touched files. Commit with every path, deleted ones included.

## STOP conditions specific to SQLREPO
- A moved query needs a table the sheet's `tables_binding` does not list, or a column the `table_types` do not declare.
- A moved body imports another Tovu feature the sheet did not turn into a port.
- The Jini port and the Tovu class differ in any member (step 0): never adapt silently; the sheet decides.
- The `sql` template tag, a raw string of SQL, or a dialect branch appears that the sheet did not list (dialect behaviour
  must be preserved per dialect; the Tovu dialect-matrix test stays the judge).
- Any change to a lock-key string, a stored token/hash format, a table or column name.
- The move would need `kysely` in a package whose `package.json` does not declare it (see INDEX prerequisite P-DEP).

## Expected afterwards (batched cloud run)
T0 green on its own; mutations red. J1: vitest of the new files, typecheck, `check-subpath-isolation`, size/complexity gates.
T1: the kept dialect-matrix tests green on SQLite + PGlite (+ Postgres where the matrix runs it), `write-path-inventory`
check green with the updated baseline, typecheck after linking the Jini clone.
