DESIGN COMPLETE (R1123: T1–T4 revised per `reviews/plans1123.md`; see the R1123 block under each step)

**Merged by the coordinator (Software Architect role; `AI-Dev-Shop/agents/software-architect/skills.md` loaded) from a read-only subagent draft; key anchors re-checked 11-23 (`site-import-backend.ts:39`, `import-backend-steps.ts:119–120`, `import-registry.ts:8,95–97,125`, `W/server/inbound/shared/admin-failure.ts:70,123`).** Design only; no production code.

# P5 · Import history: algorithm design (T1..T4)

Scope: `plans/P5-import-history.md` (WHAT) plus every P5 row of `reviews/check-P3-P4-P5.md` (Codex corrections, applied below), and the owner decisions in `INDEX.md`: 30 days of visible history, a replay record kept for 1 year, Q2 restore-from-backup OUT of scope, old-build rollback rec = accept (no freeze, still an owner question).
`W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`. `<ws>` = `<appData>/site-imports/<workspaceId>/`.

| step | operations designed | invariants | open owner questions |
|---|---|---|---|
| P5-T1 | ensurePayloadNamespace (one-time move of ZIP, upload metadata and stage under the lock, with a marker), expirePayloads, requireStagingBudget (payloads only), orphan sweep, split of legacy history expiry | I1–I5 | OQ1 (owner home), OQ4 (upload metadata stays JSON) |
| P5-T2 | openImportIndex + migrate `site-imports-v1`, put/settle (transition guard), get, listPage (keyset cursor encode/decode), admit (fence lookup, then conflict, then atomic insert, then consume upload), activeRows (recovery), expireOwnerSetups, sweep, list (array compatibility), route/tool/admin paging | I6–I17 | OQ2 (lockless list), OQ3 (array API), OQ7 (replay outcome shape), OQ8 (conflict status), OQ11 (clock-backwards sweep) |
| P5-T3 | backfillImportIndex (validate, duplicate-key rule, fence derivation, one transaction with marker), blocked cutover, recovery of active rows once after cutover | I18–I22 | OQ9 (repairing an unreadable row) |
| P5-T4 | index-state record outside the DB, resolveMode (legacy / cutover / indexed / refused), markIndexedWrite, pre-write rollback, fail-closed open, legacy snapshot retirement | I23–I28 | OQ5 (old-build downgrade), OQ6 (snapshot retirement point), OQ10 (cutover policy default) |

## Bases and verified anchors

Read with `git show <ref>:<path>`. Tovu base `origin/integ/merge-13-2026-11-22` = `f7185f153`; Jini base `origin/integ/merge-14-2026-11-22` = `4902a6a1`.

**Tovu (all verified at f7185f153):**
- `W/features/site-backup/import-registry.ts`: `SiteImportRecord` :10 (status union :21, `expiresAt` :23); `SiteImportUpload` :30; `UPLOAD_TTL_MS` :33; `STAGED_STATUSES` :35; `withoutQuery` :37; `importSourceDigest` :44 (undefined for uploads); `class SiteImportRegistry` :58; root `directory` :59–64; per-record `createDurableJsonFile` :69–71; read refusal `REGISTRY_UNREADABLE` :72–77 with `get` :78–82; `put` :83–88 (strips the source query on terminal rows, :85); `list` :89–94 (readdir + sort `createdAt` desc); `uploadPath`/`stagePath` :95–96 (same directory as history); `saveUpload` :97; `getUpload` :98–103 (TTL check `createdAt + UPLOAD_TTL_MS < Date.now()`); `exclusive` + `.import.lock` :105–107 (`staleMs: Infinity`); `expireUpload` :109–118; `expireOwnerSetup` :120–131 (`row.expiresAt < Date.now()` :125); orphan upload :133–136; orphan stage :138–144; `expire` :150–161 (one readdir over the shared directory).
- `W/features/site-backup/import-backend.ts`: `SiteImportBackend.list` :26 (array API); `createImportContext` :60–74 (in-process `active` flag :67–72, then lock, then `reconcileInterruptedImports` :71); `fetchArchive` :77–84 (consume upload, then read ZIP); `verifyAndStage` :88–104 (upload ZIP removed in `finally` :103); `createImportedSite` :108–134 (`onAllocated` put :113–119); `uploadImportArchive` :136–147 (ZIP written `wx` :142 BEFORE metadata :143); `startImportFromSource` :153–170 (`expire` :156, replay **scan** `registry.list(input).find(...)` :157, source compare :159–162, url budget :165, new row :166, `expiresAt = now + 3600_000`); `completeImportOwner` :172–202 (creating :191, ready :194–195, stage rm :197, started put :199); `list` :215 (`expire` + full `list` under the lock); `tidy` :217.
- `W/features/site-backup/import-backend-steps.ts`: `requireStagingBudget` :76–81 (`readdirSync(registry.directory)` :78, limit 4, free space); `consumeUpload` :89–94; `reconcileInterruptedImports` :119–126 (unbounded `registry.list({})` :120); `reconcileCreatingRow` :129–133; `siteImportView` :164–174.
- `W/server/runtime/composition/site-import-backend.ts:39`: per-workspace root `join(workspace.config({}).appData, "site-imports", required.workspaceId)`. The plan's "`appData/site-imports/`" is corrected to this per-workspace root.
- `W/server/inbound/admin-http/routes/system/site-imports.ts`: `importFailure` :42 (a refusal maps to 404/400 :44–47; anything else is an incident); GET list :90–93; POST :94–103; uploads :108; owner :132/:140; root `/api/admin/v1/workspaces/:workspaceId/site-imports` :175.
- `W/features/site-backup/tool-registrations.ts`: `site_import_list` catalog :91–92 (`properties: {}`); handler map :211; `handleImport` :235–249 (`:242` refuses any field).
- `W/features/site-backup/__tests__/import-history-retention.unit.test.ts`: case 1 :27, case 2 :42 (red by design; it needs list hidden at `START+30d+1` and replay returning the original `importId` while the fence stays live until 365 d).
- ERR- ids: the prompt's `W/shared/admin-failure.ts` does not exist at the base. The owner is `W/server/inbound/shared/admin-failure.ts` (`adminFailureResponse` :70, `sendAdminFailure` :123).
- SQLite precedent: `W/server/runtime/composition/site-deps/database-journal.ts:29–32` (mkdir first, then `openDatabaseJournalDb`, close registered). That opener's body is UNVERIFIED (not read).
- Admin: `A/features/sites/hooks/site-transfer-dependencies.hooks.ts` `listImports()` :85, GET :155; `A/features/sites/hooks/use-site-import-state.hooks.ts:15` (`useFetchQuery`); `A/features/sites/SiteImportTab.tsx` hook props :46, `ImportList` :325.
- OpenAPI: no `openapi/*.yaml` at the base mentions `site-imports`, so the entry is new. Its file number is UNVERIFIED; take the next free number.

**Jini (verified at 4902a6a1):** `J/core/src/contracts/storage/sqlite.ts:65` `SqliteDb`, `:67` `SqliteSyncOpener` (structural, no driver import); `J/core/src/primitives/time.ts:5` `Clock { nowMs() }`; `J/core/src/contracts/runtime/file-lock.ts:57` `FileLockPort`; `J/core/src/contracts/server/json-route.ts:92` `JsonRouteSpec`, `:132` `defineJsonRoute`; `J/daemon/src/store/event-log/sqlite.ts:25,53,72,81` (a borrowed `SqliteDb`, an owned open through a host opener, `journal_mode = WAL`); `J/platform/src/fs/file-lock.ts:300` `withFileLock`, `:84` pid liveness (a lock whose owner is dead is broken even with `staleMs: Infinity`); `J/platform/src/fs/durable-json.ts:91,95,114` (fsync the file, then rename; the directory flush is best-effort and skipped on Windows); `@jini-ai/devops` already depends on `@jini-ai/core` and `@jini-ai/platform`.

**Unmerged heads (screened against the merge-bases):**
- Tovu `ex5-fnd-inject-tovu` and `ex5-fnd-seams-tovu` touch `import-backend.ts`, `import-registry.ts` and `site-import-backend.ts`, but only re-point type imports to `@jini-ai/core/contracts/site/*` (`Tracker`, `SiteCreationAllocation`, `CreateSiteResult`, `AgentPluginArchiveReaderPort`). They change no behaviour, and P5 must rebase on them.
- `ex5-fnd-kit-tovu` touches `SiteImportTab.tsx`, `site-transfer-dependencies.hooks.ts`, `use-site-import-state.hooks.ts` and `site-transfer-i18n.ts`, all as import re-points (`@jini-ai/admin/shell/lib/admin-boot-scope`). The admin "Show more" work rebases on it.
- `ex5-fnd-routes-tovu` and all `ex4-*-tovu` heads touch no import file.
- Jini: only `ex4-deploy-jini` creates `J/devops/src/backup/site/` (`share-export-failure.ts`, from P9 D-site-backup-1). **No head creates `J/devops/src/backup/site/import-*`.**
- P9 `plans/P9-steps/K5-site-backup-2.md:12` moves `import-registry.ts`, `K5-site-backup-3.md:9` moves `import-backend-steps.ts` and `K5-site-backup-7.md:13` moves `import-backend.ts` to `J/devops/src/backup/site/`, with exports `./backup/site/import-{registry,backend-steps,backend}`. All are pending. **Design target = the destination.** All new P5 code is new Jini files under `J/devops/src/backup/site/import-index/`, which have no move dependency. Edits to the three moved files land wherever those files are when the step runs (OQ1).

---

## P5-T1 · Payload namespace and case 4a "no history scan"

> **R1123 revision (Codex: NEEDS) — supersedes §2 steps 66–78 where they differ.**
> 1. **Exact, contained entries only.** A root entry is a move candidate iff its name matches exactly `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(upload\.zip|upload\.json|stage)$`, `lstat` shows a regular file (`.zip`/`.json`) or a directory (`.stage`) — **never a symlink** — and `realpath(root/name)`'s parent equals `realpath(root)`. Everything else is ignored (never moved, never removed).
> 2. **Both source and destination exist → verify identity or refuse.** Files: equal size **and** equal SHA-256 (streamed, injected `hashFile`) → remove the source. Stage dirs: equal manifest (`relpath, type, size, sha256` for every entry, bounded 10 000 entries) → remove the source. Otherwise **refuse without removal**: both copies stay, the id is written to `<ws>/payloads/.conflicts.json` (durable writer), the marker is **not** published, the upload reports `IMPORT_PAYLOAD_CONFLICT` ("This upload has two different copies on disk, so Tovu kept both. Upload the file again."). The old "destination wins: `rm root/name`" rule is deleted.
> 3. **Durable marker publication.** Ports `writeFile`, `fsyncFile`, `rename`, `fsyncDir` are injected (required; the Windows binding's `fsyncDir` is a documented no-op). Publication: write `.namespace-v1.tmp` = `{"v":1,"rootMtimeMs":<root mtime after the moves>}` → `fsyncFile` → `rename` to `.namespace-v1` → `fsyncDir(root)`. The marker is trusted only if it **parses** with `v === 1`; an empty/unparsable marker (crash before fsync on a filesystem that reorders) → migration reruns (it is idempotent by rules 1–2).
> 4. **Legacy writers after the marker (version-compatible layout, Codex OWNER-Q5 alternative).** Old binaries cannot be blocked by new code, so the new reader stays compatible: (a) by-id lookups (`get`, claim, `consumeUpload`) check `payloads/<id>.*` **then** the exact root name (`exists`, no `readdir`); a root hit is moved into `payloads/` under the lock before use; (b) at each lock acquisition, `stat(root).mtimeMs !== marker.rootMtimeMs` → one bounded exact-name pass (rule 1) moves new legacy entries and republishes the marker with the new mtime; unchanged mtime → no `readdir` (I4 still holds).
> - Tests (written first): **«Interrupted migration with conflicting destinations preserves both copies»** (mutation: old destination-wins `rm` → source gone → red); **«Legacy writer after marker publication is still claimable and swept»** (old-layout write after marker → claim succeeds, entry moved; mutation: drop the root-name fallback → `UPLOAD_NOT_FOUND` → red); `a symlinked or out-of-root entry is never moved`; `an unparsable marker reruns the migration`.

### 1. Data model
- No SQL in T1. Directory layout (owner: Jini `@jini-ai/devops` logic, Tovu binds `<ws>`):
```
<ws>/                          0700, history root (legacy <importId>.json records stay here)
  .import.lock                 withFileLock (unchanged path)
  <importId>.json              legacy history records (still authoritative in T1)
  payloads/                    0700, NEW
    .namespace-v1              empty marker, written last (wx, 0600, fsync)
    <uploadId>.upload.zip      0600
    <uploadId>.upload.json     durable JSON {uploadId, principalId, createdAt(ms), consumedBy?}
    <importId>.stage/          staged verified import
```
- In memory: `namespaceReady: boolean` per registry instance. It is a cache only; the marker file is the truth.
- Upload metadata stays a durable JSON file (OQ4); it moves with its ZIP.

### 2. Algorithm
`payloadPaths(root)`: `{ dir: root/payloads, upload(id), uploadMeta(id), stage(id), marker }`. `uploadPath`/`stagePath` (:95–96) return the `payloads/` paths from T1 on.

`ensurePayloadNamespace()`. The caller must hold `.import.lock`; it runs first inside every `exclusive()` run, before `reconcileInterruptedImports`.
1. If `namespaceReady` is set, or `exists(marker)`: set `namespaceReady = true`; return.
2. `mkdir(payloads, {recursive, mode 0o700})`; `chmod 0o700`.
3. `names = readdir(root)`. This is the ONE permitted enumeration of the history directory, and it runs only while the marker is absent.
4. Move in three passes, each item with `moveOne(name)`:
   a. every `<uuid>.upload.zip`;
   b. every `<uuid>.upload.json`;
   c. every `<uuid>.stage` directory.
   Payload goes before metadata, matching the upload write order at :142–143.
5. `moveOne(name)`:
   - If `payloads/name` already exists, a fresh write after a partial earlier move is impossible because both run under the lock. The destination wins: `rm root/name` (recursive for a stage).
   - Otherwise `renameSync(root/name, payloads/name)`. This is an atomic same-volume rename, so EXDEV cannot happen.
6. `fsyncDir(payloads)`, then `fsyncDir(root)`. Both are best-effort and skipped on Windows, like `durable-json.ts:91`.
7. `writeFileSync(marker, "", {flag: "wx", mode: 0o600})`, then fsync the marker, then `fsyncDir(payloads)`. Set `namespaceReady = true`.

`expirePayloads()` (lock held; replaces the payload half of `expire` :150–161). It enumerates **only** `payloads/`:
- `*.upload.json`: `expireUpload` (unchanged rule: expire iff `row === null || createdAt + 3_600_000 < now`).
- `*.upload.zip`: `removeOrphanUpload` (metadata missing or unreadable means a crash between :142 and :143).
- `*.stage`: `removeOrphanStage`. The owning status comes from a **by-id** read (`readRecord`, legacy, :73). In T2 it comes from `index.get`. It never enumerates. An unreadable record keeps the stage (:141).

`expireHistory()` (legacy, lock held): the old per-record branch `expireOwnerSetup` (:120–131), still enumerating `root`. It runs only from legacy-mode admission, list and tidy. Codex: "keep legacy owner expiry separate until T2". T2 replaces it with the indexed `expireOwnerSetups`.

`requireStagingBudget({registry})` (:76–81) becomes:
1. `registry.expirePayloads()`.
2. `n = readdir(payloads).filter(/\.upload\.zip$|\.stage$/).length`.
3. If `n >= 4`: BUSY "Four imports are staged…" (copy unchanged).
4. `requireFreeSpace({dir: payloads, …})`.

### 3. State machine
Namespace state: `unmigrated` (no marker) → `migrating` (lock held, moves in progress; on crash it falls back to `unmigrated` with some files already moved) → `ready` (marker present). The only transition out of `ready` is retirement of the whole `<ws>` folder (out of scope). The import row machine is unchanged in T1.

### 4. Concurrency and crash safety
The lock covers all moves, the marker write, every payload sweep, and budget counting. `get` and `view` outside the lock may compute a `payloads/` stage path before migration runs. They then show no warnings for that moment. This is harmless and self-heals on the next locked operation.

| crash point | state on restart | recovery |
|---|---|---|
| between ZIP rename and metadata rename (same id) | ZIP in `payloads/`, `.upload.json` in root | no sweep runs before `ensurePayloadNamespace` (marker absent), so the ZIP is not an "orphan"; pass b moves the metadata; then the upload is claimable and owner setup completes |
| between passes / mid-stage pass | some stages in root | resumed; `moveOne` is idempotent |
| after the last rename, before the marker | all moved, no marker | step 3 finds nothing to move; marker written |
| after the marker, before the dir fsync | marker may be lost on power loss | re-run is a no-op move; marker rewritten (`wx` on an existing marker means it is already done: treat EEXIST as success) |

Two processes (site server plus `tovu import-local`): serialized by `.import.lock`. A lock left by a dead process is broken through pid liveness (`file-lock.ts:84`).

### 5. Failure modes
- `rename` EACCES/EPERM: throw `ImportHistoryUnavailable{code:"IMPORT_PAYLOADS_UNMOVABLE", status:503}` with "Import files could not be prepared. Nothing was deleted. Check the app data folder permissions." Admin mints an ERR- id. The marker is not written, so the next run retries.
- ENOSPC cannot come from a rename. ENOSPC on the marker uses the same error with "There is not enough free disk space…".

### 6. Invariants
- **I1** Once the namespace is ready, staging budget and orphan sweep never enumerate the history root. Test (plan name): `staging budget and orphan sweep never enumerate the history directory` (a fake fs throws on `readdir(root)`). Red mutation: restore `readdirSync(registry.directory)` in `requireStagingBudget`.
- **I2** A payload is never swept before migration completes. Test: `interrupted move (ZIP moved, metadata not) then restart keeps the upload claimable and owner setup completes` (Codex T1). Red mutation: call `expirePayloads` before `ensurePayloadNamespace` in `exclusive`.
- **I3** Active payloads survive the move; stale ones are removed. Test (plan): `active payloads survive the move; stale ones are removed`. Red mutation: drop pass b (metadata stays in root, so the moved ZIP becomes an orphan).
- **I4** Migration enumerates root at most once per workspace. Test: `second open does not readdir the history root`. Red mutation: ignore the marker.
- **I5** Legacy owner expiry is unchanged in T1. Test: the existing `import-registry.unit.test.ts` expiry cases stay green. Red mutation: move `expireOwnerSetup` into `expirePayloads`.

### 7. Wiring
- New Jini file `J/devops/src/backup/site/import-index/payload-namespace.ts`. Exports `ensurePayloadNamespace({root, fs}, {})`, `payloadPaths({root})`, `expirePayloads({paths, fs, clock, statusOf})`, `countStagedPayloads(...)`.
- Ports: `ImportPayloadFs` (feature-owned in devops: `readdir, rename, rm, exists, mkdir, chmod, writeExclusive, fsyncDir`), `Clock` (`@jini-ai/core/primitives`), and `statusOf({importId}) → status | "unreadable" | undefined` (registry-supplied).
- The registry (wherever K5-site-backup-2 has put it) calls these. Tovu passes `node:fs` adapters at `site-import-backend.ts:39`.
- Must not import: `node:fs` directly in the new module (the fs port is injected), Tovu `#src/*`, or `express`. No re-export shell: the registry imports from `import-index/payload-namespace.js` directly.
- Split points (each ≤80 lines, complexity ≤10): `ensurePayloadNamespace` (orchestrates), `moveOne`, `movePass`, `expirePayloads`, `classifyPayload(name) → kind|undefined`, `countStagedPayloads`.

### 8. Owner questions
- `OWNER-Q1:` Where do the edits to the three moved files land if K5-site-backup-2/-3/-7 are unlanded? **Rec:** new modules go to Jini now (no dependency). Land K5-site-backup-2 before P5-T1 so the registry edit happens once, in Jini. If it is blocked, edit the Tovu registry with imports only from `@jini-ai/devops/backup/site/import-index/*` and `@jini-ai/core`, so the later move is verbatim.
- `OWNER-Q4:` Upload metadata: JSON files or a SQLite table? **Rec:** JSON in `payloads/`. Uploads live at most 1 h, with at most 4 at once. Keeping them out of the DB keeps T1 independent of T2, and admission does not need them in the same transaction (§T2.4).

---

## P5-T2 · Indexed store behind the registry (cases 2 and 4b)

> **R1123 revision (Codex: NEEDS) — supersedes the sweep SQL, the admit order and the expiry write order below.**
> - **`last_sweep_ms` is initialized and upserted.** Schema setup runs `INSERT OR IGNORE INTO meta(key, value) VALUES ('last_sweep_ms', '0')`; the sweep writes `INSERT INTO meta(key, value) VALUES ('last_sweep_ms', :now) ON CONFLICT(key) DO UPDATE SET value = excluded.value`.
> - **`replay` is `WITHOUT ROWID` → composite key, no `rowid`.** New index `CREATE INDEX IF NOT EXISTS replay_by_age ON replay(accepted_ms)`; bounded delete: `DELETE FROM replay WHERE (principal_id, request_id) IN (SELECT principal_id, request_id FROM replay WHERE accepted_ms + 31536000000 <= :sweepClock ORDER BY accepted_ms LIMIT 500)`. (`imports` is a rowid table and keeps its loop.)
> - **Admit order:** replay lookup → **upload preflight** (exists, owned by this principal, not expired, not consumed; for `url` sources: budget) → conflict → atomic insert (fence) → consume. A preflight refusal commits **no** fence. If consume still fails after the commit (raced expiry), one txn marks the row `failed` (`UPLOAD_GONE`) **and** deletes its fence row, so a retry is admitted.
> - **Expiry write order:** `expireOwnerSetups` commits `put({ …row, status: 'failed', reason: 'owner-setup-expired' })` **first**, then removes `payloads/<id>.stage`. A crash between leaves an orphan stage, which the T1 orphan sweep removes (stage without a non-terminal row).
> - **Forward clock jumps (OWNER-Q11):** destructive sweeps use `sweepClock = min(now, evidenceMs + 30 d)` where `evidenceMs = max(last_sweep_ms, MAX(imports.created_ms), MAX(replay.accepted_ms))`; `now < last_sweep_ms` (regression) → skip destructive work. A jump of years past the latest evidence cannot free a recent fence; real elapsed time with new writes advances `evidenceMs`.
> - Tests: **I8 exact boundary** — fence conflicts at `accepted + 365 d − 1 ms` and is freed at **exactly** `accepted + 365 d` (mutation: `<` for `<=` → exact test red). **I17 exact deadline** — owner setup at **exactly** the deadline fails "Owner setup expired" and its stage is removed after the failed row is durable (mutations: `<` for `<=`; rm before put with a crash injected → row still `needs-owner` with no stage → red). **I12** adds one principal with **60** rows sharing one `created_ms` (page 50) → no duplicates/skips. **I29** `replay key on a WITHOUT ROWID table is swept in bounded batches` (mutation: `rowid` query → SQL error → red). **I30** `clock jumped two years past the latest write does not free a one-day-old fence`. **I31** `preflight refusal commits no fence`. Replay assertions use the **public shape** (`state`, original `siteId`) as `import-history-retention.unit.test.ts:27–54` does.

### 1. Data model
File `<ws>/site-imports.db` (plus `-wal`/`-shm`), mode 0600. It is opened through the host's `SqliteSyncOpener`. Pragmas on every open, in this order: `journal_mode = WAL`, `synchronous = FULL`, `busy_timeout = 5000`, `foreign_keys = ON`. If `journal_mode` returns something other than `wal` (a network volume), proceed: the import lock already serializes writers. Migration name `site-imports-v1`, `PRAGMA user_version = 1`.

```sql
-- migration site-imports-v1 (runs in BEGIN IMMEDIATE only when user_version = 0)
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
-- keys: 'schema'='site-imports-v1', 'db_id'=<uuid>, 'cutover_at'=<ms> (T3), 'backfill_count'=<n>, 'last_sweep_ms'=<ms>
CREATE TABLE imports (
  import_id    TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  request_id   TEXT,
  status       TEXT NOT NULL CHECK (status IN ('verifying','needs-owner','creating','ready','failed')),
  created_ms   INTEGER NOT NULL,          -- Date.parse(createdAt)
  settled_ms   INTEGER,                   -- NULL while active; set once on first ready|failed
  expires_ms   INTEGER NOT NULL,          -- owner-setup deadline (legacy expiresAt)
  row_json     TEXT NOT NULL,             -- full SiteImportRecord (terminal rows: source origin-only)
  CHECK ((status IN ('ready','failed')) = (settled_ms IS NOT NULL))
) STRICT;
CREATE INDEX imports_page    ON imports (principal_id, created_ms DESC, import_id DESC);
CREATE INDEX imports_active  ON imports (status, expires_ms) WHERE status IN ('verifying','needs-owner','creating');
CREATE INDEX imports_settled ON imports (settled_ms) WHERE settled_ms IS NOT NULL;
CREATE TABLE replay (
  principal_id TEXT NOT NULL,
  request_id   TEXT NOT NULL,
  fence_kind   TEXT NOT NULL CHECK (fence_kind IN ('sha256','upload','origin')),
  fence_value  TEXT NOT NULL,             -- sha256 hex of url.href | uploadId | url origin (legacy, T3)
  import_id    TEXT NOT NULL,
  accepted_ms  INTEGER NOT NULL,
  outcome_json TEXT NOT NULL,             -- minimal outcome, see OQ7
  PRIMARY KEY (principal_id, request_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX replay_expiry ON replay (accepted_ms);
PRAGMA user_version = 1;
```
- Constants (devops): `HISTORY_VISIBLE_MS = 2_592_000_000` (30 d), `REPLAY_FENCE_MS = 31_536_000_000` (365 d), `PAGE_MAX = 50`, `SWEEP_BATCH = 500`.
- Exact retention predicates, with `now = clock.nowMs()`:
  - **visible** iff `status IN active` OR `now < settled_ms + 2_592_000_000`.
  - **fence live** iff `now < accepted_ms + 31_536_000_000`.
  - Physical delete uses the exact complements (`>=`).
- Minimal outcome (OQ7): `{importId, status, newSiteId, newSiteName, displayName, createdAt, source (origin-only or uploadId), adminUrl?, error?, hasEncryptedKeys?}`. It carries no warnings, credentials or creation allocation.
- In memory: one `SqliteDb` handle per registry (closed by the host's close registration) and prepared statements. There is no cached state beyond the handle.
- Owners: the DDL, store, cursor and admission logic are Jini `J/devops/src/backup/site/import-index/`. The DB file location, the opener, and copy are Tovu.

### 2. Algorithm
**open** `openImportIndex({file, open, clock}, {})`:
1. `db = open(file, {fileMustExist: mode !== "legacy"})`. The mode comes from T4 `resolveMode`; T2 alone always uses legacy-then-backfill.
2. Apply the pragmas.
3. `v = pragma user_version`:
   - `v == 0`: migrate (above, one transaction).
   - `v == 1`: ok.
   - `v > 1`: close, then `IMPORT_HISTORY_NEWER` (fail closed).
4. Run `quick_check(1)` once per process. If it is not `ok`, throw `IMPORT_HISTORY_DAMAGED`.
5. Prepare the statements and return the store.

**put(row)** (lock held; replaces the JSON write at :83 once cutover is reached). This is the only writer for `imports`:
1. `prev = SELECT status, settled_ms FROM imports WHERE import_id=?`.
2. `assertTransition(prev?.status, row.status)` (§3). An illegal transition is a programming error and throws.
3. `stored = terminal(row) ? {...row, source: withoutQuery(row)} : row` (preserves :85).
4. `markIndexedWrite()` (T4; a no-op once the mode is `indexed`).
5. `BEGIN IMMEDIATE`:
   - `INSERT INTO imports(...) VALUES(...) ON CONFLICT(import_id) DO UPDATE SET status=excluded.status, row_json=excluded.row_json, expires_ms=excluded.expires_ms, settled_ms=COALESCE(imports.settled_ms, excluded.settled_ms)`, where `excluded.settled_ms = terminal ? now : NULL`.
   - If `row.requestId`: `UPDATE replay SET outcome_json=? WHERE principal_id=? AND request_id=? AND import_id=?`.
   - `COMMIT`.
6. `report?.(...)` (unchanged hook).

`COALESCE` means a later `ready → ready` update (adminUrl, :199) never moves `settled_ms`, and a replay never writes at all.

**get({importId, principalId})**: `SELECT row_json FROM imports WHERE import_id=? AND principal_id=?`. A missing row gives `NOT_FOUND` (copy :80). This is a by-id lookup with no visibility filter, so owner setup can reach its own row while it is active.

**listPage({principalId, cursor?, limit?})** (no lock, OQ2):
1. `n = clampInt(limit ?? 50, 1, 50)`.
2. `pos = cursor === undefined ? null : decodeCursor(cursor)`. An invalid cursor gives `INVALID_CURSOR`.
3. `now = clock.nowMs()`. Then:
```sql
SELECT row_json, created_ms, import_id FROM imports
WHERE principal_id = :p
  AND (status IN ('verifying','needs-owner','creating') OR :now < settled_ms + 2592000000)
  AND (:hasPos = 0 OR (created_ms, import_id) < (:c, :i))
ORDER BY created_ms DESC, import_id DESC
LIMIT :n + 1;
```
4. `rows = result.slice(0, n)`. `nextCursor = result.length > n ? encodeCursor(last(rows)) : undefined`.
5. Map each row with `viewOf(row, now)`. A `needs-owner` row with `expires_ms < now` shows as `failed` with "Owner setup expired. Import the archive again.". This view is derived only; the write happens at the next locked `expireOwnerSetups`.

**Cursor**:
- `encodeCursor({created_ms, import_id}) = base64url("v1." + created_ms + "." + import_id)`.
- `decodeCursor(s)`:
  1. Require `typeof s === "string"` and `s.length <= 96`.
  2. Require `/^[A-Za-z0-9_-]+$/`, then base64url-decode.
  3. Match `^v1\.(\d{1,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$` and require the number to be a safe integer.
  4. Any failure gives `INVALID_CURSOR`.

  The cursor holds no principal and no secret. The `principal_id = :p` filter makes a foreign cursor a harmless position.

**list({principalId})** (array API preserved, :26/:215; OQ3): loop `listPage` with the returned cursor until `nextCursor` is undefined. The result is bounded by the 30-day window. It is used by internal callers and tests only. The route and tool move to `listPage`.

**admit** (lock held; replaces :156–167). Order: replay lookup, then conflict, then budget, then atomic insert, then consume upload.
1. `now = clock.nowMs()`.
2. If `requestId`:
   - `f = SELECT * FROM replay WHERE principal_id=? AND request_id=? AND :now < accepted_ms + 31536000000`.
   - If `f` and not `sameFence(f, parsed.source)`: `REQUEST_CONFLICT` (copy :162). This happens with no write, no download and no upload read.
   - If `f` matches: `live = SELECT row_json FROM imports WHERE import_id=f.import_id AND (status IN active OR :now < settled_ms + 2592000000)`. Return `live ? view(live) : viewOfOutcome(f.outcome_json)`. Never write.
3. If `"url" in source`: `requireStagingBudget` (T1).
4. Build `row` (as at :166) with `createdAt = new Date(now).toISOString()`, `expiresAt = now + 3_600_000` and `status = "verifying"`.
5. `markIndexedWrite()`.
6. `BEGIN IMMEDIATE`:
   - `DELETE FROM replay WHERE principal_id=? AND request_id=? AND accepted_ms + 31536000000 <= :now` (frees an expired key).
   - `INSERT INTO replay(...) VALUES(..., accepted_ms=:now, outcome_json=minimal(row))` (only if `requestId`).
   - `INSERT INTO imports(... status 'verifying', settled_ms NULL ...)`.
   - `COMMIT`. A PK collision on `replay` cannot happen because the lock is held and step 2 found no live fence.
7. Return `row`. `verifyAndStage` (:88) then calls `consumeUpload`. That is a JSON write to `payloads/<id>.upload.json` with `consumedBy = importId`, which happens AFTER the admission commit.

**sameFence(f, source)**:
- `sha256`: `"url" in source && sha256(source.url) === f.fence_value` (same as `importSourceDigest` :44).
- `upload`: `"uploadId" in source && source.uploadId === f.fence_value`.
- `origin`: `"url" in source && new URL(source.url).origin === f.fence_value`. This is the legacy `withoutQuery` comparison at :161.

**activeRows()** for recovery (replaces :120):
```sql
SELECT row_json FROM imports WHERE status IN ('verifying','creating')
```
It is served by the partial index `imports_active`. The `reconcileInterruptedImports` body is unchanged otherwise: verifying → failed; creating → `reconcileSiteCreation`; then rm the stage.

**expireOwnerSetups()** (lock held; replaces `expireOwnerSetup` :120–131):
```sql
SELECT row_json FROM imports WHERE status='needs-owner' AND expires_ms < :now
```
Keep `<` from :125. For each row: rm `payloads/<id>.stage`, then `put({...row, status:'failed', error:"Owner setup expired. Import the archive again."})`.

**sweep()** (lock held; in `tidy` and after admission; P11 schedules `tidy`):
1. Read `last = meta.last_sweep_ms`. If `now < last`, skip the physical delete: the clock went backwards (OQ11).
2. Loop `DELETE FROM imports WHERE rowid IN (SELECT rowid FROM imports WHERE settled_ms IS NOT NULL AND settled_ms + 2592000000 <= :now LIMIT 500)`, one transaction per batch, until `changes < 500`.
3. Same loop for `replay WHERE accepted_ms + 31536000000 <= :now`.
4. `UPDATE meta SET value=:now WHERE key='last_sweep_ms'`.

Correctness never depends on the sweep, because every read applies the predicates.

### 3. State machine: import row
```
(admit) ──► verifying ──verifyAndStage ok──► needs-owner ──completeOwner──► creating ──createSite ok──► ready ──start result──► ready
               │                                 │                              │                          (adminUrl/error only)
               │ verify error / recovery         │ expireOwnerSetups /           │ create error /
               ▼                                 ▼ low space / abort             ▼ recovery w/o site
             failed ◄────────────────────────── failed ◄──────────────────────── failed
                                                                creating ──recovery finds site──► ready
```
- Allowed `(prev → next)`: `∅→verifying`; `verifying→{verifying, needs-owner, failed}`; `needs-owner→{creating, failed}`; `creating→{creating, ready, failed}` (`creating→creating` is the allocation and restore puts at :118/:125); `ready→ready`.
- Terminal: `failed` (no exit) and `ready` (field updates only).
- Who triggers each: admission (HTTP/tool POST); `verifyAndStage`; owner POST (`completeImportOwner`); `expireOwnerSetups` and `reconcileInterruptedImports` (any lock holder).
- Replay fence: `absent → live (admit) → expired (time) → deleted (sweep)`. `outcome_json` follows the row on every put.

### 4. Concurrency and crash safety
- The `.import.lock` covers admit, put, expireOwnerSetups, activeRows recovery, sweep, backfill and namespace migration. `get` and `listPage` are lock-free WAL readers (OQ2).
- The in-process `active` flag (:67–72) stays.
- `busy_timeout = 5000` absorbs checkpoint and external readers. There is no app-level retry loop, so nothing sleeps while holding the lock.

| crash between | state after restart | outcome |
|---|---|---|
| fence lookup and admission commit | nothing written | retry admits normally |
| `markIndexedWrite` and the admission transaction | state `indexed`, DB unchanged | safe; only means the legacy fallback is now closed (T4) |
| admission commit and consumeUpload | verifying row plus fence; upload unconsumed | recovery marks it `failed` ("verification was interrupted"); the same requestId replays the failed outcome; the upload is still claimable with a new requestId |
| consumeUpload and stage write | verifying, upload consumed | recovery fails the row; `expirePayloads` removes the consumed ZIP after its TTL (orphan rule) |
| stage written and the `needs-owner` put | verifying plus stage | recovery fails the row and removes the stage (:124) |
| `creating` put and allocation put | creating without an allocation | recovery gives `failed` (:131) |
| allocation put and the `ready` put | creating with an allocation | `reconcileSiteCreation` gives `ready` when the site exists, so no second site is made |
| `ready` put and startSite | ready, no adminUrl | stays ready; the start is not repeated (existing :193 rule) |

- Two windows (one process): the in-process `active` flag makes the second call BUSY. Two processes or two profiles on the same appData share the same `<ws>`: the lock file serializes writers and SQLite WAL handles readers. Different workspaces have different `<ws>` folders, so isolation comes from the directory.
- Clock moving backwards: `settled_ms` or `accepted_ms` in the future only lengthens visibility and fences (the safe direction). The physical sweep is skipped while `now < last_sweep_ms`.
- Clock moving forwards: a jump of 30 d or more hides history early, and a jump of 365 d or more frees keys early. Accepted and documented. Sleep/wake behaves like a forward jump, and `AbortSignal.timeout` deadlines fail the running import cleanly.

### 5. Failure modes and limits
| condition | code / status | plain message | ERR- id |
|---|---|---|---|
| bad cursor | `INVALID_CURSOR` / 400 (refusal) | "This list of imports changed. Reload it to see the newest imports." | no |
| `limit` not 1..50 | clamped | — | — |
| same key, different source | `REQUEST_CONFLICT` / 400 (existing) | "requestId already belongs to another source." | no |
| SQLITE_BUSY after 5 s | `IMPORT_HISTORY_BUSY` / 503 | "Import history is busy. Try again in a moment." | yes |
| SQLITE_FULL / ENOSPC | `INSUFFICIENT_STORAGE` / 507 | "There is not enough free disk space to record the import. Free up space and try again." | yes |
| SQLITE_CORRUPT / NOTADB / quick_check failure | `IMPORT_HISTORY_DAMAGED` / 503 | "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID." | yes |
| `user_version > 1` | `IMPORT_HISTORY_NEWER` / 503 | "Import history was written by a newer version of the app. Update the app to continue." | yes |

- The non-refusal codes are a new class `ImportHistoryUnavailable {code, status}`, which is not a `SiteShareRefusal`. In `importFailure` (:42) it goes to `sendAdminFailure` (`W/server/inbound/shared/admin-failure.ts:123`) with `status`, which mints an ERR- id.
- In the tool path it is rethrown, so it goes through the P4 reporter.
- A failed transaction rolls back fully (better-sqlite3), so a full disk during `ready` leaves `creating` plus the allocation, which recovery reconciles.

### 6. Invariants
- **I6** Terminal history is visible iff `now < settled_ms + 30d`. Test (existing case 2) plus a new `history boundary: listed at 30d − 1 ms, hidden at exactly 30d`. Red mutation: `<=` (an inclusive comparison).
- **I7** Replaying never extends retention. Case 2 (replay at day 29, gone at 30 d + 1). Red mutation: drop `COALESCE` (set `settled_ms = now` on every put), or write on replay.
- **I8** The fence lives until `accepted_ms + 365d`, exclusive. Tests (plan) `day 365 + 1 ms frees the key` and `fence still conflicts at 365d − 1 ms`. Red mutation: `<=` in the fence predicate.
- **I9** A replay after history expiry returns the stored outcome. Test (plan) `replay at day 200 returns the stored outcome but the row is not listed`. Red mutation: bypass the replay lookup (it then creates a new import).
- **I10** A conflict is refused before any upload consumption, download or verify. Test: `REQUEST_CONFLICT leaves the upload unconsumed and makes no HTTP call`. Red mutation: move `consumeUpload` before the fence check.
- **I11** Admission is atomic: the fence and row are both written or both absent. Test: `admission insert failure leaves no fence` (a fake db throws on the imports insert). Red mutation: two separate transactions.
- **I12** Paging has no duplicates, skips or other principals' rows under tied timestamps. Test (plan) `tied timestamps page with no duplicates, skips or cross-principal rows` (120 rows, 3 principals, 7 shared `created_ms` values, page size 50). Red mutation: drop the `import_id` tie-breaker.
- **I13** An invalid cursor is refused and never treated as the first page. Test: `invalid cursor (bad base64, v2, unsafe int, non-uuid) → INVALID_CURSOR`. Red mutation: catch-and-null in `decodeCursor`.
- **I14** Workspaces are isolated. Test: `two workspaces under one appData never see each other's rows or fences`. Red mutation: a shared DB path without the workspaceId.
- **I15** List, retry and expiry never enumerate the history root after cutover. Test (plan case 4 part 2) `list, retry and expiry work with history-dir enumeration failing`. Red mutation: keep `registry.expire({})` (root enumeration) in `list`.
- **I16** Recovery reads only active rows through the index. Test: `recovery issues one indexed active-row query` (spy on the statements; 1,000 settled rows are not read). Red mutation: `SELECT ... FROM imports` without the status filter.
- **I17** `needs-owner` expires at `expires_ms < now` and keeps a named failure. Test: `needs-owner past deadline fails with "Owner setup expired" and its stage is removed`. Red mutation: `<=`, or no stage rm.

### 7. Wiring
Jini files in `J/devops/src/backup/site/import-index/`, each one job, functions ≤80 lines and complexity ≤10:

| file | functions (one-line job) |
|---|---|
| `schema.ts` | `IMPORT_INDEX_V1_DDL`; `migrateImportIndex({db})` runs the v1 DDL when `user_version=0`, refuses `>1` |
| `open.ts` | `openImportIndex({file,open,clock},{mustExist})` opens, applies pragmas, migrates, quick_checks; `applyPragmas({db})` |
| `rows.ts` | `assertTransition(prev,next)`; `toRowParams(row,now)`; `minimalOutcome(row)`; `isTerminal(status)` |
| `store.ts` | `createImportIndexStore({db,clock})` binds the statements; `put`, `get`, `activeRows`, `dueOwnerSetups` |
| `paging.ts` | `encodeCursor`, `decodeCursor`, `listPage({store,principalId,cursor,limit})`, `listAll` |
| `admission.ts` | `lookupFence`, `sameFence`, `admitImport({store,clock,...})` (fence, then conflict, then atomic insert) |
| `sweep.ts` | `sweepExpired({db,clock})` (batched deletes, clock-backwards guard) |
| `errors.ts` | `ImportHistoryUnavailable`; `mapSqliteError(error) → ImportHistoryUnavailable` (BUSY/FULL/CORRUPT/NOTADB) |

- Ports:
  - `SqliteSyncOpener` and `SqliteDb` from `@jini-ai/core/contracts/storage` (a borrowed handle, as in `daemon/store/event-log/sqlite.ts:25,53`).
  - `Clock` from `@jini-ai/core/primitives`.
  - `FileLockPort` from `@jini-ai/core/contracts/runtime`.
  - The feature-owned `ImportPayloadFs` and `ImportIndexMessages?` (neutral English defaults; Tovu may override copy).
- Tovu binding at `W/server/runtime/composition/site-import-backend.ts:39`:
  - `directory: join(appData, "site-imports", workspaceId)`
  - `open: (file, o) => new Database(file, o)` (Tovu's better-sqlite3)
  - `clock: { nowMs: () => Date.now() }`
  - `lock` (platform `withFileLock` adapter)
  - `fs: nodePayloadFs`
  - `cutoverPolicy: "enable"` (T4)
  - The handle closes on the host's close registration, as at `database-journal.ts:32`.
- Backend: add `listPage(required: {principalId; cursor?: string; limit?: number}) → Promise<{imports: SiteImportView[]; nextCursor?: string}>` to `SiteImportBackend` and keep `list` (:26).
- Route: Jini exports `siteImportListRouteSpec = defineJsonRoute({ method: "GET", path, parse: parseListQuery /* {cursor?: string} only; unknown query keys refused */, handle })`, with `Deps = { listPage; principalOf }`. Tovu mounts it at `:175`'s root with its existing `gate(..., "system.read")` and `importFailure`. The mount mechanics depend on `ex5-fnd-routes` and are UNVERIFIED. The response is `{ imports, nextCursor? }`, a superset of today's `{imports}`.
- OpenAPI: a new entry for `GET /api/admin/v1/workspaces/{workspaceId}/site-imports` with query `cursor` (string, ≤96) and response `nextCursor` (string, optional), plus 400 `INVALID_CURSOR`.
- Tool `site_import_list` (:91–92): `properties: { cursor: { type: "string", maxLength: 96, description: "nextCursor from the previous page." } }`, `additionalProperties: false`. In the handler (:242), refuse any key other than `cursor` and call `listPage`. Re-record the catalog golden bytes.
- Admin:
  - The port `listImports(input?: {cursor?: string}) → {imports, nextCursor?}` (:85/:155) appends `?cursor=`.
  - `use-site-import-state.hooks.ts` keeps `pages[]` and `nextCursor` and exposes `loadMore()`. `refresh()` resets to page 1 and dedupes by `importId`.
  - `SiteImportTab`'s `ImportList` (:325) renders a "Show more imports" button when `nextCursor` is set. The hook arrives as a prop (`useImport`, :46).
  - i18n: add "Show more imports" and the INVALID_CURSOR copy to all locales.
- Must not import: `better-sqlite3`, `express`, `node:fs` in `import-index/*`, `#src/*`, `@tovu/*`. No barrel that re-exports `import-index/*`; each consumer imports the owning file.
- P10-O1 owns the outer import span. `admitImport` adds none.

### 8. Owner questions
- `OWNER-Q2:` Should history reads stay under the import lock? **Rec:** no. Make `listPage` and `get` lock-free WAL reads and derive "expired" for an overdue `needs-owner` row in the view. Today a list during a running import is refused BUSY (:69). The locked expiry write still happens on the next admission, owner setup or tidy.
- `OWNER-Q3:` `list` array API: full loop or migrate callers? **Rec:** keep `list` as a loop over `listPage` (bounded by 30 days) for internal callers, and move the HTTP route, the tool and admin to `listPage`.
- `OWNER-Q7:` What is in the replay outcome after 30 days? **Rec:** the minimal outcome above (no warnings or credential warnings). The 1-year record stays "tiny" as the owner decided.
- `OWNER-Q8:` `REQUEST_CONFLICT` status: 400 (today) or 409? **Rec:** keep 400, so there is no API break.
- `OWNER-Q11:` Clock moved backwards: skip the physical sweep? **Rec:** yes (a meta high-water mark). It costs one row and stops a bad clock from deleting early twice.

---

## P5-T3 · Backfill and interruption (case 3)

> **R1123 revision (Codex: NEEDS).**
> - **Validate every allocation field recovery reads.** `validateLegacyRow` gains `validateAllocation(creation)` covering each field `reconcileInterruptedImports` reads (builder pins the list from that function before coding; at minimum `siteId` uuid, `siteDir` contained under the sites root, `slug` `^[a-z0-9-]{1,63}$`, `allocatedAt` finite). Malformed → the row is **preserved verbatim** (file untouched, cutover blocked as today) and recovery never acts on that allocation.
> - **Preserve durable sites committed before the ready write.** Recovery of a `creating` row first checks durable publication (site registry entry present **and** the site's `content.db` carries the same `siteId`) → mark the import `ready` (complete) and keep the site; only an unpublished allocation is rolled back.
> - **Separate failure injection** for the in-DB marker (`meta.backfill_complete`, inside the backfill txn) and the external state file write (after commit): injection points `beforeCommit`, `afterCommitBeforeState`, `stateWriteFails`, each with its own test.
> - Tests: **I32** `crash immediately after site publication with the allocation persisted keeps the site and completes the import` (mutation: treat every `creating` as failed and release the allocation → site removed → red); **I33** `malformed allocation is preserved and never recovered`; I18 split into the three injection points above.

### 1. Data model
- It reuses the T2 tables. `meta.cutover_at` (ms), `meta.db_id` (uuid) and `meta.backfill_count` are written in the **same** transaction as the rows.
- Legacy input: `<ws>/<uuid>.json` (`SiteImportRecord`).
- In memory: `LegacyScan { rows: ValidRow[]; unreadable: string[]; malformed: string[] }`.
- Read batch: files are read in groups of 500. Rows are inserted with one prepared statement inside the single cutover transaction. The marker forces one commit, so there is no per-batch commit.

### 2. Algorithm
`backfillImportIndex({registry, index, clock, log}, {})`. Lock held; it is called by `resolveMode` (T4) when the mode is `legacy` and the policy is `enable`.
1. `scan = scanLegacy(root)`:
   - Enumerate `root` once and keep names matching `^<uuid>\.json$` (`recordIdOf` :50).
   - Read each through durable JSON. `unreadable` goes to `scan.unreadable`. The file is left in place with no aside-move: this preserves the :72–77 refusal semantics.
   - `ok` goes through `validateLegacyRow`. On failure it goes to `scan.malformed`.
2. `validateLegacyRow(v)` requires all of:
   - `importId` matches ID and equals the filename id.
   - `principalId` is a non-empty string.
   - `status` is in the union.
   - `Date.parse(createdAt)` is finite.
   - `expiresAt` is a finite number.
   - `source` is exactly `{url: https string}` or `{uploadId: uuid}`.
   - `requestId` is absent or matches `REQUEST_ID` (:31).
   - `sourceDigest` is absent or 64 hex characters.
   - `status==="creating" && creation` implies `creation.siteId` is a string.
3. If `unreadable.length + malformed.length > 0`: log "An import record could not be read; imports keep using the old store until it is fixed." (plan copy) with the counts but no paths or contents. Return `{state: "blocked"}`. The mode stays `legacy` and NO DB row is committed.
4. `now = clock.nowMs()`. For each row derive:
   - `created_ms = Date.parse(createdAt)`.
   - `settled_ms = terminal ? created_ms : NULL` (the plan: legacy rows have no settlement time).
   - **History row** iff `active` OR `now < created_ms + 30d`. Active rows (`verifying`, `needs-owner`, `creating`) are always kept, with their `creation` allocation and `expiresAt` verbatim.
   - **Fence** iff `requestId` AND `now < created_ms + 365d`, with `fence_kind/value` from:
     - `sourceDigest`: `sha256`/digest.
     - `uploadId` source: `upload`/uploadId.
     - `url` without a digest: `origin`/`new URL(url).origin` (origin-only legacy rows keep a conflict fence).
   - `accepted_ms = created_ms`, `outcome_json = minimalOutcome(stripped row)`.
   - Terminal rows are stored with `withoutQuery` applied, as at :130.
5. Duplicate request keys `(principal_id, request_id)`: the fence goes to the row first in `ORDER BY created_ms DESC, import_id DESC`. This matches legacy `list().find()` over a createdAt-desc sort (:93, :157); the legacy tie order was readdir order, now made deterministic. Older duplicates keep their history rows (if visible) but no fence. Log the duplicate count. This is decided BEFORE the marker is written.
6. `dbId = randomUUID()`. Then, in one `BEGIN IMMEDIATE`:
   - `DELETE FROM imports; DELETE FROM replay;` (a stale earlier attempt).
   - Insert all rows and fences.
   - `INSERT OR REPLACE INTO meta VALUES ('db_id',dbId),('cutover_at',now),('backfill_count',n),('schema','site-imports-v1')`.
   - `COMMIT`.
7. `writeIndexState({mode:"cutover", dbId, cutoverAt: now})` (T4; durable JSON: fsync the file, rename, then a best-effort dir flush).
8. Return `{state: "cutover"}`. `exclusive()` then runs `reconcileInterruptedImports` over `activeRows()`. This is the "recover interrupted rows once after cutover" step. Recovery is idempotent because recovered rows become terminal.

Legacy JSON files are never modified, chmodded or deleted by the backfill. They become the read-only snapshot (T4).

### 3. State machine: cutover mode (shared with T4)
```
legacy ──(enable, lock)──► backfilling ──commit + state write──► cutover ──first indexed write──► indexed ──(cutover_at+30d)──► indexed+retired
   ▲            │ unreadable/malformed                │ DB missing/corrupt/db_id mismatch      │ DB missing/corrupt/mismatch
   │            ▼                                     ▼ (pre-write: safe)                      ▼
   └──────── blocked (stays legacy, retried next open) ◄── back to legacy, re-backfill      refused (fail closed)
```
`backfilling` exists only in memory under the lock. A crash returns it to `legacy` (§4).

### 4. Crash safety
| crash point | DB | index-state | next open |
|---|---|---|---|
| during scan | untouched | legacy | re-scan |
| inside the transaction (any insert) | rolled back by WAL: no rows, no marker | legacy | full re-backfill; exactly one copy (PKs plus `DELETE` first) |
| after COMMIT, before the index-state write | rows plus marker | legacy | the state is `legacy`, so the DB is not trusted and gets a full re-backfill (DELETE+INSERT): exactly one copy of each row and fence |
| after the index-state write, before recovery | complete | cutover | `resolveMode` = cutover; recovery runs inside the next `exclusive()` |
| during recovery | partial terminal updates | cutover→indexed (the first put marks indexed) | the remaining active rows are recovered on the next lock |

A malformed-but-parseable row (for example `status: "done"` or `createdAt: "x"`) blocks the cutover exactly like an unreadable one.

### 5. Failure modes
- Blocked: a log only, never user-facing. The admin list keeps working from legacy and keeps today's `REGISTRY_UNREADABLE` refusal on list (:91).
- SQLITE_FULL during the backfill: the transaction is rolled back, the mode stays `legacy`, and `INSUFFICIENT_STORAGE` is logged. Import admission continues in legacy mode. The backfill must not take imports down.
- Large legacy sets: the memory needed is the rows (each under ~2 KB). Even 50,000 rows means ~100 MB, so warn in the log when there are more than 20,000.

### 6. Invariants
- **I18** The marker is visible only together with every backfilled row. Tests: `backfill crash before commit leaves no marker and no rows` and (plan) `interrupt the backfill and restart → exactly one copy of each row and fence` (crash injected at three points). Red mutation: commit the marker in its own earlier transaction.
- **I19** An origin-only legacy key still fences a different source. Test (plan) `origin-only key still fences a different source` (a different origin gets `REQUEST_CONFLICT`, the same origin replays). Red mutation: skip the fence when `sourceDigest` is absent.
- **I20** An unreadable or malformed row blocks the cutover and keeps its file. Tests: (plan) `unreadable row blocks cutover and keeps its file` and `malformed-but-parseable row blocks cutover`. Red mutation: skip invalid rows and cut over.
- **I21** Active rows keep their allocation and stage. Tests: (plan) `active verifying/creating recovery keeps its allocation` and `needs-owner row and its stage survive backfill; owner setup completes after cutover`. Red mutation: apply the 30-day filter to active rows, or drop `creation`.
- **I22** A duplicate request key fences to the newest row. Test: `two legacy rows with one requestId: newest fences, both histories listed`. Red mutation: ascending order in the duplicate rule.

### 7. Wiring
- `J/devops/src/backup/site/import-index/backfill.ts`:
  - `scanLegacy({root, fs, readJson})`: enumerate and classify.
  - `validateLegacyRow(value, id)`: shape check (split into `validSource`, `validTimes`, `validIds` to stay under complexity 10).
  - `deriveBackfillRows({rows, now})`: history and fence rows.
  - `pickFenceOwners(rows)`: the duplicate rule.
  - `commitBackfill({db, rows, fences, dbId, now})`: the single transaction.
  - `backfillImportIndex(...)`: orchestration.
- `readJson` is the injected durable-JSON reader. Tovu passes `createDurableJsonFile` plus `createNodeDurableJsonPorts`, the existing owner.
- No Tovu imports.

### 8. Owner questions
- `OWNER-Q9:` Should a blocked cutover offer a repair? **Rec:** out of P5. A later admin action "Set aside unreadable import record" would move it to `<ws>/unreadable/` behind an **approval card**, because it is destructive to visible history. Until then the store stays legacy and the owner sees a log line.

---

## P5-T4 · Rollback, fail-closed and case 5

> **R1123 revision (Codex: NEEDS) — supersedes "Absent means `legacy`" and the lock-free repair writes below.**
> - **Independent evidence of indexed authority.** The DB's `meta` table gains `authority` (`'backfill' | 'indexed'`) and `generation` (integer). `markIndexedWrite`'s first indexed write txn sets `authority='indexed'` and `generation = state.generation` **in the same txn as the row**; the external state file (`mode`, `generation`, `db_id`) is still written durably **before** that txn.
> - **Durable initialization.** The first locked open by a P5 build writes the state file `{ mode: 'legacy', generation: 0 }` durably (temp + fsync + rename + dir fsync) **before** any cutover can start.
> - **Mode resolution (fail closed on inconsistency):**
>
> | state file | DB | result |
> |---|---|---|
> | absent | absent | `legacy` (pre-P5 or fresh) |
> | absent | present, `authority='indexed'` | **refused `IMPORT_HISTORY_STATE_MISSING`** |
> | absent | present, no indexed authority | `legacy` (cutover never wrote) |
> | `indexed` | absent / corrupt / `db_id` mismatch | refused |
> | any | `meta.generation ≠ state.generation` | **refused `IMPORT_HISTORY_GENERATION_MISMATCH`** |
> | unreadable | — | refused `IMPORT_HISTORY_MISSING` |
>
> - **Lock-free reads are pure.** `resolveMode({ access: 'read' })` never renames, migrates, backfills, moves a corrupt file aside or writes rollback/state; it returns a mode or a refusal. All repair runs only under the lock with `access: 'write'`.
> - **Stale handles.** The registry caches `{ handle, dev, ino, dbId }`; every lock acquisition `stat`s the DB path; a changed `dev:ino` → close the old handle, reopen, re-verify `db_id` + generation before use.
> - **Snapshot retirement completes only on a fresh empty enumeration:** each pass removes ≤ 200 `^<uuid>\.json$` files; `legacyRetiredAt` is written only when a **new** `readdir` after the deletions finds zero matches.
> - Tests: **«Missing authority record after indexed write refuses legacy»** (delete the state file after one indexed write → refused; mutation: absent ⇒ legacy → red); **«Read racing pre-write rollback performs no writes»** (fs spy on the read path during a held-lock rollback: 0 write/rename/unlink; mutation: read path moves a corrupt DB aside → red); **«201 records retire across two passes»** (first pass not marked, second marked; mutation: mark after the first pass → red); `generation mismatch refuses`; `replaced DB file is reopened and re-verified`.

### 1. Data model
- `<ws>/import-index.state.json`, written as durable JSON at 0600. It sits **outside the DB**. Its name does not match `^<uuid>\.json$`, so neither legacy nor old builds treat it as a record.
```json
{ "schema": "site-import-index-state/1", "mode": "legacy" | "cutover" | "indexed",
  "dbId": "<uuid>|null", "cutoverAt": 0, "firstIndexedWriteAt": 0, "legacyRetiredAt": 0 }
```
  Absent means `legacy`. Unreadable means `refused`: fail closed, because it might have said `indexed`.
- Host option `cutoverPolicy: "enable" | "rollback"` (OQ10). It governs only legacy→cutover (backfill) and the pre-write cutover→legacy step. It never affects `indexed`.
- In memory: `mode` resolved once per lock acquisition, plus `markedIndexed: boolean`.
- Owners: state logic is Jini `import-index/mode.ts`. The policy value and copy are Tovu.

### 2. Algorithm
`resolveMode()` runs under the lock at the start of `exclusive()`, after `ensurePayloadNamespace`. Lock-free `get`/`listPage` call it read-only and never backfill:
1. `s = readIndexState()`. If unreadable, return `refused("IMPORT_HISTORY_MISSING")`.
2. `s.mode === "legacy"`: if the policy is `enable`, `backfillImportIndex` gives `cutover` or `blocked` (blocked means legacy). If the policy is `rollback`, return `legacy`.
3. `s.mode === "cutover"`, the pre-write window:
   - `db = tryOpen(mustExist)`. Missing, corrupt, a `db_id` other than `s.dbId`, or no `cutover_at` means the JSON is still authoritative. Move any corrupt file aside to `site-imports.db.corrupt-<ms>`, write the state `{mode:"legacy"}`, then apply step 2.
   - If the policy is `rollback`: write the state `{mode:"legacy"}` (the DB is now untrusted) and return `legacy`. A permitted pre-write rollback.
   - Otherwise return `cutover`.
4. `s.mode === "indexed"`:
   - Open with `fileMustExist: true`, so a missing DB is never silently recreated.
   - If the file is missing, corrupt, `user_version > 1`, `db_id !== s.dbId`, or `cutover_at` is absent, return `refused`.
   - Otherwise return `indexed`, ignoring the policy (an index-aware rollback build must include this reader).

`markIndexedWrite()`, called before every SQL write (put, admit, expireOwnerSetups, recovery):
- If the mode is `cutover` and `!markedIndexed`: `writeIndexState({...s, mode:"indexed", firstIndexedWriteAt: now})`. That write is durable (fsync, rename, dir flush) and happens **BEFORE** the SQL transaction. Then `markedIndexed = true`.
- `sweep()` deletes nothing in `cutover` mode (rows and JSON are still equal), so it does not mark.

Legacy writes in `legacy` mode keep today's JSON path. Before the FIRST legacy JSON write in a process, assert that the state is not `cutover`/`indexed`. Writing JSON while the state is `cutover` would desynchronize a later cutover, and `resolveMode` already moved the state to `legacy` first, so this is a guard only.

`retireLegacySnapshot()` (lock held, from `tidy`; P11 schedules):
1. Run only if the mode is `indexed`, `now >= s.cutoverAt + 2_592_000_000` and `!s.legacyRetiredAt`.
2. Enumerate `root`, then `rm` each `^<uuid>\.json$`, 200 per pass.
3. Then write the state `legacyRetiredAt = now`.

A crash mid-way resumes on the next tidy. This is automatic retention policy (owner decision), not a user-initiated delete, so there is no approval card.

`refused` behaviour: every backend method (`importBackup`, `completeOwner`, `upload`, `list`, `listPage`, `get`, `tidy`) throws `ImportHistoryUnavailable("IMPORT_HISTORY_MISSING", 503)` with "Import history is missing, so imports are paused to avoid creating the same site twice. Nothing was changed. Contact support with this error ID." It never reads JSON.

### 3. State machine
- See T3 §3.
- Additional edges: `cutover --policy rollback--> legacy` (pre-write only).
- `indexed --policy rollback--> indexed` (logged: "Rollback is not possible after the first indexed import write; the index-aware store stays in use.").
- `any --state file unreadable--> refused`.
- `refused` is terminal for the process. It is left only by an operator restoring the DB or the state; no automatic exit.
- `frozen` (old builds) is NOT built (OQ5).

### 4. Crash safety
| crash between | effect | safe because |
|---|---|---|
| index-state `indexed` write and the SQL write | state indexed, DB equal to JSON | only closes the fallback (conservative) |
| SQL commit and the next state write | n/a (the state is written first) | — |
| pre-write rollback state write and the next JSON write | state legacy, DB stale | the next enable re-backfills from scratch (DELETE+INSERT) |
| retirement deletes, before `legacyRetiredAt` | some JSON gone | indexed mode never reads JSON; resumed |

- Two processes: one resolves the mode under the lock and the others re-read the state per lock acquisition, so a process never acts on a stale mode across a lock boundary.
- Limit: a deleted `-wal` file or a restored older DB copy with the same `db_id` can silently lose recent fences. This is not detected. Restore-from-backup (Q2) is out of scope; recorded as a known limit.
- Pre-P5 binary after cutover (OQ5):
  - It ignores the state and DB files and reads only the JSON snapshot, so post-cutover imports are unfenced for it.
  - It cannot find T1 payloads, so its pending uploads and stages fail "not found / rolled back", which fails closed.
  - After retirement it sees no history at all.

### 5. Failure modes
- `IMPORT_HISTORY_MISSING` (503, ERR-): a missing DB or state after an indexed write, or an unreadable state file.
- `IMPORT_HISTORY_DAMAGED` (503, ERR-): a corrupt DB in indexed mode. The file is left untouched.
- `IMPORT_HISTORY_NEWER` (503, ERR-): `user_version > 1`.
- A failed state write (ENOSPC/EACCES) before the first indexed write aborts that write with `INSUFFICIENT_STORAGE` or `IMPORT_PAYLOADS_UNMOVABLE`, with nothing written to SQL.

### 6. Invariants
- **I23** After an indexed write, a missing DB fails closed and never reopens JSON. Test (Codex) `missing DB after an indexed write fails closed`. Red mutation: allow writes through the stale legacy registry after cutover (the plan mutation), or open without `fileMustExist`.
- **I24** The indexed-write record exists before the first SQL write. Test: `index-state says indexed before the first post-cutover row is committed` (a fake db asserts the state file on its first `run`). Red mutation: write the state after commit.
- **I25** A pre-write rollback reads the legacy snapshot and still completes owner setup. Tests: (plan) `pre-write rollback reads the legacy snapshot` and (Codex) `permitted pre-write rollback can still complete owner setup` (`needs-owner` row, stage in `payloads/`). Red mutation: refuse in `cutover` mode on a missing DB.
- **I26** A supported restart replays the original result. Test (plan) `post-cutover replay after restart returns the stored site, not a second one` (`h.started.length` unchanged). Red mutation: bypass the fence lookup after a restart (empty `replay` read).
- **I27** A swapped DB (other `db_id`) in indexed mode is refused. Test: `DB from another workspace is refused`. Red mutation: skip the `db_id` comparison.
- **I28** The legacy snapshot is retired only at `cutoverAt + 30d` and only in indexed mode. Test: `snapshot retained at 30d − 1 ms, removed at 30d, never in cutover mode`. Red mutation: `>` (instead of `>=`), or retire in cutover.

### 7. Wiring
- `J/devops/src/backup/site/import-index/mode.ts`:
  - `readIndexState({file, readJson})`
  - `writeIndexState({file, writeJson, state})`
  - `resolveMode({state, db, policy, backfill})`, with the per-mode branches `resolveLegacy`, `resolveCutover` and `resolveIndexed` to stay under complexity 10
  - `markIndexedWrite(...)`
  - `retireLegacySnapshot(...)`
- Tovu passes `cutoverPolicy`, the durable JSON reader and writer (`createDurableJsonFile`) and the copy.
- Must not import: the same list as T2.
- Wiring docs (ADR-071): add a **Wiring** section to the site-backup feature README covering storage (opener, `<ws>`, lock), recovery (activeRows), admission (fence, then conflict, then consume) and pagination (cursor, route spec, tool), plus a host binding example and the prohibited imports.

### 8. Owner questions
- `OWNER-Q5:` Old-build downgrade? **Rec:** (a) accept with a release note, as the owner said "the desktop app just updates". A freeze cannot be enforced on a binary that predates it, and T1 already makes old builds fail closed on pending payloads. Cutover must not be enabled until the owner confirms (Codex T4).
- `OWNER-Q6:` Legacy snapshot retirement point? **Rec:** `cutoverAt + 30 days`, in indexed mode, run from `tidy`, with P11 deciding when `tidy` runs. By then every legacy terminal row is outside visible history, and its fence already lives in SQLite.
- `OWNER-Q10:` Default `cutoverPolicy`? **Rec:** `"enable"` once OQ5 is answered. Ship T4 with `"rollback"` as the default until then, so T1–T3 can land with no cutover in the field.

## R1123 · OWNER-Q (P5, consolidated; Codex recommendations adopted)
Q1 land the K5 registry/backend moves first · Q2 lock-free **read-only** snapshots once mode selection is safe (T4 R1123) · Q3 keep the internal array API during migration, external reads paged · Q4 upload metadata stays JSON with the T2 preflight and T1 recovery rules · **Q5** old binaries cannot be blocked by new code → keep the version-compatible layout (T1 R1123 rule 4) and keep cutover disabled until no supported old binary remains · Q6 retire after 30 days with resumable batching · Q7 minimal replay outcome · Q8 HTTP 400 · Q9 defer repair; an approval card if added · Q10 default `rollback` until the downgrade and authority gates pass · Q11 skip destructive sweeps on clock regression; clamp forward jumps to evidence + 30 days (T2 R1123).
