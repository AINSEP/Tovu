# S8 — entry-refs SQL repo, memory bus, expand-partials

Facts: `S8-memory-bus-expand-partials.facts.md` (8 files, 946 lines, 53 test files).

## Already covered — do not re-plan
`contracts/core/entry-refs/{extractor,ports,types,repo.memory}.ts` (560 lines) and the import edits to
`platform/db/repos/entry-refs-repo.ts`: `sheets/move-entry-refs.md` on plan/w1-sheets-d (3 slices, DD-entry-refs-1..3).
Not executed on any moves/* branch (the four files still exist on integ/merge-b). Run it as written, first.

```
id: S8a-entry-refs-sql (~110k, T-SQLREPO): platform/db/repos/entry-refs-repo.ts (126) -> cms existing ./widgets/sql (add entry-refs-repo.ts)
      port: `EntryRefsRepoPort` in @jini-ai/cms/widgets (after move-entry-refs). sqlite/entry-refs-repo.sqlite.ts STAY-WIRING (4 prod + 5 tests).
    S8b-expand-partials (~60k, T-MOVE): contracts/core/expand-partials.ts (84; imports only @jini-ai/cms/widgets/markers) -> cms ./widgets/markers (or its html leaf; pick the file that owns the partial marker syntax: `rg -n "partial" packages/cms/src/widgets/markers`). 3 prod + 2 test importers.
    S8c-memory-bus: BLOCKED on OD-6 (see S6). `contracts/core/events/memory-bus.ts` (161; `InMemoryEventBus`, `InMemoryOutbox`; 1 prod + 8 tests).
      With OD-6 = (a): `InMemoryOutbox` implements the core `OutboxPort` and moves to `@jini-ai/core/contracts/events/testing` if it is
      test-only, or stays a Tovu adapter if production uses it (facts: 1 prod importer — read it; a production in-memory outbox is a
      hermetic-mode adapter, which is generic -> `@jini-ai/db/events` memory twin). The claim lease becomes a required argument
      (plan-v6: "remove worker constant"). ~90k once unblocked.
prerequisites: S0 green (P7 entry_refs kinds). S8a after move-entry-refs. R9 landed.
```

## Characterization (T0)
| Risk | Test | Mutation -> RED |
|---|---|---|
| Entry refs written by a second path | the repo's write method is called only from the entries write chokepoint: source-level assertion already implied by move-entry-refs; here: refs replaced atomically per source (old set gone, new set present, in one transaction) | make replace = insert only |
| `source_kind` / `target_kind` casts accept an unknown stored kind | a row with an unknown kind (as an older/newer install could hold): pin today's behaviour (returned as-is, skipped, or throws) | change the cast handling |
| Partial expansion recursion / unknown partial | nested partial, self-referencing partial, missing partial: outputs pinned | remove the depth/cycle guard if one exists (read first) |
| Blob GC where-used | not enabled (plan-v6 S8); no test may start depending on it | - |

Not verified while planning: bodies of all three files; whether `expandPartials` has a cycle guard; the one prod importer of memory-bus.
