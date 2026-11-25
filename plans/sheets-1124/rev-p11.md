REVISED r62t-rev-p11: 24 SOL sheets (13 Jini / 11 Tovu), 19 OPUS sheets

Rebased the handoff against merge-21 at Jini `010c8cd874f709ffa2c61de0de4e1dde4f808aad` and Tovu `7c87b3c3f95301d59f55041bf163b723bbab5d79`. G1–G6 remain absent. No files changed and no tests, builds, installs, or type-checks ran. Locate existing code by the named function, since both tips moved since the original sheets.

`J/` means Jini `packages/`. `W/`, `A/`, and `D/` mean Tovu `apps/website/src/`, `apps/admin/src/`, and `apps/desktop/src/`. The sheets are grouped in the requested dispatch order. A later-listed prerequisite still gates landing, package consumption, or activation. In particular, ST-11b.T consumes ST-11a.J, and the desktop Sol leaves join the partitions package established by ST-2a.J.

**Build conventions.** Write the named tests first. Sol does not run them. Opus runs the named tests and mutations before release. Mutations are temporary and never committed. New public functions and factories take two objects, with `_optional = {}` when no options are needed. Keep dependencies injected, required hooks required, the admin kit host-supplied, and product copy on existing args. Move why-comments with the code. Keep functions at most 80 lines and complexity at most 10. Jini remains vendor- and server-framework-neutral. Extend existing exports or add direct owner subpaths, never re-export shells. For Jini public changes, update export conditions, declarations, changesets, and `api-baseline/jini-ai__<package>.json` as applicable. Tovu updates the consuming workspace manifest and lockfile to the actual released version. Themes stay in Tovu.

**ADR-066 and design corrections.** In `plans/ALGO-P11-storage.md` §15.1 and §18.1, replace the registry/checksum instructions with the following. Append the numbered TS step in `migrations/index.ts` using `pinned("<key>")`. Sol leaves `checksums.ts` unedited and hands off the missing pin. Opus generates it using `UPDATE_MIGRATION_CHECKSUMS=1` on `__tests__/checksums.test.ts`, which appends new IDs only, then reruns without the flag. Never edit `source-digests.ts` for a new step. No TS `when`, new journal, Drizzle entry, or snapshot. The Drizzle chain is frozen at `0077`. In §15.1 use `chat/0004_chat_pinned`, the shared `idx_ai_chats_owner_cleanup` name, and separate migrated and fresh-bootstrap paths. In §18.1 replace stale `content/0043` with `0046_blob_gc_journal`, name the `freshSiteOperations` entry, and specify report-only registration. These are design replacement instructions, not edits made in this read-only dispatch.

**Pin-generation detail for Opus.** On this base, `pinned()` throws at module import if the key is missing, before the updater test can run. For each new key, temporarily allow only that missing key to return a placeholder in `pinned()` and only with `UPDATE_MIGRATION_CHECKSUMS=1`. Run the updater, which writes the new pin before asserting on its original in-memory list. Remove the temporary branch, rerun the test without the flag, and verify that only the new pin was added. Do not commit the bypass or a placeholder checksum.

## Jini SOL

### ST-7b.J — Maintenance running record
BUILDER: SOL

In `J/platform/src/fs/directory-running-lock.ts`, add `purpose?: 'serve' | 'maintenance'` to `DirectoryRunningRecord`. In `validRunningRecord`, reject malformed purpose and require `port === 0` for maintenance. In `update({ token, port }, {})`, throw `"A maintenance owner has no address."` for a maintenance record. Export `isServeRecord({ record }, {})`, true only for omitted purpose or `'serve'`. Preserve token, boot, and PID identity and token-matched release. The current host workspace is backed by `createNodeDirectoryWorkspace`, so also thread the optional purpose through its existing `claim` args to the record it constructs in `J/platform/src/fs/directory-workspace.ts:272–274`. This is the forwarding seam, not a second locking policy.

Extend `@jini-ai/platform/fs`, minor and baseline. Tests first `contested claim returns the maintenance record (incl. legacy record without purpose = serve)`, rejecting a nonzero maintenance port and rejecting `update` for a maintenance record. Mutation drop purpose from the contested claim. The polling loop belongs to Tovu. Comment why a portless maintenance owner is never an attach target.

### ST-8a.J — Chat cleanup contracts, store, and routes
BUILDER: SOL (OPUS-REVIEW)

Add `J/core/src/contracts/storage/cleanup-preview.ts`, `J/platform/src/retention/preview-store.ts`, `J/chat/src/store/sql/bulk-deletion.ts`, and `J/chat/src/server/chat-cleanup-routes.ts`. `createCleanupPreviewStore({ randomToken, mono }, { ttlMs = 900000 } = {})` exposes `put({ principal, kind, scope, payload }, {})` and atomic `take({ token, principal, kind, scope }, {})`. Use one outstanding token per principal/kind, 128 unpredictable bits, and rotate on partial apply without extending the deadline.

In `J/chat/src/store/sqlite/schema.ts`, add nullable `pinned_at INTEGER` to `ai_chats` and place the cleanup index after the owner index at lines 51–52. Use `idx_ai_chats_owner_cleanup(scope_id, owner_kind, owner_id, pinned_at, updated_at)` in both repos. The Jini review shorthand `ai_chats_owner_cleanup` and the Tovu exact DDL must not create two differently named indexes. Add the column to `store/sql/tables.ts` and map the conversation row. Add `setPinned({ id, pinned }, {})` and `updateConversation({ id, title?, pinned? }, { source = 'manual' } = {})` to `ChatStore` in `store/ports.ts`, implemented next to `rename` in `store/sql/store.ts`. Do **not** add them to the `ChatHistoryStore` Pick. Combined updates use one owner-scoped transaction. Pin alone never changes `updated_at`.

`createChatBulkDeletion({ kernel, scope, now, openConversations }, { previewLimit = 5000 } = {})` returns `preview({ before }, {})` and `apply({ ids, before? }, {})`. Preview counts bytes and names kept reasons. Apply uses only authorized IDs, at most 500/request and 50/transaction. Take sorted `chat-slot:<id>` locks and recheck ownership, pin, cutoff where applicable, open state, queued/running state, and recoverability. Unknown liveness keeps the chat. No bulk cancel or finalizer. Bulk pinned deletion defaults off.

`createChatCleanupRoutes({ paths: { patch, preview, apply, deleteSelected }, bulkDeletionFor, previewStore, store }, {})` returns four `defineJsonRoute` specs, all with `requireSameOrigin: true`. Give each a small deps type and inject paths, authenticated owner, clock, token store, and compatibility copy. PATCH accepts `{ title?, pinned?, source? }`, preview `{ before }`, apply `{ previewToken, confirm: true }`, and delete-selected `{ ids, confirm: true }`. Delete-selected uses the server’s per-ID recheck, not a preview token. The host owns mounting and the existing rename wire shape. No Tovu URL in Jini.

Export `@jini-ai/chat/server/chat-cleanup-routes`, extend existing chat store/core, core storage, and platform retention exports, and update minor releases and baselines. Tests first `pinned after preview is kept`, `run started during cleanup is kept`, `never crosses owners`, `chat that became old after preview is not deleted`, `batches ≤ 500`, `pinning keeps the chat's place`, `a token cannot be replayed or used by another admin`, `bulk delete of an active chat keeps it and names it`, and `delete-selected without confirm is refused`. Mutations drop the pin recheck and reselect by date. Comment why the run-slot lock is the bulk fence.

### ST-8b.J — Required conversation hooks and cleanup dialog
BUILDER: SOL

Edit `J/chat/src/react/components/ConversationList.tsx` and `ConversationList.hooks.ts`, plus `J/chat/src/react/features/conversation-chat-pane/components/ConversationChatPaneHeader.tsx` and `ConversationChatPane.tsx`. Keep `defaultConversationListHooks` exported, but make `hooks` a **required** prop with no render-time fallback. Thread it through the injected header. `ConversationList({ hooks, ...props }, _optional = {})` accepts `pinned?`, `selectable?`, `selectedIds?`, `onTogglePin({ id, pinned })`, and `onSelectionChange({ ids })`. Sort stably with pinned items first. Shift range uses the displayed order. Support Space and focus.

Add `J/chat/src/react/components/ChatCleanupDialog.tsx` with `ChatCleanupDialog({ useChatCleanup, kit, copy, onDone }, _optional = {})` for preview, confirm, partial, and expired states. Inject callbacks, hooks, transport, locale, and kit. Neither view fetches. Existing `@jini-ai/chat/react`, **major** release, baseline and caller updates. ST-10.T must consume this major. Tests first `pin toggles through props`, `selection emits ids`, `selection is keyboard reachable`, `dialog shows the server count before deleting`, `kept items are named`, and `uses injected hooks`. Mutations ignore pinned and apply without a token. Comment why optimistic state belongs to the host.

### ST-12a.J — Share-create expiry input seam
BUILDER: SOL

Edit `J/cms/src/admin-http/routes/system/site-shares.ts` and route tests. Extend the existing create input with `{ jobId?: string, expiresInDays?: 7 | 30 | 90 | null }`. In `siteShareCreateRoute` at lines 146–150, when `input.jobId` is a string, pass only `{ jobId }` as the parsed job input alongside authenticated context. Drop `expiresInDays` from a poll. Initial create and `siteShareStaticCreateRoute` pass the initial choice through the existing `backend.create` seam. Host injects parser, backend policy, copy, and authorization. Preserve trust, RBAC, availability, parse order, and status/error shape. No new registrar.

Existing CMS subpath, additive minor and baseline. Tests first `no expiry by default`, `list passes a row with url:null and no storage through unchanged`, and poll cannot revise the initial choice. Mutation inject 14 days when omitted. Comment why job polls cannot change a promised lifetime.

### ST-12b.J — Share expiry controls
BUILDER: SOL

Add `J/devops/src/react/site-share-expiry/{ShareExpiryControls.tsx,index.ts}`. Export `ShareExpiryControls({ useShareExpiry, kit, copy, choices, status, expiresAt }, _optional = {})`. Display Never by default, 7/30/90 only for supported destinations, and expired rows by default. Inject the required hook, copy, kit, and `showExpired` through the props.

Follow `src/deploy/react` and `J/devops/package.json:24,92,140`. Add `jini.entries["./react/site-share-expiry"] = "browser"`, the export with types/import/default, a `typesVersions` entry, and the existing optional-React message convention. Export `@jini-ai/devops/react/site-share-expiry`, devops minor and baseline. Record the accepted design deviation: generic controls in Jini, destination eligibility and copy in Tovu. Use `// @vitest-environment jsdom`. Tests first `active link without expiry untouched` and `acknowledge after expiry keeps it expired`. Mutation treat missing date as expiry. Comment why absent recipient URL is not evidence that a link is inactive.

### ST-13.J — Revision thinning engine and specs
BUILDER: SOL (OPUS-REVIEW)

Add `J/cms/src/posts/revision-thinning.ts` and `J/cms/src/admin-http/routes/posts/revision-thinning.ts`, with typed per-route deps. Record the accepted deviation from ALGO-P11 §20. The generic engine and specs live in Jini CMS, while Tovu owns repository adapters, authorization, and activation. Ship disabled under STOP 6.

`createRevisionThinning({ revisions, protections, previewStore, clock }, { limit = 500 } = {})` exposes `preview({ principal, scope: { workspaceId, postId, kind }, olderThan }, {})` and `apply({ principal, scope, previewToken, confirm }, {})`. Required `revisions` ports are `withPostLock({ scope, run }, {})`, `listOldest({ scope, olderThan, limit }, {})`, `newestId({ scope }, {})`, and `deleteIds({ scope, ids }, {})`. Required `protections` are `isPublished`, `isRestoreTarget`, `isRestoredFrom`, and `isUndoReferenced`, each `({ scope, id }, {}) => Promise<boolean>`. A throw means keep. Bind preview to one post or HTML page. Under the lock, delete at most the confirmed, unprotected, contiguous oldest run of snapshots. Keep newest. No invented `previous_id` update. Host supplies date-only policy and authorization.

Export the two direct CMS leaves, minor and baseline. Tests first `published / restore / undo targets kept`, including a `restored_from` target, `newest kept`, `requires explicit scope`, `undo reference added after preview is kept`, and `history reads the same after thinning`. Mutation drop undo protection. Comment why a gap in protection stops thinning.

### ST-15a.J — Storage report and cleanup specs
BUILDER: SOL

Add `J/platform/src/retention/routes.ts`. `createStorageRoutes({ paths: { report, cleanup } }, _optional = {})` returns GET report with `{ measure }` and POST cleanup with `{ runOnce }`. Pass `'storage.manage'` to `ports.authorize` on both. The cleanup input is `{ dryRun?: boolean; classes?: string[] }`. Default `dryRun` to true. Refuse every class outside `cache | derived | old-copy` with injected plain copy in both modes. Set `requireSameOrigin: true` on cleanup. No HTTP-server or domain implementation imports.

Export `@jini-ai/platform/retention/routes`, minor and baseline. Tests first `cleanup defaults to dryRun`, `content class refused in plain words`, owner role only, and a dry run during a live pass still returns measurement. Mutation default `dryRun` to false. Comment why measure and sweep produce distinct outcomes.

### ST-17.J — Shared admin Storage panel
BUILDER: SOL

Add `J/admin/src/screens/storage/StoragePanel.tsx` and render tests. Export it directly at browser subpath `@jini-ai/admin/screens/storage/StoragePanel`, admin minor and baseline. Record the accepted deviation from ALGO-P11 §23, which put the screen in Tovu. Do not add JSX or a React peer to platform, or any domain dependency to admin.

`StoragePanel({ useStorage, kit, copy, links }, _optional = {})` requires the injected hook. Render “Cleaned automatically”, “Yours”, and “Shown only”. Flow is load → dry run → outcomes → owner confirm → live → freed/failures. Show last automatic pass and supplied domain links. Host injects report/cleanup hooks, notices, and links. Tests first `three class labels` and `dry-run list first`. Mutation skip the dry run. Comment why measurement comes before offering a destructive choice.

### ST-17s.J — Screenshot writer and manual retention
BUILDER: SOL

Add `J/integrations/src/web-screenshot/capture-retention.ts`, neutral preview/apply specs, and tests. Edit `createCaptureFileWriter` in `capture-files.ts:31–47`, which currently opens the final path with `wx` and has no lock. `createCaptureFileWriter({ rootDir, lock }, {})` stages `<name>.partial` exclusively, renames to the final name after completion, and holds injected `lock.withLock({ key: rootDir, run })` through publication. Preserve exclusive naming and do not overwrite an existing capture.

`createCaptureRetention({ root, listOwned, removeOwned, previewStore, clock }, { limit = 500 } = {})` exposes `preview({ principal, scope, before }, {})` and `apply({ principal, scope, previewToken, confirm }, {})`. Use the same root-keyed lock. List only non-`.partial`, writer-owned regular files verified by `lstat`, with no symlinks or caller-supplied paths. The opaque token captures stable identity. Apply rechecks identity, containment, and cutoff under the lock. Unknown, replaced, or linked files stay. Host supplies authorized principal, root, and ports.

Export `@jini-ai/integrations/web-screenshot/capture-retention`. The new leaf is additive, but the required writer port changes the existing writer API, so the release and baseline must cover that break. Tests first `preview shows only older completed captures`, `replaced capture is kept`, and `in-progress capture is kept`. Mutation delete by cutoff alone. Comment why screenshots are owner artifacts, not a cache.

### ST-6c.J — Owned temporary roots
BUILDER: SOL

Add `J/platform/src/fs/owned-temp-root.ts` and tests. Record the accepted deviation from ALGO-P11 §9.7, which put the helper at `W/platform/temp/owned-root.ts`. Generic protocol is in Jini. Hosts supply product-specific prefixes and roots.

`withOwnedTempRoot({ parent, prefix, id, fs, lock, work }, _optional = {})` locks before creating a `0700` exact UUID root. Hold through child exit, read, and publication. Remove in `finally` and preserve durable writer provenance if removal fails. `sweepOwnedTempRoots({ roots, fs, lock, clock, signal }, { olderThanMs = DAY, limit = 20 } = {})` verifies exact name, provenance, age, proven dead owner, containment, and unchanged identity under exclusion. No links. Legacy and unconfirmed roots are report-only. Include design step 7: a `.lock` with a proven dead owner and no root is removed via the same stale-break path.

For the chat transfer writer, `J/db/src/transfer/sqlite-backup.ts:13–14` currently creates its own `mkdtemp` root. Give `captureSqliteBackupBytes` an additive `withTempRoot` effect on its second args object. When supplied, run the existing backup/read body in that root rather than allocating a nested temp directory. Tovu injects the owned-root wrapper. No DB-to-platform implementation import.

Extend `@jini-ai/platform/fs` and the existing DB transfer surface, minor and baselines. Tests first `only named prefixes in the named root are touched`, `a root with a live marker from another process is kept`, `pre-protocol leftover is report-only`, `writer creates the lock before the folder`, `root kept while the worker runs`, `symlinked root skipped`, and dead-owner lock with no root. Mutation match by prefix without the exact UUID pattern. Jini tests do not contain `tovu-`. Comment why age cannot establish owner death.

### ST-1.J — Packaged evidence and cache caps
BUILDER: SOL

Add `J/desktop-host/src/electron/partitions/cache-maintenance.ts`. Define:

```ts
type PackagedEvidence = {
  cap: 'go' | 'no-go' | 'unknown'
  clearOps: {
    clearCache: 'go' | 'no-go' | 'unknown'
    clearCodeCaches: 'go' | 'no-go' | 'unknown'
  }
}
```

`applyDesktopCacheLimits({ appendSwitch, evidence, cacheBytes }, _optional = {})` and `clearPartitionCacheOnce({ partition, interlock, fs, measure, marker, evidence, capBytes }, { fallbackMultiplier = 2 } = {})` require the byte values. Only `'go'` permits the specific mutation. Cap evidence gates the pre-ready switch. Per-operation evidence separately gates each clear. Boot uses unheld cache-only rename. Open uses measured `clearCache` before first use. Mark done only after a successful clear or verified below-threshold measurement. Busy and unknown remain pending. Non-GO cap with GO clear evidence uses periodic enforcement at ×2, never a permanent latch.

Land on the partitions leaf established by ST-2a.J. Desktop-host minor and baseline. Tests first `T-1.2 NO-GO evidence ⇒ no switch`, `T-1.3 a busy partition is retried next start`, `T-1.4 marker is per profile`, `T-1.5 held elsewhere ⇒ untouched`, and `T-1.6 Cookies, Local Storage, IndexedDB files byte-identical after the pass`. Mutation mark before clearing. Comment why periodic enforcement is not a disk bound.

### ST-3.J — Code-cache maintenance
BUILDER: SOL

Extend `J/desktop-host/src/electron/partitions/cache-maintenance.ts` with `clearCodeCacheOnUpdate({ interlock, fs, marker, evidence, version, isUpdate }, _optional = {})` and `maybeClearCodeCacheAtOpen({ session, measure, evidence, marker, clock }, { maxBytes = 64*MiB, timeoutMs = 10000 } = {})`. Write pending before launch version. On boot rename only unheld `Code Cache`. `maybeClearCodeCacheAtOpen` runs **only** as the interlock’s `openMaintenance` hook, at ST-2a step 2.5 after the other-holder check. It does not perform an independent holders check. Require measured size and packaged evidence that the operation preserves cookies. Busy, failure, or timeout does not mark success. Keep observed timeout separate from actual settlement.

Same desktop-host subpath, minor and baseline. Tests first `T-3.1 update launch clears code cache of unheld partitions`, `T-3.2 held partition untouched`, `T-3.3 > 64 MB cleared at open`, `T-3.4 busy code cache retried next start`, `T-3.5 storage untouched`, and `T-3.6 second window of a held site does not clear` through `acquireSiteSession`. Mutation clear a held partition. Comment why a second window must skip maintenance.

### ST-2b.J — Retirement ledger
BUILDER: SOL

Add `J/desktop-host/src/electron/partitions/retirement-ledger.ts` and tests to `@jini-ai/desktop-host/electron/partitions`. `createRetirementLedger({ profile, durableJson, clock, id }, { terminalRetentionDays = 90 } = {})`. Return `append({ candidate }, {})`, `invalidate({ partition, reason }, {})`, `transition({ id, from, to, reason?, asideIdentity? }, {})`, `readStrict({}, {})`, `pruneTerminal({ unresolvedAsideIds }, {})`. Candidate binds canonical profile, session root, partition, opaque subject ID, site path, directory dev/ino/birthtime, parent dev and erase version/time. Only pending→removed/invalidated are terminal. “Kept” is pending with reason. Corrupt ledger provides no whole-remove authority. Inject synchronous durability; only the erase arm has append authority in Tovu. Desktop-host minor/baseline, same subpath. Tests first `T-2b.4 record carries profile, sessionRoot, dirIdentity, parentDev`, `T-2b.5 invalidated record never returns to pending`. Mutation permit invalidated→pending. Comment why terminal proofs with unresolved aside directories cannot be pruned.

## Tovu SOL

### ST-6a.T — Site retention lifecycle
BUILDER: SOL

Create `W/server/runtime/composition/retention.ts`. Edit `serving-app.ts`, `W/cli/commands/serve.ts`, and `W/index.ts` with lifecycle tests. `startSiteRetention({ createRunner, policiesForSignal, clock, scheduler, reportError, log }, { bootDelayMs = 300000, intervalMs = DAY, scheduledDryRun = true } = {})` returns `listenerReady`, `runOnce`, `lastReport`, and `stop`. Import `createRetentionRunner` from released `@jini-ai/platform/retention` (`J/platform/src/retention/runner.ts:81`). `policiesForSignal` returns `[]` in this commit. ST-6b and ST-6c add their policies later. No finalizer witness fixtures or trim registration here.

Bind lifecycle in both serving roots only for the site-owning lease. In `W/index.ts`, only start when `runningLease` is defined and owned, so never for `useMemory` at line 171. Start delayed boot and periodic timers after real listener readiness. On stop, cancel timers, abort bounded work, and drain before closing either store. Inject `reportError({ error, policyId }, {})` and bind it for now to `console.warn(formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS))`, following `serve.ts:195`. Do not import a P4 reporter.

Tests first `never starts on a client role`, `stop drains before storage closes`, `report line written`, `boot pass waits for ready`, and `no chat, revision, screenshot or media policy is registered`, asserting no policy ID or kind names a content class. Retain ST-4 mixed-mode tests. Mutation start on every role. Comment why exporter, daemon, attached serve, and memory-only roots do not own this runner.

### ST-6b.T — Verified database-copy retention
BUILDER: SOL

Create `W/server/runtime/composition/retention-policies/database-copies.ts` and `W/platform/db/sqlite/copy-coordinator.ts`. Edit `content-db.ts`, `site-deps/database-journal.ts`, and `W/platform/db/sqlite/db-ops.ts`. Consume released `@jini-ai/db/sqlite` backup policy and ST-6a lifecycle. `createDatabaseCopyPolicy({ opsDirs, verify, listProtected, mutex, fs, selectCopies, signal }, { keep = 5, limit = 20 } = {})`. Implement `withCopyPublication({ opsDir, work }, {})`, `holdCopy({ path, work }, {})`, and `pruneMigrationCopies({ opsDir, justWritten?, verify, held, listProtected }, {})`. Serialize actual publication and use the same pruner from the migration callback and daily pass.

The Recovery screen lists journal rows via `registerAdminRecoveryRestorePointsListRoute` in `W/server/runtime/composition/modules/database-recovery.ts:105–108`, using the `SqliteRestorePointsRepo` bound in `site-deps/database-journal.ts:47–56`. The artifact byte read is not in the screen or list route. HTTP and tool Restore share `W/features/recovery/gated-hooks.ts:7`, which delegates to `J/db/src/recovery/restore-hooks.ts:115`. Place `holdCopy({ path: artifactRef, work }, {})` at `SqliteDbOpsAdapter.restoreFromArtifact` in `W/platform/db/sqlite/db-ops.ts:92–93`, around the entire delegated restore. Inject the same coordinator used by the policy and publisher. Do not hold a file for a metadata-only list operation.

Use exact existing filename/sidecar grammar, verified anchor containment, read-only `quick_check`, journal markers, and registered readers. Unknown protection means no deletion, including sidecars without proven provenance. Chat boot has no corresponding publisher to retrofit. Pre-compact copies become eligible only with later verified boot evidence and no protection marker. Tests first `default keeps 5`, `no verified copy → nothing removed`, `a pass waits for backup publication`, `protected restore points kept`, `a copy open in Recovery is kept`, `foreign file in ops is ignored`, and `migration callback uses pruneMigrationCopies`. Mutations prune without the shared mutex and trust newest without verification. Comment why age is not recoverability evidence.

### ST-6c.T — Host-owned temp-root bindings
BUILDER: SOL

Consume released `@jini-ai/platform/fs` owned-root helpers and the `@jini-ai/db/transfer` backup seam. Add `W/server/runtime/composition/retention-policies/temp-roots.ts` with `createSiteTempRootPolicy({ roots, withOwnedTempRoot, sweepOwnedTempRoots, fs, clock, fileLock, signal }, { graceMs = DAY } = {})`. Bind writer and sweeper to exactly the following configured parents. For legacy `tmpdir()` allocators, resolve `tmpdir()` at composition and inject that same parent into both sides.

| `parentExpr` | `prefix` | Existing writer or forwarding anchor |
|---|---|---|
| `tmpdir()` | `"tovu-import-db-"` | `W/features/site-backup/import-database.ts:60` |
| `tmpdir()` | `"tovu-share-projection-"` | `W/features/site-backup/share-database/repo.sqlite.ts:325`, `sanitizeShareDatabase` |
| `tmpdir()` | `"tovu-archive-media-"` | `W/features/site-backup/share-database/repo.sqlite.ts:399` |
| `tmpdir()` | `"tovu-static-copy-"` | `W/features/site-backup/static-copy.ts:166` |
| `required.snapshotRoot`, forwarded as `optional.snapshotRoot` | `"tovu-snapshot-"` | `W/features/site-backup/share-preparation-steps.ts:43` → `sources.ts:542–553` |
| `tmpdir()` at transfer composition | `"tovu-transfer-chat-"` | `W/server/runtime/composition/database-transfer-adapters.ts:30–41` and `site-deps/route-deps-assistant-mcp.ts:135`. Current allocator is `J/db/src/transfer/sqlite-backup.ts:14`. |

Replace each allocator with the owned-root protocol, including both chat transfer entry points. Keep snapshot, ZIP, and publisher work inside `work` until the last read or publication completes. Delete the call and import at `W/cli/commands/serve.ts:195` and replace it with the retention policy. In `W/features/site-backup/import-backend.ts:219`, preserve `registry.expire({})` but remove the remaining broad `tidyImportDatabases` call. No parallel wildcard tidier. Explicit `out/export`, `--out`, themes, foreign, and pre-protocol roots never enter deletion.

Tests first `a root with a live marker from another process is kept`, `only named prefixes in the named root are touched`, `writer creates the lock before the folder` for each writer, `root kept while the worker runs`, and `pre-protocol leftover is report-only`. Mutation broadly match `tovu-*`. Comment why a publisher’s last read is part of the writer lifetime.

### ST-9.T — Pinned chat migration and route mounts
BUILDER: SOL (OPUS-REVIEW)

Add `W/platform/db/migrations/chat/0004_chat_pinned.ts`. Register step ID `"0004_chat_pinned"` after `activeRunIndex` in `migrations/index.ts:135` as `chatPinned({ checksum: pinned("chat/0004_chat_pinned") }, {})`. Leave `checksums.ts` and `source-digests.ts` untouched in Sol. Opus generates the missing pin with the updater, reruns without the flag, and leaves all existing pins untouched. No `when` or journal changes.

Export `chatPinnedStatements({ dialect }, _optional = {})` following `activeRunIndexStatement`. SQLite uses `ALTER TABLE ai_chats ADD COLUMN pinned_at INTEGER`, only when `SELECT 1 FROM pragma_table_info('ai_chats') WHERE name='pinned_at'` finds nothing. Apply this guard in both SQLite paths so adopted files work. PG uses `ALTER TABLE ai_chat.ai_chats ADD COLUMN IF NOT EXISTS pinned_at BIGINT`. Both create `CREATE INDEX IF NOT EXISTS idx_ai_chats_owner_cleanup ON <table>(scope_id, owner_kind, owner_id, pinned_at, updated_at)`, with the PG-qualified table. `openSiteChatDb` at `chat-db.ts:49–57` runs the TS chain. `openChatDb` at lines 67–73 is synchronous with no ledger. Call the shared DDL there immediately after the current active-run index and before returning. Do not edit historical baselines.

In `W/server/runtime/composition/modules/assistant-chats.ts`, add `mountChatCleanup({ app, ownerStoreFor, ownerCheck, openConversations, previewStore, adminPorts }, _optional = {})` using released `@jini-ai/chat/server/chat-cleanup-routes`. Mount through `mountAdminJsonRoute` (`admin-json-route-ports.ts:343`) after existing `requireAdminSession` and reconcile gates. The Jini PATCH spec **replaces** `app.patch(…renameChatRoute)` at line 331. Preserve the rename `{ conversation }` DTO, validation/error wire shape, manual/generated source behavior, and indistinguishable not-found response for an unowned ID. Pin and rename together use one Jini transaction. The three POST mounts `cleanup/preview`, `cleanup/apply`, and `delete-selected` require same origin, as does PATCH. Preserve single-delete cancellation. Owner and workspace come only from `getAuthedPrincipal(res).id` and `deps.workspaceId`, as in `storeFor`. Ignore body or query `ownerId` and `workspaceId`.

Tests first `rename still works with no pinned field`, `generated title does not override a manual rename`, `fresh bootstrap = migrated schema`, `migration manifest is complete`, adopted SQLite parity, wire owner and CSRF checks, and body/query owner and workspace spoofing ignored. Add `W/platform/db/migrations/__tests__/no-vacuum.test.ts`. Recursively scan every non-test `.ts` under `migrations/`, including `chat/`, `project/`, and `commerce/`, for `/\bvacuum\b|auto_vacuum/i`. Mutations add `VACUUM` to `0004` and omit fresh DDL. Comment why fresh and upgraded schemas must agree without rewriting history.

### ST-10.T — Admin chat cleanup UI
BUILDER: SOL

Consume the actual **major** `@jini-ai/chat` release from ST-8b.J and the mounted ST-9.T transport. Put `useWiredChatCleanup({ client, kit, copy, clock }, { defaultOlderThanDays = 90 } = {})` in `A/hooks/assistant-chats-dependencies.hooks.ts`. Its `@file` declares this the only hook file that may reach the real assistant chat client. Add transport methods in `A/lib/assistant-chats.ts`. In `A/components/AssistantDock/DockHeader.tsx:89`, pass `ConversationList` its required `hooks` prop without a default and supply the required dialog hook.

Wire pin, selected IDs with visible confirmation, and the 1–365 day chooser with server count, bytes, and kept reasons. Never persist preview tokens in browser storage. Follow continuation only for the same confirmed preview. An expired preview returns to choosing. Tests first `dialog shows the server count before deleting`, `kept items are named`, and `uses injected hooks`. Mutation call apply without a preview token. Comment why selection or an optimistic pin does not authorize deletion.

### ST-11b.T — Blob journal and report-only media policy
BUILDER: SOL

Consume the released ST-11a.J CMS/core contracts. Add `W/platform/db/migrations/0046_blob_gc_journal.ts`, `W/platform/db/repos/blob-gc-journal.ts`, and `W/server/runtime/composition/retention-policies/media-bytes.ts`. Export `BLOB_GC_JOURNAL_STATEMENTS` following `0045_media_captions.ts`. Use the same SQL in both dialects, matching `asset_blobs` text timestamps:

```sql
ALTER TABLE asset_blobs ADD COLUMN purge_reason text;
CREATE TABLE blob_gc_journal (
  workspace_id text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  journaled_at text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at text,
  last_error text,
  PRIMARY KEY (workspace_id, storage_key)
);
```

Add `"0046_blob_gc_journal"` to `freshSiteOperations` in `W/platform/db/sqlite/fresh-content-db.ts:270–283`. Register `blobGcJournal({ checksum: pinned('0046_blob_gc_journal') }, {})` after `mediaCaptions` in `migrations/index.ts:128`. Sol leaves `checksums.ts` and `source-digests.ts` untouched. Opus generates and verifies the new pin. No `when`, Drizzle entry, or snapshot.

`createBlobGcJournal({ kernel }, {})` and `createMediaBytesPolicy({ gc, journal, probes, stat, signal }, {})`. Bind storage ownership and the live, trashed, rendition, forms, transfer, and recovery probes. Use `W/platform/db/repos/media-repo.ts`, `W/features/forms/form-file-purge.ts`, and the composition bindings `modules/media.ts`, `permanent-delete-deps.ts`, `site-deps/trash-follow-up-hooks.ts`, `http-app/visitor-submit.ts`, and `memory-deps/slices/form-attachment-purge.ts`. Keep bytes whenever a retained recovery artifact cannot be ruled out. Distinguish manual and Trash TTL provenance. Legacy upload orphans and NULL reasons are report-only.

Register `media-bytes` as **measure/report only**, with `sweep` absent. Enabling unlinks is a separate owner-gated commit under STOP 6, including a separate OQ-11a decision on Trash TTL. Tests first `trashed-media reference kept`, `legacy orphan reported, not removed`, `protected restore point extends grace`, and `fresh bootstrap = migrated schema` on SQLite and PG. Keep `purged file removed only after grace` at the isolated engine boundary, never through the mounted policy. Assert that the host policy has no sweep even on a live pass. Mutation delete legacy orphans. Comment why exact journal provenance is required.

### ST-13.T — Host revision thinning, disabled
BUILDER: SOL (OPUS-REVIEW)

Add `W/features/post/revision-thinning.ts` as host adapter. Edit `W/features/post/repo.ts`, route mounting, and `W/features/post/tool-registrations.ts`. Consume the released Jini CMS revision-thinning engine and specs. `bindRevisionThinning({ kernel, publishedRefs, restoreRefs, undoRefs, previewStore, clock, authorize }, {})` binds date-only preview for one workspace/post/page. Read actual `recorded_at`, `seq`, and `restored_from`, at `post/repo.ts:316–343` and `post/repo.rows.ts:230–231,250–251`. Use `post_revisions:<ws>:<post>` on apply. Recheck newest, published, restored-from, restore, and undo references against confirmed IDs. Delete at most the contiguous unprotected oldest run. Reference writers must share the fence or have transactionally equivalent protection. Keep disabled until proven under STOP 6.

Mount apply with `mountAdminJsonRoute`, `requireSameOrigin: true`, and owner authorization. Tool uses explicit preview and `approvalToolHandler` from `W/contracts/core/human-confirm.ts:181`, with **no `rememberKey`**, following `mail_clear_captured` in `W/features/mail-status/delivery-tool-registrations.ts:119–124`. No autonomous execution. Tests first `published / restore / undo targets kept`, `newest kept`, `requires explicit scope`, `undo reference added after preview is kept`, `history reads the same after thinning`, `approval card raised before any revision delete; decline deletes nothing`, and a two-connection PG lock test. Mutation drop undo probe. Comment why computed `previousId` is not a column to update.

### ST-15b.T — Owner-only storage HTTP mounts
BUILDER: SOL

Add `W/server/runtime/composition/modules/storage-routes.ts` and mount from `http-app/mount-admin-system.ts` and serving composition. `mountStorageRoutes({ app, storage, authorizeOwner, adminPorts }, {})` binds released `@jini-ai/platform/retention/routes` through `mountAdminJsonRoute` for `GET /api/admin/storage/report` and `POST /api/admin/storage/cleanup`.

Bind `authorizeOwner` to the strict session-owner check used in `W/server/inbound/admin-http/owner-passkey-routes.ts:106`: the caller must be a session principal and its ID must equal the resolved `deps.ownerPrincipalId`. Do not use `isOwnerOrBuiltinAdmin`, accept peer-publish credentials, or grant access merely because a principal has an admin session. Apply same-origin policy to writes and require serving-owner availability. Return ST-14 categories, dry-run outcomes, and last-pass state, never raw paths or incidents. Preserve the existing admin refusal envelope.

Tests first `cleanup defaults to dryRun`, `content class refused in plain words`, owner-role-only wire coverage including builtin-admin and peer refusals, and mixed live/dry arrivals. Mutation default false at the host seam. Comment why site ownership is not the same as an admin session.

### ST-15c.T — Storage tools and owner approval
BUILDER: SOL (OPUS-REVIEW)

Add `W/features/storage/agent-tools.ts` and `W/features/storage/tool-registrations.ts`. `createStorageToolContributor({ measure, runOnce, authorizeOwner, approval, copy }, {})` returns `{ domain: "system-storage", build, risk }`. Bind it in `W/server/runtime/composition/tool-catalog-manifest.ts`. Use `buildDomainRegistrations` with the explicit catalog module `features/storage/agent-tools.ts`, following `W/features/mail-status/delivery-tool-registrations.ts:95`. Define `storageDerivedRisk = new Map([["site_storage_report","none"],["site_storage_cleanup","mutates-durable-state"]])`.

`site_storage_report` is read-only, no confirmation. Cleanup defaults to dry-run. Use `approvalToolHandler({ surfaces, prepare, describe, run }, { flag: "cleaned", ask: ({ prepared }) => prepared.dryRun === false })` with no `rememberKey`. Live prepare measures categories and bytes for the owner card. Execute revalidates authenticated owner, bound site, and automatic-only scope. Refuse chats, revisions, screenshots, and in-use media in plain words. No approval reuse or policy-mode shortcut.

Tests first `cleanup defaults to dryRun`, `content class refused in plain words`, `approval card raised`, human confirmation precedes `runOnce({ dryRun: false })`, and decline never calls it live. Mutation live by default without a card. Comment why preview is not itself approval.

### ST-17s.T — Manual screenshot cleanup binding
BUILDER: SOL

Add `W/features/web-screenshot/capture-retention.ts` binding and `W/server/runtime/composition/modules/screenshot-storage.ts`, mount Jini specs and expose required screenshot hook to the Storage panel. `bindCaptureRetention({ siteDir, captureRootFor, writerFence, fs, clock, previewStore, authorizeOwner }, {})`. Use current writer’s root only, known date/name shape, no links or traversal, authenticated preview and confirm. No automatic registration or generic path deletion. Tests first `preview shows only older completed captures`, `replaced capture is kept`; mutation omit identity recheck. Comment why cited captures stay until the owner explicitly removes them.

Mounting note from the approval: use `mountAdminJsonRoute` and same-origin apply. At `saveCaptureFilesFor` in `W/server/runtime/composition/tool-catalog-manifest.ts:654`, inject the same root-keyed lock into the released `createCaptureFileWriter` that `writerFence` uses.

### ST-17.T — Admin Storage panel composition
BUILDER: SOL

Add `A/features/storage/Storage.tsx` and `A/features/storage/hooks/use-storage.hooks.ts`. Register the `/storage` panel in `A/panels.tsx` alongside the existing Operations entries for Database and Recovery. `ADMIN_PANELS` is derived from that registry. Consume the released `@jini-ai/admin/screens/storage/StoragePanel`. `useWiredStorage({ client, reportErrors, locale, links }, {})` is passed as the required `useStorage` prop, with injected kit and product labels.

Wire last-pass state and links to Chats, Trash, Recovery/Database, Exports, Screenshots, and revisions. Show ST-7b recovery actions only when verified capability exists and the owner confirms. No running-site writable shortcut. Tests first `three class labels` and `dry-run list first`. Mutation send a live request before displaying dry run. Comment why “Yours” and “Shown only” never enter cleanup.

## OPUS

### ST-7a.J — Restore SQLite compaction
BUILDER: OPUS

**STOP G1–G3 until the source-only rebase and fixes pass.** In a shallow executor clone, run `git fetch --unshallow` first. Use Jini `1b7dcff86` as the source-only donor for `J/db/src/sqlite/{compaction,compaction-steps}.ts`, `J/core/src/contracts/storage/sqlite-compaction.ts`, and compaction tests. `076f73492` is telemetry, not a donor. Put tests in `J/db/src/sqlite/__tests__/compaction.test.ts`, not historical `db/src/__tests__/sqlite/`. The donor conversion is over 80 lines and exports a Node-bound default. Do not cherry-pick it unchanged.

`convertToIncrementalVacuum({ filePath, open, marker, holdsRunningLease, fs, now }, { recoveryCopyPath, reserveBytes = 64*MiB } = {})`. `incrementalVacuumStep({ db, filePath, marker, fs, mono }, { maxPages = 2048, minFreeRatio = .2, minFreeBytes = 8*MiB, busyTimeoutMs = 250 } = {})`. Delete the module-level `nodeCompactionFs` implementation and export. `fs` is required. Add `tempDirectory(): string` to `SqliteCompactionFs`, add `'copying'` to the marker state union, and call `holdsRunningLease()` at entry, after admission, and before `rewriting`. Split convert into `admit`, `budget`, `copy`, `rewrite`, and `mark`, each at most 80 lines and complexity 10.

Require exclusive admission before rewrite. Budget journal, actual SQLite temp space, and new copy per distinct device. Persist `copying` before `VACUUM INTO`, then publish and verify the copy. Verify integrity and pragma `2` before `converted(dev:ino)`. Never run in a migration. Restore prior busy timeout after daily steps. Extend `@jini-ai/db/sqlite` and `@jini-ai/core/contracts/storage`, additive minor on this base and both baselines.

Tests first `step inside an open transaction throws`, `conversion refuses a handle inside a transaction`, `pinned WAL reader → deferred, file intact`, `competing writer → busy deferral`, `low disk → deferred with plain message`, `interrupt then restart completes`, `marker only after auto_vacuum reads 2`, `replaced file does not inherit the marker`, `temp folder on a full disk → deferred low-disk, file intact`, and `crash after publish before marker reuses the copy`. Mutations drop exclusive admission and mark before verification. Comment why a verified copy and exclusive admission are both required.

### ST-8c.J — Attempt-base reader proof
BUILDER: OPUS

**STOP 5. Report-only until proof passes.** Add `J/chat/src/store/runtime/__tests__/attempt-base-readers.test.ts` and `attempt-base-retention.ts`. `createAttemptBaseTrimPolicy({ kernel, now, readerProof }, { minPastDeadlineMs = 7*DAY, limit = 500 } = {})`. `readerProof` is `{ verifiedReaders: readonly string[] }`. Export `ATTEMPT_BASE_READERS` and require exact membership before allowing a sweep. `signal` belongs on the per-run sweep call, not the factory. There is no Tovu ST-8c registration, and ST-6a does not carry witness fixtures.

| Reader area | Proof anchors to cover in `attempt-base-readers.test.ts` |
|---|---|
| Jini contract, row, and recovery | `chat/src/core/durable-runs/ports.ts:25`, `chat/src/store/runtime/kernel.ts:22` (`attempt_base_json` row type), `chat/src/server/durable-runs/recover.ts:54,57,143,152,154` |
| Jini durable store and message response | `chat/src/store/runtime/durable-run-store.ts:114,142,396,427,431,509`, including the `hasUnknownToolCall` check on `run.attemptBase`; `chat/src/store/sql/store.ts:536–545,615` |
| Tovu stream and finalizer | `W/server/runtime/composition/modules/assistant-chats.ts:288` and `modules/run-finalizer/{entry.ts:104,265–266,304,recovery-binding.ts:35,62,stream.ts:51,watch-state.ts:29,73–85}`. Cover delayed attach, stream seed, and replay. |

After proof only, use a bounded atomic update with terminal status, current attempt identity, and an elapsed non-null recovery deadline. Clear only `attempt_base_json`. Never write `events_json`. If a served response changes on an otherwise valid branch, bump version in the same transaction. A differing recovery or replay result still blocks trimming. Export `@jini-ai/chat/store/attempt-base-retention`, minor and baseline.

Tests first `recoverable attempt untouched`, `replay after trim matches`, `messages response bytes identical before and after trim`, `running attempt untouched`, `messagesVersion changes` for the applicable version branch, and omitted reader proof stays report-only. Run the proof matrix and mutate away the deadline predicate. Comment why attempt metadata is not an immutable event receipt.

### ST-11a.J — Fence every media byte writer
BUILDER: OPUS

Edit `J/cms/src/media/{blob-gc,media-service,rendition-service,replace-media-file,ports}.ts`, `media/site/{purge-media,hydrate-blob-store-from-seed,import-media-entity}.ts`, and `J/cms/src/admin-http/routes/publish-content/blob-put.ts`. Put neutral DTOs in `J/core/src/contracts/blob-gc.ts`. Locate media writers by function. `uploadMedia` is at `media-service.ts:432` on this tip, and the replacement lookup is near `replace-media-file.ts:111`. Preserve the newer upload-cap behavior.

`createBlobGc({ kernel, blobRepo, mediaRepo, renditionRepo, journal, blobStore, probes, clock }, { graceMs = 30*DAY, allowTrashTtl = false } = {})` returns `claimWrite({ workspaceId, storageKey, sha256, kind, work }, {})`, `tombstone({ workspaceId, storageKey, sha256, reason }, {})`, `deletePass({ signal }, { limit = 100 } = {})`, `unlinkPass({ signal }, { localLimit = 50, remoteLimit = 1 } = {})`, and `unlinkIfUnowned({ workspaceId, storageKey, consumingJobId? }, {})`. Use `kernel.lockKey('blob:<workspaceId>:<storageKey>')` inside `kernel.transaction`. Route all original, rendition, restore, hydration, and replacement writers through the same `claimWrite` fence as unlink. Explicitly fix the two bypasses: `import-media-entity.ts:325–327` does `findByHash` then `putIfAbsent` and treats a tombstone as existing, and `blob-put.ts:73` writes before any row exists. Neither may bypass the fence.

Originals publish durable live ownership before bytes. Protect renditions continuously through reference publication, including before a row exists. Verify size/hash. Capture exact rendition keys before deleting rows, journal originals before dropping ownership, and retain provenance. Freshly recheck ownership and retention before unlink. Exclude only the consuming forms job from its own probe. Unknown keeps bytes. ENOENT is idempotent, other failures back off. Remote removal must settle or be conclusively canceled before lock release. Never await a JS hash lock inside the DB transaction. Only a host can opt in to Trash TTL, and this release does not authorize it.

Extend `@jini-ai/cms/media` and export `@jini-ai/core/contracts/blob-gc`, CMS major/core minor and both baselines. Tests first `crash between claim and unlink resumes`, `cross-process same-hash re-upload keeps the file`, `rendition sharing bytes kept`, `absent snapshot probe fails closed`, `grace extends to the oldest retained copy`, `legacy tombstone without reason is never unlinked`, `trash-ttl eligible only if OWNER-Q-11a says so`, `forms job pending keeps the bytes`, `no deadlock with an upload holding the hash`, and concurrent cases for both newly fenced writers. Mutation use only the in-process lock. Comment why the fence is keyed by bytes, not row ID.

### ST-2a.J — Partition interlock
BUILDER: OPUS

Add `J/desktop-host/src/electron/partitions/{profile-interlock,holder-registry,partition-root,claim-sources,index}.ts`. Extend strict presence read alongside `electron/updates/instance-presence.ts`, leaving the tolerant updater reader intact. `createPartitionInterlock({ paths: { interlockDir, sessionDataDir }, fs, lock, process, clock, scheduler, fromPartition, isManaged, claimSources, invalidateRetirement, openMaintenance }, { heartbeatMs = 5000, waitCapMs = 30000, abandonMs = 5000 } = {})`. `abandonMs` is diagnostic-log only. It never authorizes breaking a fence.

Expose `registerHolder`, `acquireSiteSession({ partition, subjectDir }, {})`, `siteSession({ partition }, {})`, `assertHeld`, `withPartitionWriter({ run }, {})`, and `readHoldersStrict`. Add `resolvePartitionRoot({ sessionDataDir, fs }, {})`, `listCandidates({ root, fs, isManaged }, {})`, and `readPresenceStrict({ directory, fs, liveness }, {})`. Register before acquisition. If `registerHolder` fails, `acquireSiteSession` refuses every open with injected copy. Persist intent before reading the target. At step 2.5 check no other holder before running the injected `openMaintenance` hook. Promote to sticky held before any session, window, or guest use. Inject the async lock with `staleMs: Infinity`, 2 s acquisition, and token-matched target. Quiet `seq` is diagnostic. Live or unknown writers retain the fence, with busy returned at the 30 s cap. Unknown claims never authorize mutation.

Export `@jini-ai/desktop-host/electron/partitions`, minor and baseline. Tests first `T-2a.1 opening a site waits while a pass holds the lock`, `T-2a.2 siteSession throws for an unheld partition`, `T-2a.5 updater-disabled sibling is seen as another instance`, `T-2a.6 unreadable presence = skip`, `T-2a.7 corrupt presence record = skip`, `T-2a.9 a symlinked candidate is skipped`, `T-2a.10 junction/realpath escape is skipped`, `T-2a.11 second profile is separate`, `T-2a.12 a second writer cannot enter while the first awaits a rename`, `T-2a.13 interleavings`, and `unregistered process cannot acquire`. Run the model-checked interleavings. Mutations collapse unknown to empty and substitute the sync JSON lock for the async writer. Comment why intent precedes target read and quiet does not mean dead.

### ST-2c.J — Partition pass and manual sign-in removal
BUILDER: OPUS

Add `J/desktop-host/src/electron/partitions/partition-pass.ts`. `runPartitionPass({ interlock, ledger, fs, root, claimSources, maintenance, report }, { budgetMs = 3000 } = {})`. `removeAmbiguousPartition({ partition, interlock, ledger, fs, root, claimSources, confirmation }, _optional = {})` requires `confirmation: { partition: string; confirmed: true; evidence: 'owner-dialog' }`. Refuse missing or mismatched confirmation. Manual sign-in removal uses the same rename, recheck, and CAS proof as the automatic whole-partition path.

Under writer/target fence, restore uncommitted asides before classifying. Whole auto-removal requires bound pending proof plus no sibling, no tracked/catalog claim, certain absent same-device parent, and no holder or intent. Recheck all four after rename. CAS by record ID and exact aside identity is the commit point. Restore on claim, uncertainty, or CAS failure. A collision becomes a protected hold. Delete outside the lock only after matched commit or for a known cache-only aside. Never sweep unknown or invalidated whole asides by filename. Ambiguous automatic cleanup is measured `Cache`/`Code Cache` only.

Export the existing partitions leaf, minor and baseline. Tests first `T-2c.1 retired partition removed only when all four checks pass`, `T-2c.2 sibling starting during a sweep keeps its partition`, `T-2c.3 add/open during discovery keeps the partition`, `T-2c.4 same path re-created → partition kept and record invalidated`, `T-2c.5 later occupant of the same path never inherits an actionable record`, `T-2c.6 ambiguous partition keeps Cookies`, `T-2c.7 damaged tracked list ⇒ pass skipped`, `T-2c.8 crash after rename before commit restores the partition next start`, `T-2c.9 unmounted parent volume ⇒ kept`, `manual sign-in removal without confirmation is refused`, and `holder appearing after confirm keeps the partition`. Fault-inject ledger transition, aside rename, restore rename, and target write. Mutation skip the post-rename tracked recheck. Comment why an aside is not deletion authority.

### ST-1a.T — Packaged Mac cache probe
BUILDER: OPUS

**Packaged Mac evidence required.** Create `apps/desktop/scripts/measure-partition-cache/{main,verdict}.ts`, dedicated probe builder config and fixture tests. `runCacheProbe({ electron, loopback, appPaths, fs, measure, evidenceWriter }, { capBytes = 32*MiB, tolerance = 1.25 } = {})`. Use the production Electron version and a disposable profile with two production-shaped persistent partitions. Exercise repeated distinct 1 MiB writes across relaunches. Measure uncapped and capped behavior and overlapping occupancy so two values below the ceiling cannot misclassify a shared pool. Check cookie, Local Storage and IndexedDB survival for each of the four ops separately and include the negative control only in the isolated probe. Output `plans/evidence/ST-1a-electron-<ver>-<platform>.json`, with separate cap and clear verdicts and reasons. No runtime app module imports or package export. Tests first `T-1a.1 cache stays under the switch per partition`, `T-1a.2 cookie survives clearCache and clearCodeCaches`, `T-1a.3 verdict NO-GO when one partition exceeds 1.25 × cap`. Mutation substitute `clearStorageData` for `clearCache` in the probe. Comment why the harness must never inherit real `userData`.

### ST-2a.T — Desktop interlock binding
BUILDER: OPUS

After ST-2a.J, add `D/desktop-partition-lock.ts`. Edit `D/main/index.ts`, `main/boot/site-backend.ts`, `main/windows/{app-window,site-window,sites-home-window}.ts`, `tracked-sites.ts`, `tracked-site-relocation.ts`, `add-site-pointer.ts`, `project-ipc.{catalog,import}.ts`, `sites-mcp-tools.ts`, and `apps/desktop/bin/tovu-desktop.ts`. `bindDesktopPartitions({ app, session, fs, fileLock, clock, scheduler, process, projectsPath, catalog, retirement, openMaintenance }, _optional = {})`. Bind current `sitePartition`, strict catalog/tracked/presence reads, canonical `userData` and `sessionData`. Block automatic maintenance if distinct profiles resolve to the same root without shared coordination. Register after path override and before ready. Acquire on both backend and direct/attached window open; replace all six managed `fromPartition` callers; assert before `BrowserWindow` and deny unheld managed guest attachment without changing navigation policy. Add a required `beforeAddedRows` effect to the actual tracked-list writer dependency object, called before durable publication for add, adoption, discovery, relocation, IPC, CLI and MCP. Preserve projects→ledger order. Use an explicit no-op retirement port until ST-2b, not a bypass after it ships. Tests first `T-2a.3 no bare session.fromPartition in D/ outside desktop-partition-lock.ts`, `T-2a.4 guest attaching during cleanup is refused until acquired`, `T-2a.8 damaged tracked list = skip`, `T-2a.14 add-site CLI invalidates the retirement for that path`. Mutations permit unheld guest and map unknown tracked data to empty. Comment why updater-disabled instances and implicit Electron creators count.

### ST-2b.T — Retirement proof in erase arm
BUILDER: OPUS

Edit `D/project-ipc.delete.ts`, `project-ipc.types.ts`, `main/index.ts`, and the desktop interlock/CLI bindings. Add required `retirement: { capture({ siteDir, siteId }, {}), append({ candidate }, {}), invalidate({ partition, reason }, {}) }` to `ProjectIpcDeps`, including the delete handler’s `Pick`. Bind explicit `NO_RETIREMENT` until ST-2b.J ships, then the real released ledger in `buildProjectDeps` (`main/index.ts:890`). No optional port or silent production bypass.

In `deleteProject`, put `captureRetirement({ siteDir, siteId, retirement }, {})` after `assertNoOtherServer` and immediately before `if (erasesFiles) await eraseProjectDirectory(...)`. The anchors are now lines 132 and 142. Put `recordRetirement({ candidate, absence, retirement, log }, {})` after successful erase and certain ENOENT, before `untrackSite` at line 143. Capture and record are erase-only. Preserve D-08. Failure leaves ambiguous data and does not rewrite the erase result.

Tests first `T-2b.1 erase writes a record after the folder is gone`, `T-2b.2 untrack + re-add keeps the login`, `T-2b.3 failed erase writes no record`, and production binding is not `NO_RETIREMENT` once ST-2b.J is imported. Mutation record for untrack. Comment why a retirement record is positive proof, not a reconstruction from missing rows.

### ST-1.T — Production desktop cache binding
BUILDER: OPUS

**No enabled behavior without package evidence.** Edit `D/main/index.ts`, `desktop-partition-lock.ts`, add `D/main/boot/desktop-cache-policy.ts` and evidence fixture tests. `bindDesktopCachePolicy({ app, evidenceForBundledElectron, interlock, marker, fs, measure }, { cacheBytes = 32*MiB, fallbackMultiplier = 2 } = {})`. Apply switch after profile selection and before ready. Install open hook and contribute boot cache work to ST-2c; do not create an independent sweep. Evidence missing/mismatched means no switch and no clear op; only independently measured operations can use fallback. Tests first `T-1.1 switch set before ready`, `T-1.2 NO-GO evidence ⇒ no switch`, `T-1.3 a busy partition is retried next start`, `T-1.4 marker is per profile`. Mutation mark before actual clear. Comment why an Electron upgrade invalidates the verdict.

### ST-3.T — Production code-cache binding
BUILDER: OPUS

Edit `D/main/boot/desktop-cache-policy.ts`, `desktop-partition-lock.ts`, `main/index.ts`, tests. `bindDesktopCodeCache({ appVersion, argv, launchMode, evidence, interlock, marker, fs, measure }, { versionChangeIsUpdate = true, maxBytes = 64*MiB } = {})`. Queue update work in the profile marker before recording current version. Register after ST-1 in the pre-held hook list; boot contribution runs only inside ST-2c’s fence. ST-1a clear verdict required, including actual macOS update detection check. Tests first `T-3.3 > 64 MB cleared at open`, `T-3.4 busy code cache retried next start`, `T-3.5 storage untouched`, `T-3.6 second window of a held site does not clear`. Mutation clear a held partition. Comment why version comparison is an update fallback, not a reason to delete login state.

### ST-2c.T — Desktop boot partition pass
BUILDER: OPUS

Edit `D/main/boot/boot-sequence.ts`, `main/index.ts`, `desktop-partition-lock.ts` and boot tests. `runDesktopPartitionPass({ partitionPass, claims, ledger, fs, root, maintenance, log, mono }, { bootWaitMs = 3000 } = {})`. Invoke after orphan reconcile and nested-sites-home migration, before `bootInMode`, once per profile boot. The UI wait may end at 3 s; the actual writer retains ownership until its work settles. Retain last pass report for desktop Storage. If claims are unknown, skip and log once. Tests first `T-2c.2 sibling starting during a sweep keeps its partition`, `T-2c.3 add/open during discovery keeps the partition`, `T-2c.6 ambiguous partition keeps Cookies`, `T-2c.7 damaged tracked list ⇒ pass skipped`; mutation omit the post-rename tracked recheck in the real binding fixture. Comment why a UI timeout cannot release an outstanding writer.

### ST-16r.T — Restore storage report CLI
BUILDER: OPUS

**STOP G6 until source-only restoration is cleared.** Port `W/cli/commands/storage-report.ts` and its focused tests from `1cbfcb0b99`. Rebase `W/cli/program.ts:118–127` by assigning the **existing** parent command to `storage` and adding `report` beside `move`. Do not replay the historical parent-command edit or telemetry files. `runStorageReportCommand({ dir, measureSiteStorage, resolvePaths, stdout }, { json = false } = {})`. Resolve with `reserveIdentity:false`, derive share folder without creating it, never boot, claim, open DBs or mutate. Preserve report JSON as the desktop contract. Update CLI introspection fixture for the sibling command. Tests first `report does not migrate`, `categories add up to the walked total`, `a symlink is not followed`, `an unreadable folder is reported unknown, not 0`, `WAL is reported apart from the main file`. Mutation call the mkdir-capable share resolver. Comment why reporting works beside a running site.

### ST-16.T — Stopped-site storage CLI
BUILDER: OPUS

After ST-16r and ST-7b.J release, add `W/cli/commands/storage-maintenance.ts`, register sibling `clean` and `capabilities` in `cli/program.ts`, prepare `compact` through an injected `compactStoppedSite` port that is unavailable until ST-7b.T. `runStorageCleanCommand({ dir, claim, openExisting, policyFactory, createRunner, stdout, reportError }, { dryRun = false, json = false } = {})`. `clean` acquires maintenance lease before any writable handle; no migrations, seeding or normal boot. Dry run calls only measurement and never opens writable. Share policy factory with the serving root. Drain, close and release in that order. Codes 0 done, 2 partial, 3 running, 1 error. `capabilities --json` advertises only connected operations. Preserve `storage move`. Tests first `running site → "This website is running; clean it from its Storage screen."`, `clean does not migrate`, `report does not migrate`, and assert `--dry-run` never deletes. Mutation open writable before the lease. Comment why `clean` must not migrate as a side effect.

### ST-7b.T — Stopped-site compaction and recovery
BUILDER: OPUS

**Waits for G1–G3 and released ST-7a.J and ST-7b.J.** Add `W/features/storage/{compact-site,compaction-marker,compaction-recovery}.ts`. Change `W/platform/site-dir/site-running.ts:20–24` to `claimSiteRunning({ dir, app, scheme = "http", purpose = "serve" }, …)` and forward `purpose` to `workspace.claim`. The existing callers, `W/cli/commands/serve.ts:218` and `W/index.ts:171`, are **serve** callers. When contested by maintenance, poll every 500 ms up to 180 s, never attach, and never open the DB until serve admission. Use `isServeRecord` to distinguish records. The writable stopped-site CLI `clean` in `W/cli/commands/storage-maintenance.ts`, `compactStoppedSite`, and `resolveCompactionAttention` must pass `"maintenance"` at their claim boundary. Desktop idle compaction in `D/main/boot/storage-idle-compaction.ts` runs the stopped-site child CLI, which claims maintenance through `compactStoppedSite`. Desktop does not take a second lease, and reports never claim.

`compactStoppedSite({ dir, claim, resolvePaths, open, markerStore, fs, copyMutex, convert }, { databases = ['content','chat'] } = {})`. Require maintenance token before open. SQLite only, content then chat, continue after a deferral. Persist marker atomically in `ops/maintenance.json`. Idle child runs only for stopped tracked sites with no open window, AC, at least 10 min idle, at most 2 GiB, and 24 h cooldown. Larger sites are manual only.

`resolveCompactionAttention({ dir, db, action, previewToken, claim, verify, markerStore, fs }, {})` offers two confirmed stopped-site choices. Restore verifies and keeps the source, stages replacement, preserves failed main and sidecars coherently, then fsyncs before marker clear. Keep-current does a fresh integrity check. A pre-compact copy becomes eligible only after a later successful `quick_check`, never while named by needs-attention, and only under ST-6b retention.

Tests first `refused while the site is running`, `server waits for maintenance then starts`, `boot unaffected when preflight fails`, `open window → no compaction`, failed restore, and confirmed recovery fixtures. Mutation skip the lease. Comment why failed verification is terminal until owner action.

### ST-7c.T — Budgeted free-page reclamation
BUILDER: OPUS

**Waits for G1–G3 and ST-7b.T.** Add `W/server/runtime/composition/retention-policies/db-free-pages.ts`, bind only SQLite handles already owned by serving `open-site-store.ts`. `createDbFreePagesPolicy({ databases, markerFor, incrementalVacuumStep, measure, mono, yieldTurn, signal }, { maxStepsPerPass = 8, budgetMs = 2000, maxPages = 2048, busyTimeoutMs = 250 } = {})`. Measure free pages, main and WAL separately. Converted identity-matched SQLite only, no writable open just to inspect, no PGlite/Postgres. Stop on skipped/busy, abort or budget; yield between steps. Tests first `unconverted file is skipped`, `busy defers`, `report has main and WAL sizes`, `stops after the time budget`. Mutation run on an unconverted file. Comment why a long reader can delay reclamation.

### ST-12a.T — Restore share expiry
BUILDER: OPUS

**STOP G4–G5 until source-only restoration is cleared.** Port `share-expiry.ts`, unit tests and registry/service expiry diffs from `b2513fb4a3`. Rebase backend validation and input tests from `3df699e25a` onto `W/server/runtime/composition/modules/system-site-shares.ts` and the current host parser, not a restored Express registrar. `shareExpiresAt({ days, now, destination, copy }, {})`; `isShareExpired({ row, now }, {})`. Initial create accepts Never/null or 7/30/90 only for affirmative own-folder hosting. Inject clock into registry’s existing args; date is immutable and invalid persisted date fails closed for **serving**, not evidence to unlink. Peer artifact receive does not invent expiry. Tests first `no expiry by default`, `peer-uploaded row without URL or storage still served`, expired public 404, and remote-provider refusal before any job. Mutation default to 14 days. Comment why absent metadata is not provenance or expiry.

### ST-12b.T — Share expiry retention and controls
BUILDER: OPUS

**Waits for ST-12a and ST-6a.** Add `W/features/site-backup/share-retention.ts`; edit registry/service/backend/hosting, both host stream routes, `A/features/sites/SiteExportTab.tsx` and its transfer hooks. `createShareRetention({ registry, shareMutex, fs, clock, reportError, signal }, { limit = 50, showExpired = true } = {})`; registry `markExpired({ shareId, expiresAt }, {})`. Under per-share exclusion recheck own-folder authoritatively and parse a valid explicit expiry. Durably publish create-only tombstone, gate both downloads, then unlink ZIP. `revoked > expired`, no later put resurrects access. Retry locally revoked ZIPs, never auto-delete remote copies, failed rows, peer URLs without explicit expiry, metadata or token reservations. Do not hold lock across streams or callbacks. Preserve auth, credential acknowledgement and ZIP error behavior. Inject expiry controls through existing export hooks, Never default. Tests first `active link without expiry untouched`, `interrupted expiry retried`, `token stays reserved`, `acknowledge after expiry keeps it expired`, `download admitted just before expiry completes`. Mutations expire rows without `expiresAt` and unlink first. Comment why expired status is monotonic but a file-delete failure is retryable.

Binding note from the approval: consume `@jini-ai/devops/react/site-share-expiry` and inject its required hook through the existing export composition. `SiteExportTab.tsx:27` already defaults `useExport`. Do not add another defaulted hook prop. The authenticated ZIP and public token-stream gates must both pass before expiry unlink activates.

### ST-18a.T — Desktop Storage sheet
BUILDER: OPUS

**Requires ST-16r and ST-2c.** Create `D/storage/storage-sheet-ipc.ts`, `D/renderer/app/StorageSheet.tsx`, `packages/contracts/src/desktop-storage.ts` and `@tovu/contracts/desktop-storage` export; edit preload, main, and sites-home shell. `registerStorageSheetIpc({ ipcMain, allowedSender, listStrict, runReport, measureTree, interlock, ledger, trashItem, reportError, itemIds }, { reportConcurrency = 2, reportTimeoutMs = 20000, itemTtlMs = 600000 } = {})`. List DTO `{ generatedAt, sites, signIns, otherFolders, tidy }`. HMAC-derived opaque IDs resolved in main, sender-bound and expired after 10 min. List tracked sites with bundled CLI report, split cache from sign-in data, and list ambiguous sign-ins plus permitted dismissed/backups/hold entries. Unknown disables destructive controls. `removeSignIn({ itemId }, {})` after confirm rechecks class, claims, no sibling and writer fence before any whole action. `trashFolder({ itemId }, {})` rechecks lstat, strict untracked state, running lease, path scope and exact backups location, then only `shell.trashItem`; no rm fallback. Inject required `useStorageSheet` and kit. Initially hide Clean/Compact. Tests first `T-18.1 untracked folders never removed without the button`, `T-18.2 removing a sign-in asks first`, `T-18.3 unknown or expired itemId is refused`, `T-18.4 sign-in re-acquired between list and confirm is kept`, `T-18.5 symlinked folder refused`, `T-18.6 running site refused`, `T-18.7 no capability ⇒ no buttons`. Mutation auto-remove during list. Comment why listing identifies a candidate but does not authorize mutation.

Export note from the approval: `@tovu/contracts/desktop-storage` uses the existing `"./*"` at `packages/contracts/package.json:11–14`. No package.json export entry is needed. Manual removal passes the typed ST-2c.J owner-dialog confirmation.

### ST-18b.T — Desktop Clean and Compact actions
BUILDER: OPUS

**Waits for ST-16 and ST-7b.T.** Extend the ST-18a IPC/renderer and contract. `bindStorageSheetActions({ capabilities, runningLease, runCli, ownerHttp, itemIds, confirm }, {})` exposes `clean({ itemId }, {})` and `compact({ itemId }, {})` only when capability is available. Resolve/recheck in main at action time. Running Clean uses owner HTTP preview/confirm; stopped Clean uses CLI, and Compact is stopped-only via lease-checked CLI. Forward plain busy, protected and expired outcomes. Test first `T-18.7 no capability ⇒ no buttons` and `refused while the site is running`; mutate to render Compact without capability or route a running site to writable CLI. Comment why button state cannot substitute for lease admission.

## Activation gates and accepted defaults

- **G1–G3:** No compaction helper release until the source-only rebase, injected FS, bounded conversion, and transaction tests pass. No Compact capability before the released helper and valid stopped-site binding. Recovery has two confirmed choices. No idle compaction on battery.
- **G4–G5:** No share expiry unlink until the source-only rebase, both stream gates, and affirmative own-folder evidence pass. New links default to Never. Keep expired rows visible with `showExpired: true`. Missing metadata is not expiry.
- **G6:** No desktop report capability until the restored CLI and its JSON contract are verified alongside existing `storage move`.
- **Desktop sign-ins:** No whole-partition removal, automatic or manual, when any proof is unknown. Opus verifies live-writer pause, post-rename restoration, invalidated-aside behavior, tracked-list/CLI invalidation, second-profile isolation, and updater-disabled siblings. Use `requireOtherInstancesClosed: true`, a 30 s acquisition cap, 90-day terminal retention only when no unresolved aside remains, and version change as an update fallback. Cache tolerance is 1.25, with periodic ×2 only for independently GO clear operations. Any ambiguous fallback is measured cache-only. Desktop Storage ships split capabilities.
- **Attempt-base:** Report-only until every terminal/past-deadline reader is proven. No Tovu trim sheet or registration. A different recovery result blocks the trim even if a version bump would expose it.
- **Media and revisions:** Media stays report-only while any byte writer, retained recovery reader, or remote-operation lifetime is outside the fence. Ask OQ-11a separately before any unlink activation. `allowTrashTtl: true` would remove eligible bytes after 60 days in Trash plus 30 days of grace and is **not** the Jini default. Revision thinning is date-only and disabled until publish, restore, and undo references can all be rechecked inside apply.
- **Release and content boundaries:** Scheduled retention starts with `scheduledDryRun: true`. No automatic admin chat deletion. Bulk pin deletion defaults off. Delete-selected requires `confirm: true` plus the server’s per-ID recheck. Opus verifies migration pins, fresh and upgraded SQLite/PG parity, owner/CSRF wire behavior, and named mutations. ST-4, ST-5, and ST-14 are already present and need no new sheet.
