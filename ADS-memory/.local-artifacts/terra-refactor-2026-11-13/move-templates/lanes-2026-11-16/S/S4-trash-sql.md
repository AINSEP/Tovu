> **REVISION 2 HOLD (2026-11-17): do NOT dispatch this sheet as written.** The Codex judge's finding(s) below were checked against the code and accepted; the redesign is not written yet (INDEX §7 and "Revision 2 - judge response"). Until this banner is removed the sheet is input for the next planning run, not an executor brief.
> Finding 4: S4a moves `entry-sql.ts` and `not-trashed.ts`, which import registry contracts that only S4b moves (S4a cannot compile alone); `buildTrashRegistry()` (`features/trash/registry.ts:164`) takes no input and returns a fixed map: there is no validator to extract, the fixed product registry stays in Tovu, and the planned duplicate/unknown-table characterization has nothing to characterize.

# S4 — trash: SQL repo, table adapter kit, registry contracts -> `@jini-ai/cms/trash/sql` (adapters for other domains stay in Tovu)

Template: T-SQLREPO for S4a; T-SPLIT for S4b. Facts: `S4-trash-sql.facts.md` (19 files, 2,311 lines, 40 test files).
Owner rule in force: never permanent deletes — the Trash adapters ARE that rule's implementation. Nothing here may turn
a trash into a delete or drop a restore path.

```
id: S4a-trash-repo-kit   (repo.ts, entry-sql.ts, entry-sql.types.ts, not-trashed.ts, db-port.ts)        ~170k
    S4b-trash-table-adapter (table-adapter.ts, registry.ts contracts, adapters/marker-sql.ts)            ~230k (cut point after J1)
    S4c-trash-adapters   NOT WRITTEN (comment, post, redirect, media, member, user, directory, plugin, theme): see below
jini_target: cms NEW subpath ./trash/sql (node): {repo.ts, entry-sql.ts, not-trashed.ts, table-adapter.ts, registry-types.ts, index.ts}
prerequisites:
  - S0 green (P1 `trash:<type>:<ws>:<id>` and the sweep key; P2 one-member-one-lock).
  - Untangle R9 landed or no TSV row on `packages/cms/src/trash/**`.
  - S4b needs S4a. S4b BEFORE U1 (U1 binds the member lock key to the builder S4b exports).
```

## split
| File | Label | Notes |
|---|---|---|
| `repo.ts` `SqlTrashRepo` (232) | MOVE (S4a) | implements `TrashRepoPort` (`packages/cms/src/trash/ports.ts:246`). `SWEEP_LOCK_KEY` moves with it, string unchanged. |
| `entry-sql.ts` (`loose`, `qualified`, `EntitySnapshotRow`, `readLiveSnapshot`, `entryWhere`), `entry-sql.types.ts` | MOVE (S4a) | 6 prod importers incl. three adapters that stay: they repoint to the Jini subpath |
| `not-trashed.ts` (`TrashCondition`, `notTrashed`, `isTrashedRecord`) | MOVE (S4a) | pure Kysely predicate helpers |
| `db-port.ts` (19 lines, label DELETE "repoint to ContentKernel") | DELETE (S4a) | 5 prod importers repoint to `ContentKernel` |
| `ports.ts` (61, MIXED) | STAY except the constant the label names: importers of the retention default repoint to Jini's `DEFAULT_TRASH_RETENTION_DAYS`; diff the VALUE first (LESSONS: dedupe needs a behaviour diff). Different value = keep Tovu's, report. |
| `table-adapter.ts` `createTableTrashAdapter` (362) | MOVE (S4b) | builds a `TrashAdapter` (`ports.ts:67`) from a registry entry; owns the lock key `trash:${entityType}:${workspaceId}:${entityId}` -> exported builder `trashEntityLockKey({ entityType, workspaceId, entityId })` so other packages' adapters can be bound to the SAME key by the host. One function > 50 lines is likely: measure; split by extracting the remove/restore/purge bodies, never by merging branches. |
| `registry.ts`: types `TrashMarkerSpec`, `TrashDisplaySpec`, `TrashDisplayJoin`, `TrashCascadeSpec`, `TrashBlockerSpec`, `TrashHiddenWithParentSpec`, `TrashEntry`, `TrashRegistry`; `buildTrashRegistry` | SPLIT (S4b) | the TYPES and `buildTrashRegistry` (generic validation/assembly) MOVE to `registry-types.ts`/`registry.ts`; the registry CONTENT (which Tovu tables are trashable, their marker columns, cascades, blockers) STAYS in Tovu (plan-v6 S4: "`registry.ts` stays") in a new `features/trash/registry.entries.ts`. 9 prod + 18 test importers: the facts file lists them; type importers repoint to Jini, content importers to the new Tovu file. |
| `adapters/marker-sql.ts` (147, label DEDUPE-AFTER-HARDENING, "canonical = table-adapter.ts") | S4b: DIFF ONLY | write the behaviour table (remove / restore / purge / list / cascade / blocker) for marker-sql vs table-adapter over the same fixtures as a Tovu test. Identical -> a follow-up deletes it. Different -> it stays, with the difference recorded. No deletion in S4b. |

## S4c (not written — why)
`adapters/{comment,post,redirect,media,member,user,directory,plugin,theme}.ts` (882 lines) bind OTHER domains' tables and
services to the trash contract: `user.ts` imports identity purge types, the outbox repo and the kernel; `member.ts` the
members repo; `post.ts` `tableExists` from `@jini-ai/db/kernel`; `directory.ts` `node:fs`/`node:crypto` (label MOVE ->
`cms/trash/node`). Each belongs to the sheet that moves its domain (U1 member, S3/U identity user, A08 media) or is a
one-site binding that stays. Planning them needs each adapter read against its domain's port; not done in this run.

## Characterization (T0, unmoved code)
| Risk | Test | Mutation -> RED |
|---|---|---|
| A purge path becomes reachable without the retention check / sweep lock | sweep under a recording kernel: lock taken, only rows older than retention purged; fixed clock | remove the age predicate; remove the lock |
| Remove + restore round-trip loses the prior marker/status | for each registry entry kind (status-marker, timestamp-marker, hidden-with-parent): remove then restore returns the row to its exact prior column values | restore to a constant status |
| Blockers and cascades | entry with a blocker refuses removal with the same error; cascade children are trashed and restored with the parent | drop the blocker check |
| Concurrent remove/restore of one entity | recording kernel: the entity key is locked before the read-then-write | remove `lockKey` |
| `notTrashed` semantics per marker kind | truth table over the three marker kinds x (live, trashed, NULL) | invert one branch |
| Registry assembly rejects a malformed entry at boot (duplicate entity type, unknown table) | `buildTrashRegistry` with each malformed input throws as today | return without validating |

## stops
- Any adapter would need to move to make S4b compile (it must not: adapters import the Jini kit after T1).
- `table-adapter.ts` uses a facts-file flag `npm import "moved"` / registry.ts `"Red"`: these are regex false positives of the
  generator (strings inside comments); ignore after confirming with `rg -n "from ['\"](moved|Red)" <file>` printing nothing.
- A trashable table's marker column or status value would change.
Not verified while planning: bodies of repo.ts/table-adapter.ts/registry.ts (declarations and importers only); the
retention constant's two values; which `TrashRepoPort` members the Tovu class implements beyond the port.
