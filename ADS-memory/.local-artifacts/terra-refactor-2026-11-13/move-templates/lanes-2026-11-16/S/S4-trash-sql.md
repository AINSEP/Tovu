# S4 (revision 2) — trash: registry contracts + SQL kit, then the table adapter -> `@jini-ai/cms/trash` and `./trash/sql`

Template: T-SQLREPO rev 2. Facts: `S4-trash-sql.facts.md` (19 files, 2,311 lines, 40 test files).
Owner rule: never permanent deletes. The Trash adapters ARE that rule's implementation: nothing here may turn a trash into
a delete, drop a restore path, or make a purge reachable without today's checks.
Revision 2 fixes judge finding 4 (S4a needed contracts S4b created; an invented registry validator), part of finding 12
(the table adapter is one 286-line function) and writes round-1 item 1 (per-file ownership of the nine other adapters).

```
id: S4a-trash-contracts-and-kit (~200k, cut point after J1)   registry TYPES, lock-key builder, entry-sql, not-trashed, repo, db-port
    S4b-trash-table-adapter     (~210k, cut point after J1)   table-adapter.ts (362) partitioned; marker-sql parity table (test only)
jini_target: cms existing ./trash (universal: two new type/pure files) + NEW ./trash/sql (node)
prerequisites: S0 DONE (P1 `trash:<type>:<ws>:<id>`, `trash:sweep-claim`; P2). xpkg R6-R9 landed (cms manifest, wave 1).
successor_of: S2c (cms manifest). S4b: S4a.   U1b and U2b need only S4a (the lock-key builder).
```

## S4a
**Why this order (finding 4).** `entry-sql.ts:15` and `not-trashed.ts:20` import `TrashEntry`, `TrashRegistry`,
`TrashMarkerSpec`, `TrashHiddenWithParentSpec` from `registry.ts`. Those types therefore land in the SAME J1 commit, as
its first file, and nothing in S4a depends on S4b.
**split.**
| Declaration | Label | Where |
|---|---|---|
| `registry.ts:31-154` types `TrashMarkerSpec`, `TrashDisplaySpec`, `TrashDisplayJoin`, `TrashCascadeSpec`, `TrashBlockerSpec`, `TrashHiddenWithParentSpec`, `TrashEntry`, `TrashRegistry` (with their doc comments) | MOVE | NEW `packages/cms/src/trash/registry-types.ts` (types only, universal), named type exports from `./trash` |
| `registry.ts:164-365` `buildTrashRegistry()` | **STAY-PRODUCT, whole** | it takes no input and returns a fixed `Map` of Tovu's trashable tables; it validates nothing today and gains no validator here. The file keeps its name and imports the types from `@jini-ai/cms/trash` |
| NEW `trashEntityLockKey({ entityType, workspaceId, entityId }, _optional = {})` returning `` `trash:${entityType}:${workspaceId}:${entityId}` `` | NEW (pure) | `packages/cms/src/trash/lock-keys.ts`, exported from `./trash`. The string is today's template at `table-adapter.ts:85`; hosts bind other packages' member/user locks to it |
| `entry-sql.types.ts` (`LooseTables`, `LooseExpressionBuilder`), `entry-sql.ts` (`loose`, `qualified`, `EntitySnapshotRow`, `readLiveSnapshot`, `entryWhere`) | MOVE | `trash/sql/entry-sql.types.ts`, `trash/sql/entry-sql.ts`. `loose(db)` takes `Kysely<unknown>`. The re-export line `entry-sql.ts:18` is not copied: importers take the types from the types file |
| `not-trashed.ts` (`TrashCondition`, `notTrashed`, `isTrashedRecord`) | MOVE | `trash/sql/not-trashed.ts`. `notTrashed(required, options: { registry })` becomes `notTrashed({ entityType, registry }, _optional = {})`; its only production call site is `entry-sql.ts:62`, which moves in the same J1 (the command `rg -n "notTrashed\(" apps/website/src -g '!**/__tests__/**'` prints that line plus doc-comment mentions); `__tests__/not-trashed.test.ts` and `move-to-trash.test.ts` change only their call shape (allowed edit (b)). `isTrashedRecord(required, options: { registry })` (`not-trashed.ts:109-112`; `options` is required, read 2026-11-17) becomes `isTrashedRecord({ entityType, record, registry }, _optional = {})`; it has no production caller outside the file |
| `repo.ts` `SqlTrashRepo` (232), `SWEEP_LOCK_KEY = "trash:sweep-claim"` | MOVE | `trash/sql/repo.ts`; `tables: { trashedItems: string }`; implements `TrashRepoPort` (`packages/cms/src/trash/ports.ts:246`); its `deleteById` / `deleteByEntity` remove the Trash's own bookkeeping row and move verbatim |
| `db-port.ts` (`TrashDb = ContentKernel`, 19 lines) | **STAY-WIRING** (su-refresh: was DELETE) | `TrashDb` reaches 11 files, most through the barrel (`index.ts:58`: `server/routes/types.ts`, `server/inbound/admin-http/routes/trash/deps.ts`, composition, memory slices, tests), which the facts importer list (direct importers only) does not show. Deleting a 19-line host type alias would widen the write set into T-PO-01g's `server/routes/types.ts` for no gain. Only the moved files stop importing it (Jini files use `StorageKernel`) |
| `ports.ts` (61) | STAY | `TRASH_RETENTION_DAYS = 60` equals Jini's `DEFAULT_TRASH_RETENTION_DAYS = 60` (`cms/src/trash/write-service.ts:93`, both read 2026-11-17). Not deduped here: `RemoveEntity` / `TransactionRunner` are host types |
| `repo.sqlite.ts` (`SqliteTrashRepo`, `createContentDbTransactionRunner`) | STAY-WIRING | `super({ kernel: schemaErasedKernel({ store }), tables: { trashedItems: "trashed_items" } }, {})` |
**port_compat (step 0).** `sed -n 246,300p packages/cms/src/trash/ports.ts` vs the 8 methods of `SqlTrashRepo`
(`insert, findByEntity, findByIds, deleteById, deleteByEntity, list, claimDue, releaseLease`): argument object fields,
`null` on miss, list ordering + cursor (`decodeTrashCursor`/`encodeTrashCursor` already come from Jini).
**characterization (T0).**
| Risk | Test (unmoved code, real kernel, fixed clock) | Mutation -> RED |
|---|---|---|
| Sweep claims rows not yet due, or two sweepers claim one row | `claimDue` with rows before / at / after `now`, and a live lease: exact ids; recording kernel shows `lockKey("trash:sweep-claim")` before the read; two concurrent `claimDue`: disjoint | drop the due predicate; drop the lock; ignore the lease |
| `notTrashed` per marker kind | truth table: timestamp marker, status marker, hidden-with-parent x (live, trashed, NULL), run as real `WHERE` clauses | invert one branch |
| `readLiveSnapshot` returns a trashed row | trashed and live row of one registered entry: only the live one | remove `notTrashed` from it |
| `entryWhere` loses the entry's fixed `scope` predicate (e.g. `type = 'widget'` on the shared `entries` table) | an entry with `scope` cannot address a row of another type by id | drop the scope clause |
**Lock-key builder test (NOT in T0: `trashEntityLockKey` exists only after J1).** J1 adds the Jini unit test
`packages/cms/src/trash/__tests__/lock-keys.test.ts`: `trashEntityLockKey({ entityType: "member", workspaceId: "w", entityId: "m" }) === "trash:member:w:m"`
(mutation: change a separator -> RED). T1 adds the Tovu test that the same call equals the string the unmoved
`table-adapter.ts:85` template produces for the same ids, and S0-P2 stays green (mutation: change a separator in either).
**tree after S4a's T1 (compiles alone).** `features/trash/`: `registry.ts` (fixed Map), `table-adapter.ts` (unmoved; its
imports of `./entry-sql.js`, `./registry.js` types and `./db-port.js` repointed to `@jini-ai/cms/trash/sql`,
`@jini-ai/cms/trash`, `ContentKernel`; its lock template untouched), `adapters/*` (imports of `loose` repointed),
`ports.ts`, `repo.sqlite.ts`, the rest untouched. `features/trash/index.ts` (110-line barrel, R-BARRELS): the re-export lines of moved
symbols are **deleted**, never repointed (a `+export { … } from "@jini-ai/…"` line is a forwarder and fires xpkg COMMON S3):
`index.ts:47-56` (the eight registry types), `:64` (`isTrashedRecord`, `notTrashed`), `:85` (`SqlTrashRepo`). Their barrel
importers, found with the multi-line command below (none of them is in the facts list), import from `@jini-ai/cms/trash`
(types) in the same T1: `features/entries/unreadable-owner-entries-repair.ts` (`TrashEntry`), `server/routes/types.ts`
(`TrashBlockerSpec`, `TrashRegistry`), `server/inbound/admin-http/routes/trash/deps.ts` (`TrashRegistry`),
`server/__tests__/admin-trash-items-blocker.test.ts` (`TrashEntry`; allowed test edit: import line only). `notTrashed`,
`isTrashedRecord`, `SqlTrashRepo` have no barrel importer (2026-11-17). `server/routes/types.ts` is also in T-PO-01g's set:
INDEX-SU §3a row added.
```bash
cd "$TOVU"   # barrel importers of moved trash symbols (multi-line imports included); every file must be in the list above
rg -l -U 'import[^;]*\b(isTrashedRecord|notTrashed|SqlTrashRepo|TrashEntry|TrashRegistry|TrashMarkerSpec|TrashDisplaySpec|TrashCascadeSpec|TrashBlockerSpec|TrashHiddenWithParentSpec|TrashDisplayJoin|createTableTrashAdapter)\b[^;]*from "[^"]*trash/index(\.js)?"' apps/website/src | sort
```

## S4b
**partition (finding 12).** `createTableTrashAdapter` is ONE function, lines 76-362: a closure over `entry` and a lazily
resolved kernel. It moves as top-level functions over an explicit context, bodies verbatim:
| New file (`packages/cms/src/trash/sql/`) | Declarations (from `table-adapter.ts`) | Size |
|---|---|---|
| `table-adapter.context.ts` | `TableTrashContext = { entry: TrashEntry; kernel(): Kernel; tables: { trashedItems: string } }`, `runOn({ ctx, fn })`, `lockRow({ ctx, workspaceId, entityId })` (calls `ctx.kernel().lockKey(trashEntityLockKey(...))`), `MarkerRow`, `VERSION_CHANGED` | < 60 lines |
| `table-adapter.rows.ts` | `isMarkerValueLive` (:54), `affected` (:59), `hasVersionChanged` (:64), `readMarkerRow` (:141), `readVersion` (:160), `writeMarker` (:175) | each < 30 |
| `table-adapter.cascade.ts` | `cleanUpTrashedItemsRows` (:93), `selectIds` (:106), `runCascade` (:119), `checkBlocker` (:201) | each < 30 |
| `table-adapter.transitions.ts` | `hideRow({ ctx, input })` (:228-257), `unhideRow({ ctx, input }, { priorMarker })` (:268-293) | ~30 each |
| `table-adapter.purge.ts` | `purgeRow({ ctx, input })` (:307-360) split at its two existing comment boundaries into `claimPreImage` (the no-op UPDATE claim) and `deleteClaimed` (the versioned delete + raced re-read); `purgeRow` keeps the order: lock, read, live check, version check, claim, cascades, delete | each < 40 |
| `table-adapter.ts` | the header comment (reworded neutral) and `createTableTrashAdapter({ entry, kernel, tables }, _optional = {})` returning `{ hide, unhide, purge }` that call the three row functions | < 40 |
Every inner helper takes `({ ctx, ...args }, _optional = {})`. The eslint limits line is the gate; a function over 50 after
the move is split only at an existing comment boundary, never by merging or reordering branches. If that is impossible: STOP.
**Deferred read (LESSONS 3).** Today `required.db` is read on first use (`resolved ??= required.db`), because composition
may hand in a lazy proxy. The Jini factory must NOT destructure `kernel` in its parameter list: `ctx.kernel` is
`() => (resolved ??= required.kernel)`.
**`trashed_items`** is named literally today (`cleanUpTrashedItemsRows`); in Jini it is `ctx.tables.trashedItems`.
**characterization (T0).**
| Risk | Test (unmoved code, real kernel; one fixture entry per marker kind built in the test, plus the real `member`, `form`, `taxonomy` entries) | Mutation -> RED |
|---|---|---|
| Classification order changes (not-found, version-changed, already-in-state, transition) | table per method x state; a version mismatch on an already-trashed row is `version-changed`, not a no-op | swap two checks |
| Idempotent re-hide / re-unhide writes or reports a change | second call: `{ ok: true, noop: true }`, row bytes unchanged, blocker NOT evaluated | drop `noop`; move the blocker check up |
| Restore loses the prior status | status marker: hide then unhide with the returned `priorMarker` restores the exact value; without it, `restoreFallback`; timestamp marker result has no `priorMarker` key | restore a constant |
| Purge of a LIVE row, or at a stale version | live row + matching version -> `version-changed`, row and children still present | remove the live check |
| Purge races a domain writer | a row updated between read and claim (inject by wrapping the kernel to run one UPDATE after the first read) -> `version-changed`, nothing deleted | remove the claim UPDATE's marker/version guards |
| Cascades: children, two-hop `via`, phantom `trashed_items` rows | purge a taxonomy with terms and a form with submissions: children gone, their `trashed_items` rows gone, in one transaction (a failing parent delete rolls all back) | skip `cleanUpTrashedItemsRows`; reorder cascade after the parent delete |
| Blocker | entry with a blocker refuses `hide` with today's result | drop the check |
| Lock | recording kernel: `transaction` -> `lockKey("trash:<type>:<ws>:<id>")` -> first read, for hide, unhide, purge | remove `lockRow` from each |
| Database opened at construction | `createTableTrashAdapter({ entry, get db() { reads++; ... } })`: `reads === 0` until the first call | destructure `db` eagerly |
**marker-sql parity (test only, no production edit).** One Tovu test runs the rows above that apply (hide / unhide /
purge classification, version precedence) against `adapters/marker-sql.ts` `flipMarker` / `compareAndDelete` and against the
table adapter over the same fixture, and commits the result table as test expectations. It decides S4d below.
**wiring.** `features/trash/table-adapter.ts` is deleted and `index.ts:60` (`export { createTableTrashAdapter }`) is deleted with
it (no forwarder). Its production constructor calls on refactor/terra (`rg -n "createTableTrashAdapter\(" apps/website/src`):
`server/runtime/composition/deps.ts:1641` (import at `:355` from the barrel), `server/runtime/composition/memory-deps/slices/trash-adapters-taxonomy.ts:23,33`
(import `:1`, type `:9`), `features/entries/unreadable-owner-entries-repair.ts:100` (import `:4`); tests: `assistant/__tests__/tool-registrations.trash-item.test.ts:140`,
`features/trash/__tests__/{move-to-trash:46,table-adapter.dialects:36,205,sweeper:195,245,term-trash-flow:84,member-adapter:46,269,follow-ups:73}`,
`server/__tests__/{admin-trash-items-blocker,admin-trash-routes}.test.ts`. Each passes `{ entry, kernel: <the same lazy value
passed as db today>, tables: { trashedItems: "trashed_items" } }` and imports from `@jini-ai/cms/trash/sql`. **`deps.ts` is a
shared file** (INDEX-SU §3.4: one sheet per wave whose wiring names a line there): S4b is the second known sheet after S6a.

## Round-1 item 1: the nine other adapters, per file (S4c is closed as a single sheet)
| File (lines) | Decision | Owner / when |
|---|---|---|
| `adapters/marker-sql.ts` (147), `comment.ts` (74), `post.ts` (91), `redirect.ts` (73), `media.ts` (95) | **STAY in Tovu.** They are bespoke per-table adapters over Tovu's product tables; the labelled end state ("canonical = table-adapter") is a registry ENTRY per domain, which is Tovu product content, not a Jini move | follow-up **S4d** (Tovu only, one adapter per commit, each gated on its row of S4b's parity table being identical; otherwise it stays, with the difference recorded). ~60k per adapter, not scheduled here |
| `adapters/member.ts` (64) | **STAY-WIRING.** It binds cms's `TrashAdapter` to members tables (revokes sessions, consumes sign-in links in the hide transaction); cms and user-management may not import each other | U1b pins its effect (its security table) and repoints nothing in it |
| `adapters/user.ts` (228) | **STAY-WIRING.** Binds the trash contract to identity purge, sessions and the outbox row format, under `trash:user:<ws>:<principal>` | S3b pins the key (P1) and leaves the file; S6a repoints its type import of `outboxEventValues` |
| `adapters/directory.ts` (253; `node:fs/promises`, `node:path`, `node:crypto`; no Tovu import) | **MOVE -> `@jini-ai/node-adapters`** (a Node runtime adapter of cms's `TrashAdapter` port type; xpkg OD-3) | needs xpkg N1 landed and a function partition (`createDirectoryTrashAdapter` spans :179-253). **Not written** (INDEX-SU §7, R3-2) |
| `adapters/plugin.ts` (1), `theme.ts` (3) | **STAY-PRODUCT** (entity-type names of Tovu folders) | - |

## stops
- Limits: T-SQLREPO §5 `limits` (eslint 50/10/10; `check:size` only errors at 80) on every new Jini file, after J1.
- An adapter must move for S4a or S4b to compile: `npm run typecheck` after each T1 is the command; do not move it, report.
- A trashable table's marker column, status value or `trashed_items` column would change: S0-P6 + the T0 tables.
- Facts-file flags `npm import "moved"` / `"Red"` on these files are generator false positives: `rg -n "from ['\"](moved|Red)" apps/website/src/features/trash` prints nothing.
Not verified while planning: the bodies of `repo.ts` methods beyond their signatures; `isTrashedRecord`'s parameter list;
whether `purgeRow` fits 50 lines after the two extractions (the gate decides; the split points are fixed above).
