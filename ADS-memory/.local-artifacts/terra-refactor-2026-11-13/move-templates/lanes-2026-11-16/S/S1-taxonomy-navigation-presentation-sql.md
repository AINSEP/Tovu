# S1 (revision 2) — taxonomy, navigation and presentation SQL repos -> `@jini-ai/cms/{taxonomy,navigation,presentation}/sql`

Template: T-SQLREPO rev 2. Facts: `S1-taxonomy-navigation-presentation-sql.facts.md` (8 files, 1,130 lines, 18 test files).
`workspace` (repo.ts + repo.sqlite.ts) is NOT here: `sheets/move-workspace.md` (plan/w1-sheets-d) covers it and runs first
as the calibration of this template; if it does not land clean, fix T-SQLREPO before S1.
Revision 2 fixes judge findings 12 (the 555-line taxonomy repo had no partition) and 16 (navigation's binding is NOT
unused: 3 production + 2 test importers; it stays).

```
id: S1a-taxonomy-sql (~210k, cut point after J1) -> S1b-navigation-sql (~150k) -> S1c-presentation-sql (~80k)
    serial: all three add an export entry to packages/cms/package.json
jini_target: cms NEW ./taxonomy/sql, ./navigation/sql, ./presentation/sql (node)
prerequisites: S0 DONE (P1 `taxonomy:<ws>`; P6). move-workspace landed: `ls packages/cms/src/workspace/sql/repo.ts`.
  xpkg R6-R9 landed (cms manifest, wave 1). kysely is already an optional peer of cms (package.json `peerDependenciesMeta`).
successor_of: move-workspace, S0
```

## S1a — taxonomy
**partition (finding 12).** `features/taxonomy/repo.ts` is 555 lines: four classes and one shared predicate.
| New file (`packages/cms/src/taxonomy/sql/`) | From `repo.ts` | Lines |
|---|---|---|
| `liveness.ts` | the file header's Trash rules (every read hides trashed rows EXCEPT the publish-content and purge-audit reads; a term is hidden the moment its taxonomy is trashed, with no cascade write), `TRASH_STATUS` (:43), `termIsLive` (:48-62) | ~45 |
| `taxonomy-repo.ts` | `SqlTaxonomyRepo` (:63-182), lock at :163 | ~135 |
| `term-repo.ts` | `SqlTermRepo` (:183-351) | ~185 |
| `entry-term-repo.ts` | `SqlEntryTermRepo` (:352-520), lock at :419 | ~185 |
| `taxonomy-revision-repo.ts` | `SqlTaxonomyRevisionRepo` (:521-555) | ~50 |
| `repo.rows.ts` | `features/taxonomy/repo.rows.ts` (81) + the Jini-local table interfaces | ~150 |
| `index.ts` | named exports of the four classes, the `*SqlRequired` types and the tables type | ~15 |
The lock-key string `` `taxonomy:${workspaceId}` `` is built by ONE non-exported function in `liveness.ts`, used by both
locking classes. Constructor of each class: `({ kernel, tables, workspaceId }, _optional = {})` (today `({ db, workspaceId })`;
the classes are workspace-scoped by construction: keep that, no per-method workspace argument is added).
**contracts first.** The classes implement four Tovu-local ports from `features/taxonomy/contracts.ts` (35 lines):
`TaxonomyPublishReadPort`, `TermPublishReadPort`, `AssignedTermView`, `EntryTermReadPort` (it imports only
`@jini-ai/cms/taxonomy` types). J1's first file is NEW `packages/cms/src/taxonomy/read-ports.ts` with those four, named
type exports from `./taxonomy` (universal). T1 deletes `contracts.ts` and repoints its importers
(`rg -n "taxonomy/contracts|from \"\./contracts\.js\"" apps/website/src/features/taxonomy apps/website/src`); the
re-export lines `repo.ts:20` and `repo.sqlite.ts:14` are deleted, their importers repointed (no shell).
**port_compat (step 0).** `rg -n "export interface .*(Taxonomy|Term).*Port" packages/cms/src/taxonomy`: resolve each name in
`repo.ts:5-18` (imported through the Tovu barrel `./index.js`) to its Jini declaration and compare method by method.
**tables.** `taxonomies`, `terms`, `entry_terms`, `taxonomy_revisions` + any other target the STOP command of T-SQLREPO §6
finds (the facts file "tables touched" is the list; a target not in it = STOP).
**characterization (T0, dialect matrix where the existing tests use it).**
| Risk | Test | Mutation -> RED |
|---|---|---|
| Trash-blind vs trash-aware reads | a trashed taxonomy with live terms and a live taxonomy with a trashed term: EVERY public read method of the four classes asserted individually as hiding or showing (the list of methods is the test's own table) | remove `termIsLive` from one read; add a status filter to a trash-blind read |
| Hide without cascade | trash the taxonomy: term rows' own `status` unchanged AND term reads return nothing | implement hide by updating terms |
| `update` resurrects or edits a trashed row | stale update of a trashed row: zero rows affected, row unchanged | drop the status guard in the `WHERE` |
| Read-then-write holds `taxonomy:<ws>` (2 sites) | recording kernel order: lock before the read, at `:163` and `:419` | remove each lock |
| Cross-workspace read | two workspaces, same slugs, each class | drop a workspace predicate |
**wiring.** `repo.sqlite.ts` STAY-WIRING: the four `Sqlite*Repo` subclasses keep names and `({ store, workspaceId })`-shaped
constructors exactly as today (read lines 22-44) and call
`super({ kernel: schemaErasedKernel({ store }), tables: TAXONOMY_TABLES, workspaceId }, {})`; `TAXONOMY_TABLES` is a `const`
in this file with the real names. `features/taxonomy/index.ts` (60-line barrel, R-BARRELS): only specifiers of lines
naming a moved symbol change.

## S1b — navigation
`repo.ts` (332): `SqlMenuRepo`, `SqlNavLocationBindingRepo` MOVE to `navigation/sql/{menu-repo.ts,location-binding-repo.ts}`
(inline mappers move to `repo.rows.ts`). `repo.sqlite.ts` **STAY-WIRING** (finding 16). `repoint-menu-refs.ts` is not in
this sheet. port_compat: `MenuRepoPort` (`packages/cms/src/navigation/repo.memory.ts` declares or imports it: print with
`rg -n "MenuRepoPort|LocationBinding.*Port" packages/cms/src/navigation`); the version-conflict error class thrown on a
stale save must be the Jini class the Tovu file `features/navigation/menu-version-conflict-error.ts` re-exports
(`sed -n 1,20p` it): the moved repo imports it by leaf path.
| Risk | Test (T0) | Mutation -> RED |
|---|---|---|
| Stale menu save overwrites | save with an old version: the conflict error (same class, `instanceof` in the route's mapper), row unchanged | remove the version predicate |
| Trashed menu visible / location binding to a trashed menu | per read method, as S1a | drop a predicate |
| Cross-workspace | two workspaces, same menu ids and locations | drop a workspace predicate |

## S1c — presentation
`repo.ts` (51), `repo.rows.ts` (29) MOVE; `repo.sqlite.ts` (15) STAY-WIRING. Already `(required, optional)` + `*RepoFor`
shaped. T0: round-trip of one settings row per workspace; second write replaces, never duplicates; cross-workspace read.
Mutation: drop the conflict target / the workspace predicate.

## commits / stops
Each run T0 -> J1 -> T1, gates of T-SQLREPO §5; every run leaves a tree that compiles alone (the three domains share no
file). Baseline rows: the facts file lists 2 hits; delete exactly those in the T1 that moves their write site.
- STOP if a class method exceeds 50 lines / complexity 10 after the move and has no comment boundary to split at (eslint line).
- STOP if `features/taxonomy/index.ts` would need a NEW export line (R-BARRELS owns the barrel).
Not verified while planning: the Jini declaration of each taxonomy/menu port name; method bodies beyond the lock sites
and the class line ranges; the constructor texts of the three `repo.sqlite.ts` files (copy them at execution).
