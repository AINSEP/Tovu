# S8 (revision 2) — entry-refs SQL repo, `expandPartials`; the memory bus stays blocked

Facts: `S8-memory-bus-expand-partials.facts.md` (8 files, 946 lines, 54 test files). Template: T-SQLREPO rev 2.

## Already covered — do not re-plan
`contracts/core/entry-refs/{extractor,ports,types,repo.memory}.ts` (560 lines): `move-entry-refs.md`, three slices
DD-entry-refs-1 -> MV-entry-refs-1 -> SP-entry-refs-1. **Location (revision 3, Opus review P4):** branch
`plan/w1-sheets-d` on the Tovu GitHub origin (`AINSEP/Tovu`; the terra clone has no such remote ref, which is why the
review could not find it), path `ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/sheets/move-entry-refs.md`
(last commit `0337a8982`). Read it with:
```bash
git fetch origin plan/w1-sheets-d && git show FETCH_HEAD:ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/sheets/move-entry-refs.md
```
It is written for the old T-DEDUPE / T-MOVE / T-SPLIT templates (not T-SQLREPO) and runs under them; its blobs for
`types.ts` and `ports.ts` were re-checked against Tovu merge-final `232764af5` and still match. Not executed yet.
S8a needs only its FIRST slice, DD-entry-refs-1 (the Tovu twins of `EntryRefRow` / `EntryRefsRepoPort` deleted and
repointed to `@jini-ai/cms/widgets`), because the moved repo must implement the Jini port, not the Tovu twin.

```
id: S8a-entry-refs-sql (~110k): platform/db/repos/entry-refs-repo.ts (126) -> cms existing ./widgets/sql (add entry-refs-repo.ts)
      port: `EntryRefsRepoPort` in @jini-ai/cms/widgets (after move-entry-refs). sqlite/entry-refs-repo.sqlite.ts STAY-WIRING.
    S8b-expand-partials (~70k): contracts/core/expand-partials.ts (84) -> cms ./widgets/markers
    S8c-memory-bus: BLOCKED on OD-6 (round-1 item 3, unchanged)
prerequisites: S0 DONE (P7 entry_refs kinds). DD-entry-refs-1 landed (command below; the round-2 command
  `rg -n "EntryRefsRepoPort" packages/cms/src/widgets` passed vacuously: the Jini port already exists). xpkg R6-R9 landed.
successor_of: S7b (cms manifest); DD-entry-refs-1 (deletes `contracts/core/entry-refs/{ports,types}.ts` and edits the
  imports + one comment line of `platform/db/repos/entry-refs-repo.ts`: those facts rows may differ or vanish, nothing
  else); S8b: S8a
```
```bash
# Tovu; prints ok once DD-entry-refs-1 has landed
test ! -e apps/website/src/contracts/core/entry-refs/ports.ts && test ! -e apps/website/src/contracts/core/entry-refs/types.ts && echo ok
```

## S8a
`SqlEntryRefsRepo` (:48-123) + `entryRefsRepoFor` (:124) MOVE; `tables: { entryRefs: "entry_refs" }`. The two existing
`deleteFrom("entry_refs")` calls (:98 replace-per-source, :112 workspace rebuild) rewrite a DERIVED index and move verbatim.
| Risk | Test (T0) | Mutation -> RED |
|---|---|---|
| Refs replaced non-atomically | replace for one source: old set gone, new set present, in one transaction (a failing insert leaves the old set) | make replace insert-only; split the transaction |
| Unknown stored `source_kind` / `target_kind` | a row with an unknown kind (as an older or newer install could hold): today's behaviour pinned | change the cast handling |
| Cross-workspace rebuild | rebuild of workspace A leaves B's rows | drop the workspace predicate at :112 |

## S8b
`expand-partials.ts` imports `PARTIAL_MARKER_TYPE`, `substituteMarkers`, `withElementKeptIfAttributed` from
`@jini-ai/cms/widgets/markers` (same package after the move: leaf imports) **and** `DEFAULT_THEME_SLOTS`,
`ThemeSlotDescriptor` from Tovu's `contracts/core/theme-slots.ts`. The slot table is theme vocabulary and STAYS in Tovu:
`expandPartials({ html, theme, defaultSlots }, _optional = {})` takes it as required data (no default), with
`ThemeSlotDescriptor` declared structurally in the Jini file. Callers (facts: 3 prod + 2 tests) pass `DEFAULT_THEME_SLOTS`.
T0 pins outputs for: nested partial, self-referencing partial, missing partial, a slot overridden by the manifest vs taken
from the default table. Mutations: drop the default-table fallback; whatever recursion guard the body has (read :1-84
first; if it has none, pin the output for a bounded fixture and say so).
**stop:** `DEFAULT_THEME_SLOTS` is used for anything other than a lookup fallback (then the slot contract needs its own
sheet; report, move nothing).

## S8c (blocked, not executable)
`contracts/core/events/memory-bus.ts` (161; `InMemoryEventBus`, `InMemoryOutbox`) has THREE production importers on the
base pair: `platform/db/repos/outbox-repo.ts`, `features/webhooks/repo.memory.ts`,
`server/runtime/composition/modules/forms.ts`. It needs OD-6 and then a behaviour comparison with the core contract's
memory outbox (claim lease as a required argument); OD-6 alone does not supply that comparison. ~90k once unblocked.

Not verified while planning: bodies of `entry-refs-repo.ts` and `expand-partials.ts`.
