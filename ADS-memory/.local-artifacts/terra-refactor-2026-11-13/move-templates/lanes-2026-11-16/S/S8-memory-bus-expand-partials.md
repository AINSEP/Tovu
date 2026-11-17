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
It is written for the old T-DEDUPE / T-MOVE / T-SPLIT templates (not T-SQLREPO). Not executed yet. Re-pinned below.
S8a needs only its FIRST slice, DD-entry-refs-1 (the Tovu twins of `EntryRefRow` / `EntryRefsRepoPort` deleted and
repointed to `@jini-ai/cms/widgets`), because the moved repo must implement the Jini port, not the Tovu twin.

### DD-entry-refs-1 re-pinned on refactor/terra (su-refresh, 2026-11-17; Tovu `232764af5`, Jini `65d73b0d5`)
Source of truth: `0337a8982:ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/sheets/move-entry-refs.md`
lines 13-95 (the fenced `id: DD-entry-refs-1` block; `0337a8982` is an ancestor of `origin/plan/w1-sheets-d` @ `1cfc0bad`
and the file is unchanged there). Re-checked against refactor/terra:
- All 9 Tovu blobs it names still match (`types.ts` 41043733, `ports.ts` 6f2bc923, `entry-refs-repo.ts` 42001fde,
  `entry-refs-repo.dialects.test.ts` 4f2f4a73, `where-used.ts` e2796646, `repo.memory.ts` d430739f, `extractor.ts` 36fa39f0,
  `repo.contract.test.ts` dc0401fc, `extractor.integration.test.ts` 06604f10). Jini survivor `packages/cms/src/widgets/ports.ts`
  blob e160b370 (`EntryRefRow` :107, `EntryRefsRepoPort` :117), re-exported by `widgets/index.ts:8`: unchanged.
- The text-guarded lines in `server/routes/types.ts`, `features/pages/html-document-store{,.memory}.ts`,
  `features/widgets/deps.ts`, `platform/db/repos/entry-refs-repo.ts` each occur exactly once.
- **ONE correction:** the importer row `features/publish-content/type-registry.ts` is stale. publish-engine P0.3
  (`6fd46c35`, "split the host port bag out of the type registry") moved that import to
  `features/publish-content/tovu-publish-ports.ts:22`, same text
  (`import type { EntryRefsRepoPort } from "#src/contracts/core/entry-refs/ports";` -> `... from "@jini-ai/cms/widgets";`).
  `type-registry.ts` is NOT edited. The `ports.ts` census is still 9 hits, with `tovu-publish-ports.ts:22` in place of
  `type-registry.ts:24`; the `types.ts` census is unchanged (8 hits).
- DD was written for the old T-DEDUPE template. If it has not landed when S8a starts, S8a runs it as its first Tovu
  commit (plus DD's Jini doc commit) under T-SQLREPO §5's T1 gate, using DD's importer list with the correction above;
  it may not be skipped (the moved repo must implement the Jini port).
```bash
# Tovu: DD guard on the current tree; prints nothing when DD's list (corrected) still matches
cd "$TOVU"; W=apps/website/src
for p in contracts/core/entry-refs/types.ts:41043733f2d6113d867de10955949bb34dddf671 contracts/core/entry-refs/ports.ts:6f2bc9231f7d09b85a539a7bac24991a290989ae platform/db/repos/entry-refs-repo.ts:42001fded69c60c6d0d548147d20829cc447120a platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts:4f2f4a73f395a5d6b42968ae83cf5e5092205c5c features/media/where-used.ts:e2796646cb4d2242e93230f8dcf573b3f2e01b33 contracts/core/entry-refs/repo.memory.ts:d430739f820bad0f5cef6dd3004cb7e375f0e338 contracts/core/entry-refs/extractor.ts:36fa39f0449d9b07172a0425a646196d88eec723 contracts/core/entry-refs/__tests__/repo.contract.test.ts:dc0401fcb1e1e0acce9862b72873c36b44aa3e6b contracts/core/entry-refs/__tests__/integration/extractor.integration.test.ts:06604f10fc05e79af5bdcc6f46af777a48fa0d20; do
  f=${p%%:*}; [ "$(git hash-object "$W/$f" 2>/dev/null)" = "${p##*:}" ] || echo "STOP blob: $f"; done
rg -l "entry-refs/(types|ports)" "$W" | sort | diff - <(printf '%s\n' features/media/where-used.ts features/pages/html-document-store.memory.ts features/pages/html-document-store.ts features/publish-content/tovu-publish-ports.ts features/widgets/deps.ts platform/db/repos/__tests__/entry-refs-repo.dialects.test.ts platform/db/repos/entry-refs-repo.ts server/routes/types.ts | sed "s|^|$W/|")
```
(`repo.memory.ts`, `extractor.ts` and the two entry-refs tests import `./types.js` / `./ports.js` relatively and are covered
by their blobs.)

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
