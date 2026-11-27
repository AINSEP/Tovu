# Jini DB coverage gap fill

Test-only changes. Mutations below are hypothetical and were not applied or run. Every case was reviewed statically against the Author Checklist. No test, install, build, typecheck, coverage or mutation command ran.

## `packages/db/src/data-modules/__tests__/snapshot-recovery.test.ts`

- does not measure disk headroom or take a backup for non-file path (each row) → treat that spelling as file-backed in `isInMemoryDbPath`, or remove either caller's no-op guard.
- keeps persistent SQLite path eligible for backup (each row) → classify the corresponding ordinary or non-memory URI path as in-memory.
- disk headroom rounds up the combined DB and WAL requirement and reports a measurement → drop WAL size, floor instead of ceil, or skip statfs.
- a missing volume directory reports an unavailable measurement rather than an insufficiency → return `ok: false` in the measurement-error catch.
- a live WAL snapshot captures committed data and discarding it leaves the live data intact → replace online backup with raw main-file copy, or omit/misdirect final removal.
- snapshot cleanup tolerates an unlink error without deleting a directory or its contents → remove the catch or add recursive removal.
- a failed snapshot restore preserves the live database and existing sidecars → delete journal sidecars before copying the snapshot.
- journal begin and advance checkpoint the live file, while a staged terminal phase rolls back with DDL → omit either checkpoint, update the wrong row, or checkpoint from inside the staged transaction.
- SQLite boot unwinds only pending snapshots newest-first and removes stale sidecars → restore in ascending order, include terminal entries, change the audit/restore payload, or keep either sidecar.
- PGlite boot marks each pending attempt rolled back without filesystem restore and is idempotent → send PGlite through restore, never settle its journal rows, or settle just the first row.

## `packages/db/src/data-modules/__tests__/data-module.test.ts`

- rejects plugin identifier / tier-1 / empty declaration / table identifier / oversized qualified table / empty columns / column identifier / unsupported affinity / index identifier / oversized qualified index / empty index / undeclared indexed column → remove the matching validation check, or validate only the first indexed column.
- accepts a generated index including all 63 bytes → replace the identifier ceiling comparison with strict less-than.
- refuses additional primary key / required new column without default / type replacement / not-null tightening / not-null loosening / primary-key removal / primary-key promotion → remove the corresponding drift check or compare constraints in only one direction.
- reconciles index shape and nullable columns without dropping undeclared live data or repeating DDL → ignore index uniqueness, key order, or key count, drop undeclared objects, or omit ALTER and its timeline row.
- same-key provenance can adopt retained data without replacing the first minted identity → require all provenance fields to stay the same, allow a missing or mismatched signature, or update the first-mint identity on re-declare.
- a provenance mismatch refuses schema changes before creating new plugin tables → ignore the namespace-adoption refusal.
- refuses insufficient headroom reported as %j (both rows) → ignore `ok: false` or lose the numeric/unknown free-space diagnostic.
- a path mismatch warns and binds the checkpoint, snapshot, and DDL to the open file → use the supplied path for headroom, snapshot, or journal, or skip warning or committed snapshot removal.
- duplicate DDL rolls back the entire file-backed attempt and retains its forensic snapshot → remove the transaction, omit the rollback marker, or delete the failed snapshot.
- a failed catalog read is reported without revealing native SQL or applying DDL → propagate native diagnostic text into the result or discard it from the reporter.

## `packages/db/src/recovery/__tests__/journal-repo.sql.test.ts`

- the ledger applies each filter and paginates tied dates without skipping under insertion → drop any filter, make date-only upper bound midnight, omit either keyset comparison, or replace keyset with offset.
- the ledger preserves migration metadata and deduplicates repeat boot incidents → omit a ledger field, remove conflict handling, or rewrite the original incident timestamp.
- migration state updates preserve omitted fields and clear explicit nulls before resolution → apply undefined fields as null, ignore explicit null/false, or fail to terminalize the run.
- a site-scoped migration repository must not resolve another site's run → omit the site predicate on the resolution UPDATE. Known red by source inspection: that predicate is already absent (see handoff BUG).
- restore-point reads round-trip optional metadata and scope idempotency keys to their site → omit artifact/capture metadata, change a legacy default, or drop the site predicate.
- pruning removes expired files and rows while keeping active, protected and foreign restore points → remove only the file or row, or ignore active, protected or site boundaries.
- a failed unlink reports the original failure and leaves the restore-point row available for retry → delete its row before attempting unlink or swallow instead of forwarding the failure.

## `packages/db/src/kernel/__tests__/sqlite-only.test.ts`

- native catalog distinguishes views and preserves declared types, composite key ordinals, and generated columns → admit views, normalize type spelling/ordinal, or query table_info in place of table_xinfo.
- native schema returns original DDL, including the implicit unique index → exclude SQLite's implicit index or normalize DDL.
- a checked transaction can insert the parent later but rolls back all writes for a remaining violation → omit deferral, skip the final FK check, or throw the check outside the transaction.
- SQLite native catalog and transaction operations reject a Postgres kernel before any SQL or work → remove any operation's dialect guard.

## `packages/db/src/__tests__/runner.test.ts`

- backup failure stops migration unless the caller opts in to continue with the exact failure → ignore backup failures unconditionally, always throw, or notify completion for the failed copy.

## `packages/db/src/settings/__tests__/sql.repo.dialects.test.ts`

- SQLite definitions prefer an active version, fall back to the latest deprecated version, and read legacy coercion tags → invert version order, omit active preference, reject bare coercion tags, or return a parsed non-string as the tag.

## `packages/db/src/sqlite/__tests__/stopped.test.ts`

- stopped admission refuses a live writer, closes its probe, and re-admits after the writer stops → omit the exclusive probe, omit close, keep stale SHM, or read without strict table ownership/counts.
- stopped admission propagates a non-lock error and closes the admitted probe → map every error to busy, or omit finally close.
- admission refuses a sidecar still present after the connection closes (both suffixes) → check for only one suffix or check before close.
- inspection rejects integrity/absent counts, closes, and cleans up only its own sidecar → accept either error or remove all journals instead of only new ones.

## `packages/db/src/sqlite/__tests__/compaction.test.ts`

- never publishes a partial recovery copy after corrupt/I/O refusal → omit copy integrity check or catch cleanup, or mask unexpected I/O failure as corruption.
- keeps the recovery copy when the final checkpoint reports missing/busy → allow an absent/nonzero checkpoint and falsely record conversion.
- propagates a non-busy admission error after closing its probe and leaving the live file intact → collapse all native errors into busy, or leak the handle.

## `packages/db/src/__tests__/sqlite/db-ops.test.ts`

- a non-collision reservation error never invokes backup or overwrites a neighbouring artifact → advance on arbitrary reservation errors, or ignore the reservation before running backup.

## `packages/db/src/transfer/__tests__/destination-store.test.ts`

- address saves normalize plaintext, preserve a blank re-save, and reset last-run status on replacement → bypass normalization/sealing, treat blank as replacement, or retain the previous lastRun on replacement.
- redacts an invalid sealed connection string without blocking status metadata (both rows) → expose native validation or accept an invalid string, or decrypt in lastRun.
- a CAS conflict retries a metadata patch against the same sealed destination and preserves the concurrent edit → omit retry, reuse the stale revision, or replace the entire metadata object.
- a completion cannot overwrite a replacement with the same vault id and a new envelope → compare only id in the retry guard.
- propagates conflict / invalid-record after permitted attempts → retry every error, change the retry bound, or swallow exhaustion.

## `packages/db/src/site/__tests__/repo.memory.test.ts`

- ledger queries filter each field, break timestamp ties by descending id, and continue from the last row → drop any filter, reverse sort/tie order, or resume at the cursor rather than after it.
- interrupted migration rows use the original incident timestamp after repeat boot → remove the duplicate-id check.
- the default ledger clock supplies a timestamp without a host clock → drop the default clock or omit ISO normalization.
- restore-point listing preserves stored metadata, fills legacy defaults and looks up idempotency keys → read by restore-point id, reverse list order, or omit one fallback/metadata field.
- the site status starts serving and preserves the replacement status → ignore set or share status across instances.
- the memory database adapter uses unique increasing watermarks and never asks for a restart → freeze/reset the watermark or return restartRequired true.
- memory introspection reports an in-sync version-zero site and no pending migrations → change the health, schema snapshot, or pending defaults.

## `packages/db/src/react/recovery/__tests__/Recovery.states.unit.test.tsx`

- shows a load failure before the initial list, then keeps a loaded list visible with a later error → put the loading guard before error, or hide a loaded list on refresh failure.
- the create action disables during capture and selects only a recoverable row → remove the busy guard, enable an unavailable restore, or wire the row action to the wrong point.
- pending migration links to Database, while an interrupted migration has an assertive unavailable action → swap the actions, strip the assertive live region, or enable the unwired unblock button.
- disclosure distinguishes unknown from zero and exposes the baseline alarm only without a baseline → render unknown as zero, ignore the baseline flag, or prioritize counts over a load failure.
- a busy idle / planned / confirmed step names its progress and cannot dispatch again → omit the corresponding busy-disabled flag or use the idle action label during progress.
- only a concrete terminal result announces completion and a required restart → drop the concrete result guard, report restart unconditionally, or omit restart when required.

## `packages/db/src/recovery/__tests__/tool-registrations.test.ts`

- Recovery lists authorized persisted restore points and reports injected capability guidance → bypass the repo, omit a permission check, hardcode capability kind, or discard host guidance.
- status for serving / pending / interrupted reads the site's lock and reports the expected banner → omit or miswire the corresponding status/lock input, or acquire the lock during a read.
- deep-link resolution authorizes first, retrieves the captured point, and never trusts supplied metadata → bypass authorization, reverse lookup and authorization, or echo the envelope rather than reading the point.
- invalid deep link refuses before authorization or lookup (each bad shape) → omit the relevant object/number/string/nullable-string guard.
- restore planning returns the plan with only covered discarded-write counts → return only the plan or calculate counts from all reported categories.
- restore planning surfaces the gateway diagnostic (code/message rows) → swallow a refusal, drop the supplied message/fallback code, or compute disclosure after refusal.
- a failed confirmation surfaces its diagnostic without acquiring the lock (code/message rows) → acquire the operation lock after confirmation was refused or report the wrong diagnostic.
- a failed execute surfaces its diagnostic and releases the shared lock (code/message rows) → return success for the failed result, drop the diagnostic, or do not release the held lock.

## `packages/db/src/recovery/__tests__/tool-bindings.test.ts`

- the contribution builds the bound restore and uses the point id alone when its timestamp is absent → omit the contributed build callback, interpolate an absent timestamp, or proceed on a declined confirmation.

## `packages/db/src/site/__tests__/tool-registrations.database-recovery.test.ts`

- planning uses the agent identity and exact host ports, rejects extra input, and performs no confirmation → drop input validation, change actor kind, pass a different site port, or invoke confirmation during planning.
- the human confirmation layer receives the migration-specific dialog and validated empty input → forward extra input, reject absent input, or omit the migration tool id in the dialog.
- contributed database tools validate filters and authorize the right entity before returning site data → give the portable factory a permissive/nonfunctional input reader or lose workspace, entity, or permission mapping.
- the canonical capture handler uses host scope and persists a manual artifact only after authorization → skip the gate, omit the port's artifact or use request-provided provenance.
- missing canonical capture in the host factory is rejected at registration time → ignore a missing capture registration rather than surfacing its specific configuration error.

### Additional `data-module.test.ts` cases

- post-DDL verification rolls back other changes when storage accepts but omits a new table / nullable column / index → skip the corresponding catalog verification or move verification outside the transaction.
- a post-commit checkpoint failure does not turn durable DDL or the committed phase into a rollback → propagate the housekeeping error or move the COMMITTED marker to after the transaction.
- a file path mismatch on a memory connection warns without requiring disk or writing a journal → derive recoverability from the configured path instead of the open connection.

## `packages/db/src/events/__tests__/outbox.sql.repo.dialects.test.ts`

- a malformed envelope preparation cannot erase event data, and a retried claim retains the last error → skip the non-object/null fallback or lose last_error when projecting a retried claim.

## `packages/db/src/events/__tests__/change-set.sql.repo.dialects.test.ts`

- actor-only writes preserve attribution, while missing optionals remain SQL NULL and legacy actor ids stay kindless → drop actor.id fallback, invent a legacy actor kind, or change absence of header/item fields to non-NULL sentinels.

## `packages/db/src/gated-mutations/__tests__/sql.repo.dialects.test.ts`

- redemption does not report success when the database declines the guarded update → remove the zero-row refusal and incorrectly report a redeemed token while it remains minted.

## `packages/db/src/transfer/__tests__/copy-order.test.ts`

- a newly ready last-sorting table is queued after already ready siblings → prepend or splice at -1 when no existing queued item sorts after the newly ready table.

## `packages/db/src/transfer/__tests__/schema-catalog.test.ts`

- planned tables ignore non-table exports and preserve an explicit foreign-key update action → treat non-table exports as tables or hardcode the update action to no action.

## `packages/db/src/transfer/__tests__/confirmation-ui.test.ts`

- prints original timestamp text when unavailable and uses singular row counts without revealing credentials → return Invalid Date for unparseable times, pluralize one as rows, or expose the address.

## `packages/db/src/__tests__/kernel-session-lock.test.ts`

- the owner probes its reserved session before the next cycle and unlocks on a probe refusal → turn assertOwned into a no-op, or omit unlock when the callback rejects.
- session locking refuses active transactions and unregistered kernel wrappers without taking the lock → remove either admission guard.

## `packages/db/src/__tests__/kernel-core.foreign-join.test.ts`

- a driver that declares backup but has no adapter fails with the typed capability error → attempt to invoke the missing backup anyway or report success.
- lockKey refuses an unowned call, but a host-owned transaction uses the driver base executor → permit an unlocked call or reject/misroute the foreign transaction.

## `packages/db/src/__tests__/migrate/opt-in-runner.test.ts`

- legacy ledger rejects blank column and name identifiers or extra identities before writing → remove each of the three validation clauses.
- an unmapped persisted legacy row is identified and cannot be treated as a known step → discard the row or fabricate a known id instead of retaining its version and name.
- Postgres legacy ledgers persist a safe version above the 32-bit integer maximum and do not replay it → define the version as integer on Postgres or fail to match it on readback.

## `packages/db/src/__tests__/sqlite/checked-client.test.ts`

- a checked iterator can stop early even when the borrowed driver omits optional return → call iterator.return unconditionally, or lose bound parameters when iterating.

## `packages/db/src/__tests__/unit/transaction-outcomes-m2.unit.test.ts`

- failure-shaped domain data commits unless the root explicitly opts in and ok is the boolean false → default to rollback or treat any falsey/nonboolean ok as a failed Outcome.

### Additional `data-module.test.ts` case

- a hard-linked configured path is accepted as the same database and default headroom permits the checkpoint → compare path strings rather than device/inode, or mistakenly anchor the snapshot to the alias.

## `packages/db/src/secrets-vault/__tests__/repo.sql.characterization.test.ts`

- an omitted placement during a same-group replacement does not promote a non-default record → skip the same-group early return and query the group again, or treat the replacement as the first/default row and demote its peer.

## Handoff

- Expected red from source inspection, not executed: `packages/db/src/recovery/journal-repo.sql.ts:202-208` updates a migration run by ID alone. The multi-site regression in `journal-repo.sql.test.ts` expects the other site's active run to remain active. Apply the site predicate used by `updateState` or delegate to that method without changing timestamp semantics.
- Pure barrel exceptions: `data-modules/index.ts:9-17`, `events/index.ts:1-2`, `gated-mutations/index.ts:1`, `settings/index.ts:1`, `verified-origin/index.ts:1-2`. No independent runtime behavior.
- Defensive fallback exception candidates: `owner-store/index.ts:23-24` uses ungrouped COUNT(*), which produces one non-null row even with no matching rows. Existing `owner-store-rows.unit.test.ts` verifies 0/0 and 2/1 through real SQLite. `transfer/copy-order.ts:66,113,116` builds dense, validated structures locally, so a missing map key/shift value cannot arise for a valid input.
- The report contains no branch IDs or coverage JSON. Retain the cases above, then use the cloud report to target any remaining conditions after compilation and execution.

### Additional adapter cases

- `sqlite/__tests__/stopped.test.ts`: an opener failure removes a newly created inspection artifact and preserves the original error → skip cleanup when open fails before returning a handle, or replace the original error while closing.
- `__tests__/kernel-session-lock.test.ts`: a SQLite kernel cannot become a PostgreSQL session owner → remove the pooled PostgreSQL transport guard.
- `events/__tests__/outbox.sql.repo.dialects.test.ts`: preparation preserves a historical actor id without accepting a fabricated actor kind → preserve actorId only when an actor object exists, or accept the hook's invented actor kind.

### Static inventory

22 existing test files extended and 5 new test files added. 139 new cases, including parameterized rows. Production files, coverage configuration and existing assertions are unchanged. The worktree check was limited to path ownership, source review and diff whitespace. The cloud run still needs to compile and verify the suite and report actual coverage.
