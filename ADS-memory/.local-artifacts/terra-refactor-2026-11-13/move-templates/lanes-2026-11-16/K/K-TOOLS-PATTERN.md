# K-TOOLS-PATTERN: one domain's agent-tool catalog + handlers -> the Jini package that owns the domain

Pasted at assembly, never cross-referenced: `cat T-SPLIT.md K/K-TOOLS-PATTERN.md K/<sheet>.md COMMON.md > <job>.md`.
Used by K-01, K-02, K-03, K-04, K-05, K-07, K-09, K-10 (and T-NL-03, T-PO-05, T-TH-08 after their seams).
Written against Tovu `integ/merge-b-2026-11-16` 491632dc, Jini `refactor/terra` 02edbb68. Nothing was executed.

## The existing owner (do not invent a second one)
Jini already holds this shape for five domains: `packages/cms/src/{content-types,entries,media,navigation,workspace}/{agent-tools,tool-registrations}.ts`
(read `navigation/tool-registrations.ts`: `MenusToolDeps`, `menusDerivedRisk`, `buildMenusRegistrations(routeDeps)`), and `packages/cms/src/taxonomy/agent-tools.ts`.
Tovu's file for those domains is a binding. Each sheet below makes one more domain look the same.

## What every sheet's files contain (measured, `<sheet>.decls.tsv`)
- `<feature>/agent-tools.ts`: the catalog (ids, descriptions, input schemas). `tovu_text = 0` in all seven K catalogs.
- `<feature>/tool-registrations.ts`: `<X>ToolDeps`, `<x>DerivedRisk`, view mappers, ONE `build<X>Registrations` function of 86-268 lines
  holding every handler inline (owner limit 50), and `contribute<X>Tools()` (the host seam, read by
  `server/runtime/composition/tool-catalog-manifest.ts` `installFirstPartyToolContributors()`).

## Split (every declaration is in `<sheet>.decls.tsv`; a declaration missing from it at execution = SKIP)
- catalog file -> MOVE whole. `<X>ToolDeps`, `<x>DerivedRisk`, view mappers, handlers -> MOVE.
- `contribute<X>Tools` -> STAY-WIRING (Tovu keeps `<feature>/tool-registrations.ts` as a ~30-line binding; it is not a re-export shell: it exports only `contribute<X>Tools`).
- Tovu imports of the file (listed per sheet) -> ports on `<X>ToolDeps` or injected values. Type-only imports of another Jini package
  (`@jini-ai/user-management` `PrincipalRepoPort`/`UserRepoPort`) -> a local structural port declaring ONLY the methods the handlers call
  (same method names, same argument objects, same return shape: Tovu passes the real repo unchanged; a port that needs an adapter = STOP).

## Steps (each commit green alone; never one red commit fixed forward)
S0 Tovu, tests only, FIRST: `features/<feature>/__tests__/tool-contract.characterization.test.ts`. Built with in-memory fakes of the
   `<X>ToolDeps` port interfaces (no `vi.mock`, no other package's internals). It pins and must FAIL on the named risk:
   (a) sorted tool ids == literal list in the sheet (risk: a tool dropped or renamed; ids are saved in permissions and audit rows);
   (b) per tool, `JSON.stringify({description, inputSchema, sideEffect})` equals a committed golden (risk: catalog edited in the copy);
   (c) `<x>DerivedRisk` entries == literal list (risk: a mutating tool registered as read-only);
   (d) per handler, a principal WITHOUT the permission gets the same error class and message (risk: permission check lost when a handler is extracted);
   (e) per handler, one success call returns the same view object (risk: view mapper or default changed).
   Proof it can fail: the report must show (d) RED when the `requireToolPermission` line of one handler is commented out locally, then restored.
S1 Tovu, seam in place (no file moves): extract each handler from `build<X>Registrations` into `const <toolId>Handler = ({ routeDeps }): ToolHandler => ...`
   in the same file, in the order of `<sheet>.decls.tsv`; `build<X>Registrations` becomes the table that maps ids to them. Handlers over 50 lines
   (listed per sheet) are split at their existing guard-clause/branch boundaries. Why-comments stay on the lines they explain. S0 stays green.
S2 Tovu, seam: every Tovu import becomes a field on `<X>ToolDeps` (or stays in `contribute<X>Tools`); the default value of `surfaces` is deleted
   (it builds a private store from `@jini-ai/daemon` + `@jini-ai/platform`, which a cms file may not import). Tests that relied on the default
   call the sheet's Tovu test helper instead. S0 green.
S3 Jini commit: NEW `packages/<pkg>/src/<domain>/agent-tools.ts` and `tool-registrations.ts` = the seamed Tovu files, minus `contribute<X>Tools`.
   Imports: own package by leaf file, `@jini-ai/core`, `@jini-ai/protocol` only. `surfaces` type: `{ readonly surfaceExchanges: SurfaceExchangeStore }`
   from `@jini-ai/core` (guard: `rg -n "SurfaceExchangeStore" packages/core/src/index.ts` hits, else STOP: core export missing).
   Signature: `build<X>Registrations({ deps, surfaces })`, `(required, optional = {})`. Index line + changeset (`minor`). Moved tests: only those that
   use fakes of the ports; they become vitest files beside the code.
S4 Tovu commit: `contribute<X>Tools` = `{ domain, build: (deps, surfaces) => build<X>Registrations({ deps, surfaces }), risk: <x>DerivedRisk }`
   imported from the Jini subpath; `git rm` the catalog file; repoint every row of `<sheet>.repoint.tsv`; S0 test stays in Tovu, repointed, still green.

## STOP (in addition to T-SPLIT and COMMON)
- `rg -n "@jini-ai/(daemon|platform|user-management|agentic|db|http-kit)" <new Jini files>` prints anything.
- A handler reads a Tovu settings key, table name, route or env name directly (it must arrive through a port).
- The S0 golden differs after S3 (the copy changed wording): restore, do not regenerate the golden.
- `installFirstPartyToolContributors()` would need an edit other than the import line.

## Not verified at planning time (executor checks, STOP on surprise)
- That `SurfaceExchangeStore` is exported from the `@jini-ai/core` barrel (it is declared in `packages/core/src/surface-exchanges.ts:141`).
- Which tests can move (rule: imports `platform/db`, `server/` or another feature -> stays in Tovu repointed).
- Jini file-size gate value for the new files (only `max-lines-per-function` 50 was read).
