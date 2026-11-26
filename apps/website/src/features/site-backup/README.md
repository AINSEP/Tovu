# site-backup

## Wiring

- `SiteShareRefusal` and `archiveRefusalName` are Jini's `@jini-ai/devops/backup/site/share-refusal` (one class per process, so `instanceof` holds); `archive-media.ts` and `static-export-selection.ts` are thin bindings that inject Tovu's share path policy, capped ledger/blob reads, media operations and refusal copy into Jini's `backup/site/archive-media` and `backup/site/static-export-selection`.
- Document archive validation uses `@jini-ai/cms/media/site/document-archive`; this folder binds the
  `yauzl` SDK and agent-plugins' `createYauzlAgentPluginArchiveReader` as `documentArchiveDeps` at the call site.

### Import history authority (P5)

Import history lives either in the legacy JSON snapshot (`<root>/<uuid>.json`) or in the SQLite index
(`<root>/site-imports.db`). Which one is the authority is decided per operation by
`@jini-ai/devops/backup/site/import-index/mode`, bound once per workspace by
`server/runtime/composition/site-import-index-state.ts` (`bindSiteImportIndexState`). The design is
ADR-071 (cited from `origin/plan/whats-left-1122:plans/P12-adr-drafts.md:5` until the standalone ADR lands).

- **Workspace root.** `<appData>/site-imports/<workspaceId>`, private (`0700`). Every authority path is fixed beneath it: `import-index.state.json`, the witness `.history-indexed-v1`, `site-imports.db` (+ `-wal`/`-shm`), `payloads/`, and `site-imports.quarantine-<dbId>/`. Evidence comes from fixed-path probes, never from listing the root.
- **Opener.** `openExisting({readonly})` opens existing data only (`fileMustExist`), validates the schema plus `db_id` and `cutover_at`, and owns a fresh scoped handle per read and per locked acquisition, closed in `finally`. No handle outlives a resolution and none joins the content-store shutdown list; the one-shot CLI uses the same scoped cleanup. A fresh open sees a missing or exchanged DB that an old descriptor could hide.
- **Lock.** `<root>/.import.lock` (`registry.exclusive`) is the only writer. On entry the registry runs a nonmutating refusal check before it creates or moves anything in `payloads/`, then resolves with locked access. Lock-free `get`/`list`/`listPage` resolve with read access: they never cut over, back-fill, sweep, expire, quarantine or write state. A read that sees authority move during its legacy snapshot discards the result and resolves again.
- **Clock.** One injected `{ nowMs }` drives cutover, the write fence, sweeps and retirement.
- **Private atomic state.** `import-index.state.json` is written with `writeJsonFileAtomic` at `0600` with owner-only verification and no symlink following; the witness is created with `wx` at `0600`, fsynced, and the root is flushed. Directory flush is best effort: some platforms (Windows, some network filesystems) cannot flush a directory.
- **Policy.** `composeSiteImportBackend` passes one policy object to every authority session, the opener and the backfill. This build ships `cutoverPolicy: "rollback"`; flipping to `"enable"` is a separate one-line commit after packaged verification.
- **Fence before consume.** Every indexed SQL mutation (admission, recovery/expiry put, ordinary put) first crosses `markIndexedWrite`: indexed state is durable, then the witness exists, and only then may SQL run. External state plus the witness stop a missing DB from reopening stale JSON; a crash after state/witness but before SQL only closes the fallback early, the conservative direction. Before every legacy JSON put the registry confirms legacy authority under the held lock (`confirmLegacyAuthority`).
- **Active-row recovery.** `exclusive` reconciles interrupted `verifying`/`creating` rows (from the index's active rows, or the snapshot in legacy mode) before running the operation.
- **Cursors.** `listPage` cursors encode position (`createdAt`, `importId`) only, never a principal.
- **Refusal latch.** MISSING, DAMAGED and NEWER refusals latch for the process: every backend method (`importBackup`, `completeOwner`, `upload`, `list`, `listPage`, `get`, `tidy`) then fails with the typed `ImportHistoryUnavailable`, and `tovu import-local` prints the error's own sentence. Busy and out-of-space pass through unlatched. Once indexed, failing closed is what prevents a second site.
- **Pre-write rollback and quarantine.** Before the first indexed write a missing, damaged or foreign DB leaves the snapshot authoritative; pending owner stages in `payloads/` are untouched, so owner setup still completes. Under the lock a suspect DB and its WAL/SHM move (never overwrite, resumable) into `site-imports.quarantine-<dbId>/`. Never for a newer schema, a busy DB, or indexed data.
- **Retirement.** `tidy` runs the existing cleanup, then `retire({})`: only in indexed mode and at least 30 days after cutover, it deletes at most 200 regular `<uuid>.json` files with `mtime <= cutoverAt` per pass and records `legacyRetiredAt` only when none remain. Newer history files (written by a pre-P5 build after a downgrade) are kept and only counted. The witness is never retired. No timer: a later scheduler may call the public `tidy`.
- **Admin/tool mounts.** The running site composes the backend once in `server/runtime/composition/site-deps/site-imports.ts` as `routeDeps.siteImportBackend`; the Admin import routes (`server/runtime/composition/http-app/mount-admin-system.ts`, mounted by `http-app/mount-admin-system.ts`) and `backup-service.ts` use that one instance; `tovu import-local` composes the same backend in its one-shot process.

Host binding example:

```ts
const authority = bindSiteImportIndexState({ directory, policy, clock, fs, open, checkIntegrity, backfill, log });
const registry = new SiteImportRegistry({ directory, payload, history: authority.history });
const backend = createSiteImportBackend({ ...ports, registry, authority });
```

Forbidden: importing `better-sqlite3`, a native driver, or value exports of the Jini `import-index` internals (`open`, `store`) into `features/` (type-only imports are fine); holding a DB handle across resolutions; writing the state file or witness outside the binding; reading the snapshot without the `history` seam; adding a retirement timer.

Not detected (see `ADS-memory/specs_as_built/changelog/p5-import-history-downgrade.md`): restoring an older index backup with the same DB ID, losing committed data in the `-wal` file, and losing every authority artifact (state, witness and index) at once.
