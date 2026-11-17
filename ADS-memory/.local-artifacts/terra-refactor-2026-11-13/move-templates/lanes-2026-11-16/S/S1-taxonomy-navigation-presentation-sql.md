> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Findings 12, 16: `features/taxonomy/repo.ts` is 555 lines and needs a file partition before it can land under the 500-line limit; line 24 calls navigation's SQLite binding unused while this sheet's own facts list 3 production + 2 test importers.

# S1 — taxonomy, navigation and presentation SQL repos -> `@jini-ai/cms/{taxonomy,navigation,presentation}/sql`

Template: T-SQLREPO. Facts: `S1-taxonomy-navigation-presentation-sql.facts.md` (8 files, 1,130 lines, 18 test files).
`workspace` (repo.ts 101 + repo.sqlite.ts 15) is NOT here: `sheets/move-workspace.md` (plan/w1-sheets-d) already covers it; run that sheet as written, first, as the calibration run for this template.

```
id: S1a-taxonomy-sql | S1b-navigation-sql | S1c-presentation-sql     (three runs, file-disjoint, may run in parallel)
jini_target: cms NEW subpaths ./taxonomy/sql, ./navigation/sql, ./presentation/sql (runtime node), each {repo.ts, repo.rows.ts, index.ts}
prerequisites:
  - S0 green (P1: `taxonomy:<ws>`; P6 shapes). move-workspace landed (`ls packages/cms/src/workspace/sql/repo.ts`).
  - Untangle R9 (cms): landed, or its repoint TSV has no row on `packages/cms/package.json` exports / the three domain index files.
  - kysely already declared by cms (verified: `packages/cms/package.json` peer). No P-DEP needed.
```

## port_compat (step 0)
| Jini port | Tovu class | Compare |
|---|---|---|
| `TaxonomyRepoPort` and the term/entry-term/list/importable/revision ports — `rg -n "export interface .*(Taxonomy|Term).*Port" packages/cms/src/taxonomy` | `SqlTaxonomyRepo`, `SqlTermRepo`, `SqlEntryTermRepo`, `SqlTaxonomyRevisionRepo` (taxonomy/repo.ts) | Tovu imports ALL port types from `./index.js` (a Tovu barrel that re-exports cms): resolve each name to its Jini declaration; the four Tovu-local ports in `taxonomy/contracts.ts` (`AssignedTermView`, `EntryTermReadPort`, `TaxonomyPublishReadPort`, `TermPublishReadPort`, CLASSIFY: MOVE-AFTER -> cms/taxonomy) must exist in Jini BEFORE the repo that implements them: S1a's J1 adds them to `packages/cms/src/taxonomy/read-ports.ts` (new leaf, exported from `./taxonomy`); in T1 Tovu's `contracts.ts` is DELETED and its importers repointed to `@jini-ai/cms/taxonomy` (no shell). Census them first: `rg -n "taxonomy/contracts" apps/website/src`. |
| `MenuRepoPort` (`packages/cms/src/navigation/repo.memory.ts:51`) + the location-binding port | `SqlMenuRepo`, `SqlNavLocationBindingRepo` | optimistic version check on menu save: same error class as `features/navigation/menu-version-conflict-error.ts` re-exports (CLASSIFY: DELETE; find its Jini original) |
| presentation settings port in `packages/cms/src/presentation` | `SqlPresentationSettingsRepo`, `presentationSettingsRepoFor` | already `(required, optional)` + `*RepoFor` shaped (it was written after the precedent) |

## split
- taxonomy: `repo.ts` all four classes MOVE; `repo.rows.ts` MOVE; the `export type {…} from "./contracts.js"` lines at repo.ts and repo.sqlite.ts are re-export lines: DELETE them and repoint their importers to the Jini declaration (no shell). `repo.sqlite.ts` STAY-WIRING (4 subclasses, constructor `({ db, workspaceId })` kept; CLASSIFY said DELETE — overridden: it has 1 prod + 2 test importers and is the binding, same as redirects).
- navigation: `repo.ts` both classes MOVE (no `repo.rows.ts`: mappers are inline; they go to a new `repo.rows.ts` only if a class method would otherwise exceed 50 lines). `repo.sqlite.ts` has 0 importers (facts): verify with the census; if still 0, DELETE it and bind in the file that constructs `SqlMenuRepo` today (its 1 prod importer).
- presentation: `repo.ts`, `repo.rows.ts` MOVE; `repo.sqlite.ts` STAY-WIRING.

## Semantics that must survive (characterization, T0, on unmoved code; dialect matrix where the existing tests already use it)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Trash-blind vs trash-aware reads (taxonomy header: every read hides trashed rows EXCEPT the publish-content and purge-audit reads) | seed a trashed taxonomy with live terms and a live taxonomy with a trashed term: each public read method listed in the class is asserted individually as hiding or showing | remove `termIsLive` re-check from one read; add a status filter to a trash-blind read |
| A term is hidden the moment its taxonomy is trashed, with no cascade write | trash the taxonomy; assert the term rows' own `status` is unchanged AND term reads return nothing | implement hide by updating terms |
| `update` cannot resurrect or edit a trashed row | stale update of a trashed row: zero rows affected, row unchanged | drop the status guard in the `WHERE` |
| Read-then-write sequences hold `taxonomy:<ws>` (2 sites) | recording kernel order | remove the lock |
| Constructed workspace-scoped: no method can read another workspace | two workspaces, same slugs | drop a workspace predicate |
| Menu optimistic concurrency | stale version save -> the conflict error, row unchanged | remove the version predicate |

## wiring / baselines
`repo.sqlite.ts` texts follow move-workspace's exact shape with `tables` = the real names from the facts file
("tables touched"). Baseline rows: facts file lists 2 hits; update only those.

## stops / estimate
- `features/taxonomy/index.ts` (a 60-line Tovu barrel the repo imports types from) is on the R-BARRELS list: if R-BARRELS
  has not landed, text-guard each import; never edit the barrel here.
- S1a ~200k (555-line repo, four classes; cut point after J1). S1b ~150k. S1c ~80k.
Not verified while planning: the Jini declarations of each taxonomy port name; whether `contracts.ts` types already exist in
cms; per-method sizes.
