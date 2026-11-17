# S2 — entries and content-types SQL repos -> `@jini-ai/cms/{entries,content-types}/sql`

Template: T-SQLREPO. Facts: `S2-entries-content-types-sql.facts.md` (8 files, 754 lines, 27 test files).

```
id: S2a-content-types-sql | S2b-entries-sql        (S2a first: smaller, and the entries repo reads content types)
jini_target: cms NEW ./content-types/sql and ./entries/sql (node)
prerequisites:
  - S0 green (P6, P7). S1 template calibrated (move-workspace + one S1 run landed clean).
  - OD-5 answered (how a Jini SQL adapter gets the dialect helpers). entries/repo.ts imports `jsonScalarEquals`, `jsonSortKey`
    from `@jini-ai/db/kernel`; a cms file may not import `@jini-ai/db` (COMMON 5). Recommended answer: injected (below).
  - audit2 sheet A08 status known: it moves `features/media/access-evidence.ts` to cms/media. S2b does not depend on it
    (the edge becomes a port either way) but both edit importers of that file: run S2b and A08 serially.
```

## The two edges that are not SQL (LESSONS 1, 3, 4)
1. `entries/repo.ts:1` and `entries/trash-aware-memory-repo.ts:1` import `invalidateMediaAccessEvidence` from
   `features/media/access-evidence.ts`: an entry write invalidates another feature's cached state. In Jini this is a
   required port on the repo: `onEntryMutated: (event: { workspaceId: string; entryId: string }) => void` (name it after what
   the repo knows; read the call sites to copy the exact argument the function takes today). Tovu binds it to
   `invalidateMediaAccessEvidence`. It is called at the SAME point (after the write statement, inside or outside the
   transaction exactly as today — read and record which) and synchronously if it is synchronous today. A missing binding
   must be a compile error (required field), never a silent no-op default.
2. `jsonScalarEquals` / `jsonSortKey` (dialect-specific JSON comparison and sort expressions). Port:
   `dialect: { jsonScalarEquals: …; jsonSortKey: … }` declared in `packages/cms/src/entries/sql/dialect-port.ts` with the
   signatures copied from `packages/db/src/kernel` (print: `rg -n "export function (jsonScalarEquals|jsonSortKey)" -A6 packages/db/src/kernel`).
   Tovu binds the two `@jini-ai/db/kernel` functions. LESSONS 12: compare argument order and object-vs-positional shape; a
   mis-bound helper typechecks if both take `(a, b)`.

## split
- content-types: `repo.ts` (`SqlContentTypeRepo`, `contentTypeRepoFor`) MOVE; `repo.rows.ts` MOVE; `repo.sqlite.ts` (0 prod, 1 test importer) -> if the census confirms no prod importer, DELETE and repoint the test to `contentTypeRepoFor`; `repo.memory.ts` (17 lines, label SHIM, 0 prod / 1 test) DELETE and repoint the test to `@jini-ai/cms/content-types`.
- entries: `repo.ts` (`SqlEntryRepo`, `entryRepoFor`) MOVE with the two ports above; `repo.rows.ts` MOVE; `repo.sqlite.ts` STAY-WIRING (1 prod + 2 tests).
- `entries/trash-aware-memory-repo.ts` (209 lines, 1 prod + 3 tests, label DEDUPE "promote to an exported hermetic repo"): NOT in this sheet. It is a memory adapter with the same invalidation edge; it needs a behaviour diff against `packages/cms/src/entries/repo.memory.ts` first. Follow-up S2c (not written): diff, then either a `hideTrashed` option on the Jini repo or MOVE as its own class.

## Characterization (T0)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Entry write stops invalidating media access evidence | spy passed as the real function's replacement at the BINDING (after the move it is the port; before it, wrap via the module the composition passes) — assert called once per save/delete with the entry's ids, and not called on a failed write | delete the call |
| JSON field filter/sort differs per dialect | existing dialect-matrix tests (keep-repointed) + one new case per helper: scalar equality on string vs number vs boolean JSON values; sort key ordering of mixed types | swap the two helpers' bindings; pass SQLite's to PGlite |
| Workspace scoping; trashed entries hidden from the reads that hide them today | as S1 | drop a predicate |
| Entry refs written in the same transaction as the entry (the single write chokepoint; see `sheets/move-entry-refs.md`) | failing ref write rolls the entry back | move the ref write outside the transaction |
| Content-type `declared owners` rule untouched | `features/content-types/declared-owners.ts` is not in this sheet; assert its one consumer still receives the same repo instance type | - |

## stops / estimate
- The lost-updates design adds `version` handling to entries (`0042_optimistic_concurrency_versions` exists): if a
  lost-updates sheet is scheduled on `entries/repo.ts`, it goes FIRST (LESSONS 10); re-take blobs after it.
- S2a ~90k. S2b ~190k (27 test files are mostly entries; repointing them is the bulk).
Not verified while planning: where exactly the invalidation call sits relative to the transaction; the helper signatures.
