STORAGE PLAN v2 COMPLETE

# P11 v2 · Storage budget: keep Tovu's disk use bounded for agencies with many sites

**Base (every file:line below re-verified on these refs):** Tovu `origin/integ/merge-13-2026-11-22` @ `f7185f153`, Jini `origin/integ/merge-14-2026-11-22` @ `4902a6a1`. Planning only. No code was changed, and no tests, builds or type-checks were run.
**Inputs:** v1 `plans/P11-storage-budget.md` (Opus), the independent check `plans/P11-storage-check.md` (Codex, verdict NEEDS), and the owner's 11-22 corrections (a)–(d). This is the one allowed revision.
`W/` = Tovu `apps/website/src/`, `D/` = Tovu `apps/desktop/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`.
**Owner ask (11-22):** keep Tovu's size under control, because website builders create many sites. **Measured on the owner's Mac:** desktop partitions 7.4 GB (55 partitions, the largest 1.6 GB = Cache 1.2 GB + Code Cache 402 MB), site folders 9.1 GB (29 sites), `~/Documents/Tovu-backups` 1.1 GB. Total ≈ 17.6 GB.
**Owner rules on every step:** inject everything; hooks as props; `(required, _optional = {})` pads and the args rule; 50-line warning, 80-line limit, complexity ≤ 10; plain error words that tell apart *busy*, *expired* and *protected*; no vendor code in core; Jini stays server- and vendor-neutral; schema changes only through ADR-066 TS migrations; tests first, each with a named mutation that proves *that slice's* guard; one implementer per slice, ≤ 2 h, one repo.

## The four rules this version is built on (owner, 11-22)

| Rule | What it means in this plan |
|---|---|
| **(a) Logins are never erased for a live site or another site** | A desktop partition is removed whole only with **positive proof** that this app erased its site. That proof is a retirement record written by the erase arm of Delete. The partition is also checked again at the next start, under a profile-wide interlock, with no other live instance and no tracked site claiming it. Partitions without that proof only have their **cache folders** cleared. Their login data is listed and removed **only by the owner**. Removing a site from the list (untrack) never touches its partition. |
| **(b) `VACUUM` never runs inside a migration** | No migration sets `auto_vacuum`. Converting a file is a separate maintenance operation. It runs only on a **stopped** site, while holding that site's running lease, at an idle moment, **outside any transaction**. It first writes a WAL-consistent recovery copy (`VACUUM INTO`), then reuses the existing `compactAndVerify` safeguards and records completion only after verification. The daily work after that is bounded `incremental_vacuum` that backs off when the database is busy. |
| **(c) Live share links never break** | Automatic share cleanup touches only (1) shares the owner **revoked** whose ZIP delete failed, where it retries that delete, and (2) shares that carry their **own stated expiry**, a new opt-in field that defaults to *never*. v1's "ZIP-only after 14 days" rule is withdrawn. |
| **(d) No automatic deletion of owner chat history** | Chats are deleted only by explicit owner action: delete one (exists), select several, or "Delete chats older than X" with a preview and a confirm step. Automatic work may only trim data that is **demonstrably derived and re-creatable**, and then only after a proof step. Tool receipts in `events_json` are not derived and are never trimmed. v1's 180-day idle delete, its 30-day tool-detail trim and its size-cap trim are all withdrawn. |

## Changes from v1 (each check item → its fix)

| Check item | v1 said | v2 fix | Where in v2 |
|---|---|---|---|
| **1 · ST-1..3 preserve desktop logins** (+ owner (a)) | Remove every `tovu-site-*` folder no tracked row claims. Call `clearStorageData()` in **both** delete arms. Skip the sweep if presence shows another instance. | A missing tracked row is no longer treated as proof. A new **profile interlock** (Jini's token-owned file lock, `J/platform/src/fs/durable-json.ts:95`, already used by `D/durable-json-file.ts:42`) is shared by startup, session acquisition (`session.fromPartition`, `D/main/index.ts:432,575-577,599,624`) and cleanup. It is checked against live and starting sessions. Whole-partition removal needs a **retirement record** written only by the erase arm (`D/project-ipc.delete.ts:142`). The untrack arm never touches the partition. **There is no `clearStorageData()` anywhere.** The partitions root comes from `app.getPath("sessionData")` and is realpath-contained; symlinks and reparse points are skipped. An unreadable presence directory counts as "unknown", so the sweep skips. That matters because the reader returns `[]` on error (`J/desktop-host/src/electron/updates/instance-presence.ts:69-73`). Ambiguous partitions get cache-folder cleanup only. Tests added: sibling start during a sweep, add/open during discovery, untrack + re-add keeps login, second profile. | §2d, ST-2a/2b/2c |
| **2 · ST-1/3 verify the Electron limit; safe retries** | Asserted the `disk-cache-size` switch, with a one-time marker in preferences. | New **ST-1a**, a packaged-Electron measurement. It tests two persistent site sessions over repeated writes, reports the cap's real scope, and proves that cookies survive `clearCache()` and `clearCodeCaches()`. ST-1 waits on ST-1a and Q7. The marker is **profile-scoped** and **per partition**, and failed or busy partitions are retried at the next start. The code-cache check on site open is now described as *periodic enforcement*, not a bound. IndexedDB and Service Worker storage are measured and reported, not capped. The savings table no longer infers orphan counts from partition counts. | §2d, ST-1a/1/3, §8 |
| **3 · ST-4..6, ST-16: who removes files, and when** | Runner in `platform`. A `tovu-*` temp sweep. Pre-migration copies cut to 2. The CLI "takes the site lock". | Runner stays in `J/platform`, with fs, clock, scheduler, error reporting and policies injected through the two-object convention. **Tovu binds the database-copy policy** (`platform` and `db` are peers). Dry run goes **only** through `measure()`. Boot, timer and manual passes are serialized. The `tovu-*` sweep is replaced by **exact writer-owned roots** plus cross-process liveness, and it reuses `tidyImportDatabases` (`W/cli/commands/serve.ts:191-192`). Pre-migration copies **keep the 5-copy default until Q5**. Pruning is serialized with backup publication and recovery readers, and anchored on a verified successful copy. Protected restore points keep their rotation. Serving activation is gated on Q1, and the worker drains before storage closes. The CLI acquires **the same running lease as `serve`** (`claimSiteRunning`, `W/platform/site-dir/site-running.ts:19`) before it opens any writable handle. The report path never runs a normal boot. | §2a/2b, ST-4 (READY), ST-5 (READY), ST-6a/6b/6c, ST-16 |
| **4 · ST-5/7: split SQLite conversion from compaction** (+ owner (b)) | Migrations `chat/0004` and content `0042` set the pragma and ran `VACUUM`. | Covered under rule (b) above. Conversion is not a migration, because the runner runs `step.up` inside `kernel.transaction` (`J/db/src/migrate/runner.ts:242-248`). It is a stopped-site maintenance op that reuses `sqliteOps.compactAndVerify` (`J/db/src/kernel/sqlite/ops.ts:25-46`: VACUUM, WAL checkpoint TRUNCATE, integrity_check, refused inside a transaction). It runs under the running lease, after a preflight (free space ≥ 2 × (main + WAL) + 64 MB) and a WAL-consistent recovery copy (`copyTo` = `VACUUM INTO`). Completion is recorded only after `PRAGMA auto_vacuum` reads 2 and the integrity check passes. If preflight fails, conversion is deferred and boot is unaffected. Daily compaction is bounded `incremental_vacuum` that backs off on busy or locked. It reports main-file and WAL sizes and states that a long reader can delay reclamation. **Migration IDs are fixed:** content `0042` is taken (`W/platform/db/migrations/index.ts:122`), so the media journal becomes content **`0043`**. Chat **`0004`** is used once, for pinning. | §2c, ST-7a/7b/7c, ST-9, ST-11b |
| **5 · ST-8..10, ST-13: content boundary at mutation time** (+ owner (d)) | Automatic 180-day idle delete, 30-day `events_json` trim and a 200 MB trim cap. Revisions thinned automatically. Captures removed after 30 days. | Covered under rule (d) above. Whole-chat deletion only by explicit, scoped, confirmed owner action. Preview and apply cover the same owner, and eligibility (pin, scope, activity) is **rechecked atomically after confirm** against daemon writers. Bulk delete reuses `cancelUnfinishedRuns` and finalization (`W/server/runtime/composition/modules/assistant-chats.ts:207-214`). Open, queued, running and recoverable conversations are excluded. Pinned chats, their attachments and their event payloads are kept. The only automatic trim candidate is `attempt_base_json` on **terminal, past-recovery** attempts, a second copy of the projection (`J/chat/src/store/runtime/durable-run-store.ts:421-431`). It ships only if ST-8c proves no reader needs it after the terminal state, and it bumps the message version. **Revisions become manual only** (ST-13), with explicit page/post scope and protection for publish, restore and undo references. **Screenshots become manual only** (owner artifacts, `W/features/web-screenshot/capture-files.ts:5-15`). Tests added: pin after preview, run start during cleanup. | §3, ST-8a/8b/8c, ST-9, ST-10, ST-13 |
| **6 · ST-11: finish the durable media protocol first** | Add a `blob_gc_journal` table and adapter, then schedule unlink. | **ST-11a (Jini) comes first.** It adds storage-key ownership shared by every writer, replacing the in-process `withSha256Lock` (`J/cms/src/media/blob-gc.ts:17,53`). It adds durable claims, retryable unlink, and protection for originals and renditions referenced by live or trashed media, pending transfers and retained recovery artifacts. The stubbed snapshot conjunct (`blob-gc.ts:59-80`) must become real or fail closed. It reuses `cleanupJournal` (`J/cms/src/media/media-service.ts:862,888-890`) to capture exact rendition keys before their rows go. Legacy orphan bytes are report-only. Tests added: crash recovery, cross-process same-hash re-upload, and a rendition that shares bytes. | ST-11a/11b |
| **7 · ST-12: identify ZIP-only exports affirmatively** (+ owner (c)) | Treat a missing URL or provider as "ZIP-only" and delete after 14 days. | Withdrawn. `receiveSiteShareArtifact` writes `url: null` and may omit `storage` (`W/features/site-backup/share-service.ts:23-32`), and the public route serves exactly those rows (`W/server/inbound/public-http/routes/site-share.ts:10-24`). Covered under rule (c) above. Expiry runs only under a per-share lock coordinated with create, delivery, acknowledgement, revoke and download. The row flips first, so new downloads get 404 before the file goes. Interrupted expiry can be retried. Token reservations and revocation tombstones are kept. Test added: a peer-uploaded active link with neither URL nor storage is never touched. | §2f, ST-12a/12b |
| **8 · Boundaries, dependencies, slice size** | Routes written straight into Tovu. Rename mixed with pin. Large slices. | Pin, bulk-delete and storage HTTP specs go in the owning Jini domains through server-neutral `defineJsonRoute` (`J/core/src/contracts/server/json-route.ts:132`) with small per-route deps, and Tovu mounts and injects them. Pin is a **compatible extension of the existing `PATCH /api/assistant/chats/:id`** (`assistant-chats.ts:329`), with body `{ title? , pinned? }`, so rename is unchanged. Screens use the host-injected `@jini-ai/admin` kit and hook props, in the style of `defaultConversationListHooks` (`J/chat/src/react/components/ConversationList.tsx:117`). Product copy goes on existing args objects. `_optional = {}` pads are retained, why-comments move verbatim, classes use the `jini-*` prefix, and shared contracts live in core. Each consuming Tovu slice lists a **Jini release** dependency. Migration conversion, chat persistence vs. UI, and measurement vs. routes vs. agent approvals are now separate slices. Each slice has its own ≤ 2 h estimate, tests-first cases and a mutation that targets *its* guard: the real pin, live-session, live-link and busy-reader protections. | §7 |
| **Inventory corrections** | Old `D/project-ipc.ts` lines. Attachments "emptied at start". Assorted line drift. | References now point to `D/project-ipc.delete.ts` / `project-ipc.types.ts`. Capture `clearCache` is at `D/desktop-capture.ts:56-57`. Preview sweep wiring is at `D/main/index.ts:979-988`. Crash reporter is at `D/product-telemetry.ts:21-27`. Chat append is at `assistant-chats.ts:302`, delete at `:216-226`, mounts at `:329-330`. Guest expiry is at `W/assistant/persistence/tenant-scope.ts:34`, wired at `W/server/runtime/composition/site-deps/open-store.ts:138`. **Attachments:** Tovu enables restart adoption and keeps TTL plus per-run cleanup, and it does **not** empty authenticated uploads on restart (`W/server/inbound/assistant/agent-daemon-scope-attachments.ts:146-150`). Trash is wired at `serving-app.ts:89-91`. Logs are about two 5 MB files per stream, and a single oversized line can exceed that (`W/platform/server-logs/log-file.ts:20,72,144`). Import staging already has upload expiry and orphan cleanup, but terminal import records are retained indefinitely (P5 owns that). | §1 |
| **Missed writers** | Not listed. | Added to the inventory: `attempt_base_json`, `attachments_json`, native Codex sessions, Jini `events.db`/`journal.db`, the desktop JSON conversation writer, `out/export` and `--out`, source-control export dirs, `tovu-snapshot-*`, share metadata, tokens and tombstones, publish bundle rows, staged blobs and history, renditions and old transform versions, theme-migration staging trees, plugin quarantine trees, and WAL/SHM. Each row is marked automatic, manual or report-only. Savings are counted only where a safe removal path exists. | §1 rows 27-40 |
| **NOT-CHECKED (from the check)** | — | Carried forward as open items: the relocation-backup writer, P5 history windows, provider-wide native log retention, source-control export leftovers, real Electron/Crashpad behaviour, and disk savings. `~/Documents/Tovu-backups` stays **manual only**. | §9 |
| **READY slices ST-4, ST-5, ST-14** | — | **Unchanged** from the check's "Ready to build now" definitions. | §7 |

## 1 · Inventory (v2)

**Auto?** **A** = automatic, limited to cache, derived data, or an old copy with a proven safe path. **M** = manual only, by explicit owner action. **R** = report-only (measured and shown, never removed by Tovu). **E** = existing rule, unchanged.

| # | Item | Where (file:line) | Current limit | v2 proposal | Auto? |
|---|---|---|---|---|---|
| 1 | Desktop per-site HTTP cache `Partitions/tovu-site-*/Cache` | partition name `D/desktop-auth.ts:148-150`; sessions `D/main/index.ts:428-432,575-577,599,624` | none (no `disk-cache-size`; only the capture session clears, `D/desktop-capture.ts:56-57`) | capped by switch **after** ST-1a proves scope (Q7); one-time per-partition clear with retry | A |
| 2 | Desktop V8 `Code Cache` | same sessions | none | cleared on an update launch (`desktopLaunchMode`, `D/main/updates/product-telemetry-boot.ts:41-42`); at site open, cleared if > 64 MB (periodic enforcement, not a bound) | A |
| 3 | Partition of a site **erased** by this app | erase arm `D/project-ipc.delete.ts:111-150` | none | retirement record written after the erase succeeds; whole folder removed at the next start under the interlock (§2d) | A (positive proof only) |
| 4 | Partition of a site **untracked** (row removed, files kept) | same, non-erase arm | none | **untouched** (re-adding keeps the login) | — |
| 5 | Unclaimed partitions with no retirement proof (moved, renamed, other-profile or old sites) | path-hashed name | none | cache folders (`Cache`, `Code Cache`) cleared under the interlock; login data **listed** in the desktop Storage sheet for the owner to remove | A (cache) / M (rest) |
| 6 | Partition IndexedDB / Service Worker / Local Storage | same | none | measured and shown per site; never auto-cleared | R |
| 7 | Site preview PNGs | `D/site-preview-store.ts:183`; boot wiring `D/main/index.ts:979-988` | delete + orphan sweep | unchanged | E |
| 8 | Owner chats (`ai_chats`, messages, `events_json` receipts, run attempts, sessions, approvals) | append `W/server/runtime/composition/modules/assistant-chats.ts:302`; `expires_at NULL` = kept (`J/chat/src/store/sqlite/schema.ts:33-35`) | none | **manual only**: pin, multi-select delete, "Delete chats older than X" (§3) | M |
| 9 | `attempt_base_json` on terminal attempts (second copy of the projection) | `J/chat/src/store/runtime/durable-run-store.ts:421-431,141` | none | set to `"[]"` after terminal + recovery deadline, **only if** the ST-8c proof holds; otherwise report-only | A (conditional) |
| 10 | Guest chats | `tenant-scope.ts:34`, `open-store.ts:138` | 2 days | unchanged | E |
| 11 | `chat.db` / `content.db` free pages | no `auto_vacuum` in `W/` | none | stopped-site conversion + idle `incremental_vacuum` (§2c) | A |
| 12 | WAL / SHM files | beside each DB | checkpoint behaviour | measured separately; a TRUNCATE checkpoint only inside the conversion op | R |
| 13 | `pre-migrations-*.db` | `W/platform/db/sqlite/content-db.ts:102-117,133-139`; `J/db/src/sqlite/backup-policy.ts:5,49-65` | newest 5, pruned only after a new copy | **keep 5 until Q5**; daily selection pass anchored on a verified copy (ST-5/6b) | A (old copy) |
| 14 | Restore points | `database-journal-repo.ts` (rotation + protected) | 5 + protected | unchanged | E |
| 15 | Share ZIPs `ops/shares/<shareId>.tovu.zip` | `W/features/site-backup/share-registry.ts:43-57`; revoke deletes at `share-service.ts:107-114` | deleted on revoke | (1) retry the failed ZIP delete of **revoked** rows; (2) expire only shares with an owner-set `expiresAt` (default never) | A (revoked / own expiry only) |
| 16 | `failed`-status share rows | `share-service.ts:88` | none | report-only (a remote copy may still exist) | R |
| 17 | Screenshots `.captures/<date>/` | `W/features/web-screenshot/capture-files.ts:5-15,41-42` | none, on purpose | **manual only**: "Delete screenshots older than X" with preview | M |
| 18 | Content Trash (incl. themes) | `W/features/trash/ports.ts:33`; `serving-app.ts:89-91` | 60 days | unchanged | E |
| 19 | Purged media originals and renditions | `J/cms/src/media/blob-gc.ts` (no schedule, stubbed conjuncts); `W/platform/db/repos/media-repo.ts:31` (no journal adapter) | never removed | after ST-11a's durable protocol: removed after `gc_grace` when no live, trashed, pending or recovery reference exists; legacy orphans report-only | A (the owner already confirmed the purge) |
| 20 | Live media, themes, plugins, `__original-themes__` | `uploads/`, theme and plugin dirs | n/a | never automatic | M |
| 21 | Post / page revisions (`post_revisions`, includes HTML Pages) | `W/features/post/repo.ts:223-234,319`; `W/features/pages/html-document-store.ts:113,479` | none | **manual only**, explicit page/post scope, publish/restore/undo protected (ST-13) | M |
| 22 | Theme v1 rollback copies `<theme>.v1-backup-<ts>` | `W/features/theme/migration/migrate-theme.ts:40,72-76` | none | listed; manual removal (it is the only revert path) | M |
| 23 | Theme-migration staging trees (dry run / failed verification) | `migrate-theme.ts` staging | none | listed; manual | M |
| 24 | Retired agent-plugin quarantine trees | `W/features/agent-plugins/install-upload.ts` (retire step) | best-effort remove | retry the writer's own removal (writer-owned root); else report | A (writer-owned) |
| 25 | Export/import temp roots (`tovu-share-projection-*`, `tovu-archive-media-*`, `tovu-static-copy-*`, `tovu-snapshot-*`, import verification DBs) | writers in `W/features/site-backup/*`; `tidyImportDatabases` at `W/cli/commands/serve.ts:191-192` | normal completion cleans up; crash leftovers stay | exact writer-owned roots + a cross-process liveness marker; reuse `tidyImportDatabases` (ST-6c) | A (crash leftovers only) |
| 26 | Site logs | `W/platform/server-logs/log-file.ts:20,72,144` | ~2 × 5 MB per stream (one huge line can exceed) | unchanged | E |
| 27 | Import uploads / history | `W/features/site-backup/import-registry.ts:33`; terminal records kept | 1 h uploads; history none | **P5 owns this** | E / P5 |
| 28 | Chat attachments (daemon upload dir) | `W/server/inbound/assistant/agent-daemon-scope-attachments.ts:146-150` | TTL + per-run cleanup; restart **adoption** (not emptied) | unchanged | E |
| 29 | `attachments_json` on messages | `J/chat/src/store/sql/store.ts:357-360` | with the chat | goes with explicit chat delete | M |
| 30 | Native Codex rollouts / sessions | `J/daemon/src/agent-executor/codex/home-staging.ts` | provider-owned; supports resume | report-only; **excluded** from cleanup | R |
| 31 | Jini `events.db` / `journal.db` (SQLite server preset) | `J/server/src/kernel-base.ts:166,199` | 2,000 per run; no aggregate bound | conditional: Tovu's checked daemon uses an in-memory log; report-only if present | R |
| 32 | Desktop JSON conversation store | `D/desktop-chat-main.ts`, `D/workspace-conversation-store.ts` | boot wiring owner-paused | conditional; report-only | R |
| 33 | `<site>/out/export` and `--out` / `TOVU_EXPORT_DIR` | `W/cli/commands/export.ts:45` | none | owner-selected output: never automatic; shown | R/M |
| 34 | Source-control export dirs | `W/features/source-control/commit-site.ts` | NOT-CHECKED | report-only until checked | R |
| 35 | Share metadata, `.token` files, revocation tombstones | `share-registry.ts:47,102-106` | none | **kept** (they stop token reuse) | — |
| 36 | Publish bundle rows / staged blobs / publish history | `J/cms/src/publish/transfer/bundle-staging.ts`; `W/platform/db/repos/publish-history-repo.ts` | rows 24 h TTL, pruned on a later stage; history append-only | report-only | R |
| 37 | Database ledger rows | `database-journal-repo.ts` | none | watch only | R |
| 38 | Electron Crashpad | `D/product-telemetry.ts:21-27` | Chromium's own | shown; unchanged | E |
| 39 | `~/Documents/Tovu-backups` | no product writer found | none | **manual only** (Storage sheet, Move to Trash) | M |
| 40 | Untracked folders under the sites home | — | none | listed; Move to Trash only | M |

## 2 · Mechanisms

### 2a · Retention runner (Jini `platform`, host-neutral)
- **Where:** `J/platform/src/retention/` (new). No server or vendor code. The implementer confirms the layer with Jini's layer check.
- **Shape:** `createRetentionRunner({ policies, clock, scheduler, fs, reportError }, { intervalMs = DAY_MS, onReport } = {})` returns `{ runOnce({ dryRun }), start(), stop() }`.
- **Policy:** `{ id, kind: "cache" | "derived" | "old-copy", measure(), sweep({ now }) }`. **There is no `"content"` kind and no `"history"` kind** (v1 had `"history"`; chats are content now). A compile-time test pins this.
- **Serialized passes:** boot, timer and manual passes share one in-flight promise. A second caller awaits the running pass instead of starting another.
- **Dry run calls `measure()` only.** It never enters `sweep()`. A test injects a `sweep` that throws, and dry run must still succeed.
- **Failures are isolated:** a policy that fails is reported in plain words, and the next policy still runs.
- **Shutdown:** `stop()` clears the timer and awaits the pass in flight, the same contract as `startChatExpirySweep` (`J/chat/src/store/runtime/chat-expiry-sweep.ts:52`).
- **Helpers stay with their owners.** Jini `platform` ships the runner and `filesOlderThan` for writer-owned roots. **The database-copy policy is bound in Tovu**, because `platform` and `db` are peers and must not import each other.

### 2b · Tovu site wiring (serving process, owner role only)
- `W/server/runtime/composition/retention.ts` (new). It starts beside the trash sweeper (`serving-app.ts:89-91`) only when **Q1 is approved**. Until then it runs report-only.
- **Shutdown:** `stop()` joins the boot drains, and the runner drains **before** storage closes.
- **Policies in order of arrival:** pre-migration copies (ST-6b), temp roots (ST-6c), incremental compaction (ST-7c), media GC (ST-11b), share expiry (ST-12b), `attempt_base_json` (ST-8c, conditional).
- **Pre-migration copies:**
  - Selection: keep the newest `keep` (5 until Q5) plus any copy protected by the journal.
  - Anchor: a pass prunes only when the newest copy is **verified** (it opens read-only and `quick_check` returns ok). With no verified copy, the pass removes nothing.
  - Serialization: the pass runs under the same lock that backup publication and Recovery readers use.

### 2c · SQLite compaction, in two steps (owner rule (b))
1. **One-time conversion: `convertToIncrementalVacuum({ kernel, filePath }, { recoveryCopyPath, minFreeBytes })`** (Jini `J/db/src/sqlite/`, reusing `sqliteOps`).
   - **Exclusive and idle:** it runs only on a **stopped** site while holding the `claimSiteRunning` lease (`W/platform/site-dir/site-running.ts:19`), before the daemon or any ordinary database user opens. It never runs inside a migration or a transaction (`outsideTransaction` already throws, `ops.ts:28`).
   - **Who triggers it:**
     - the CLI `tovu storage compact --site <dir>` (ST-16);
     - the desktop, for sites with no open window when the app is idle (ST-7b);
     - the owner's "Compact" button.
   - **Preflight:** free space must be ≥ 2 × (main + WAL) + 64 MB. If preflight fails, the step is deferred with a plain message, and boot or serving is never blocked.
   - **Recovery copy:** written via `copyTo` (`VACUUM INTO`, WAL-consistent) beside the pre-migration copies, under the same naming and retention.
   - **Conversion and verification:**
     - set `PRAGMA auto_vacuum = INCREMENTAL`;
     - call `compactAndVerify()` (VACUUM, WAL mode, `wal_checkpoint(TRUNCATE)` must report `busy = 0`, then `integrity_check` = ok);
     - read `PRAGMA auto_vacuum` back as 2;
     - only then write the completion marker (`ops/maintenance.json`, per DB file).
   - **Resumable:** after an interruption, the marker is absent and the original file or the recovery copy is intact, so the next idle moment retries.
2. **Daily compaction: `incrementalVacuumStep({ db }, { maxPages = 2048, minFreeRatio = 0.2, minFreeBytes = 8 MB })`.**
   - It runs only when the marker says the file was converted and `auto_vacuum` = 2.
   - It runs on the coordinated SQLite handle with a short busy timeout. `SQLITE_BUSY`/`LOCKED` defers the step to the next pass.
   - It reports `{ mainBytes, walBytes, freePages }` before and after, and the report says that a long reader can delay physical reclamation.
3. **Migration numbering:** neither step uses a migration. Content `0042` stays as it is, and the next content ID used by this plan is `0043` (ST-11b). Chat `0004` is pinning (ST-9). Each migration slice updates registries, `checksums.ts`, `source-digests.ts`, the fresh bootstraps (`W/platform/db/sqlite/fresh-content-db.ts`, `openChatDb` at `W/platform/db/sqlite/chat-db.ts:67-73`) and dialect coverage.

### 2d · Desktop partitions (owner rule (a))
- **Profile interlock** (`D/desktop-partition-lock.ts`, new). It wraps Jini's token-owned file lock and lives in `<userData>/partitions.lock`. Three paths acquire it:
  - the boot partition pass;
  - every session acquisition: a new injected `acquireSiteSession({ partition })` replaces the bare `session.fromPartition` calls in `D/main/index.ts`, records the partition as **held by this process**, and waits (bounded) while a pass holds the lock;
  - every cleanup path.
- **What the pass checks under the lock:**
  - **Presence:** it reads presence for live and starting instances. A missing or unreadable directory counts as "unknown", so the pass skips.
  - **Tracked sites:** it reads the tracked list fresh, because discovery runs asynchronously after IPC registration (`D/main/boot/boot-sequence.ts:167-172`).
- **Root and containment:**
  - root = `realpath(app.getPath("sessionData") + "/Partitions")`;
  - a candidate must be a **direct** child whose name matches `^tovu-site-[0-9a-f]{32}$`;
  - `lstat` must report a plain directory (symlinks and Windows reparse points are skipped);
  - `realpath(candidate)` must sit directly under the root. Anything else is skipped and reported.
- **Retirement record (the only proof for whole removal).**
  - The erase arm, after `eraseProjectDirectory` succeeds (`D/project-ipc.delete.ts:142`), appends `{ partition, siteDir, erasedAt }` to `<userData>/retired-partitions.json` (durable JSON).
  - At the next start, under the interlock, a retired partition is removed **only if** all of these hold:
    1. no other live or starting instance;
    2. no tracked row resolves to that partition (a new site at the same path hashes to the same name);
    3. `siteDir` still does not exist;
    4. this process has not acquired the partition.
  - If any check fails, the record is kept and retried later.
- **Untrack arm:** no partition action at all. **No `clearStorageData()`** is added anywhere.
- **Ambiguous (unclaimed, unretired) partitions:** under the interlock, and only when no other instance is live, delete only their `Cache` and `Code Cache` subfolders. Cookies, Local Storage, IndexedDB and Service Workers stay. The rest is listed in the Storage sheet as "Sign-ins for websites Tovu no longer lists". The owner can remove each one with a confirm that says re-adding that folder will need a fresh sign-in.
- **Cache cap (ST-1, after ST-1a and Q7):**
  - `applyDesktopCacheLimits({ appendSwitch }, { cacheBytes })` runs before `ready`.
  - A **per-partition, profile-scoped** marker records the one-time `clearCache()` for partitions over the cap. Busy or failed partitions are retried.
- **Code cache (ST-3):** cleared on an update launch for partitions not currently held. At site open (inside `acquireSiteSession`), it is cleared when > 64 MB. This is periodic enforcement only, so other partition storage can still grow (row 6).

### 2e · Measurement (ST-14, READY)
- `measureSiteStorage({ siteDir, paths }, { fs } = {})` in `W/features/storage/measure.ts`.
- It uses existing resolved paths, skips symlinks, and reports inaccessible locations as **unknown** rather than zero.
- It returns bytes per category and per **class** (`automatic` / `yours` / `report-only`). Main, WAL and SHM sizes are reported separately.
- It is read-only. No routes, cleanup or approvals are part of this slice.

### 2f · Shares (owner rule (c))
- **New optional field `expiresAt: string | null`** on `SiteShareRecord` (`W/features/site-backup/share-registry.ts:6-25`).
  - It is set only at creation, from an owner choice: **Never (default)** / 7 / 30 / 90 days. It is shown on the share row.
  - Existing rows have no value and never expire.
  - `findToken` (`:102`) and the public route (`site-share.ts:10-24`) answer 404 once `expiresAt` has passed. **This is the field's own stated meaning**, not a new cleanup decision.
- **Expiry pass (ST-12b):** under the registry's per-share lock:
  1. flip the row to `status: "expired"` (new value; tombstone and token reservation kept);
  2. delete the ZIP;
  3. delete any remote copy using the same path as revoke.
  An interrupted pass leaves the row expired and the ZIP present, and the next pass retries the delete.
- **Revoked rows whose ZIP delete failed** ("Retry revoke", `share-service.ts:111`): the pass retries the local delete only.
- **Never touched:** active rows without `expiresAt`, rows with `url: null` and no `storage` (peer-uploaded active links), `failed` rows, metadata, tokens and tombstones.

## 3 · Chat history (owner rule (d))

| Action | Who starts it | Guards |
|---|---|---|
| Pin / unpin | owner | `PATCH /api/assistant/chats/:id { pinned }`, a compatible extension; rename unchanged |
| Delete one | owner (exists, `assistant-chats.ts:216-226`) | unchanged: cancel unfinished runs, then delete |
| Delete selected | owner, multi-select | same per-chat path, in one request; skips pinned and active ones and reports them by name ("kept: pinned", "kept: still running") |
| Delete chats older than X | owner; X = last updated before a date | **Preview** returns a count, the bytes and a `previewToken` scoped to the owner. **Apply** needs the token and an explicit confirm. In one write transaction it re-selects `scope = owner AND pinned_at IS NULL AND updated_at < X AND no queued/running/recoverable run`, then uses the existing cancel/finalize path. Batches ≤ 500 (`J/chat/src/store/sql/maintenance.ts:12-20`). |
| Automatic | none for chats | only ST-8c (`attempt_base_json` on terminal, past-recovery attempts), and only if proven derived; it bumps `messagesVersion` (`J/chat/src/store/sql/store.ts:536`) |

- **Not planned:** automatic idle deletion, automatic or size-cap trimming of `events_json` (tool receipts and replay inputs), and deleting attachments of pinned chats.
- The admin dock shows the chat database's size in the Storage screen, so the owner can decide what to delete.

## 4 · Screens
- **Admin → Design & System → Storage (ST-17):**
  - per-category bars labelled "Cleaned automatically", "Yours" or "Shown only";
  - **Clean up now**, which shows the dry-run (`measure`) list, then runs automatic categories only;
  - links to Chats (bulk delete), Trash, Database (restore points), Exports (share expiry), Screenshots ("Delete older than…", with preview) and Revisions (ST-13).
  - It uses the `@jini-ai/admin` kit through hook props.
- **Desktop Storage sheet (ST-18):**
  - totals per site (folder + desktop data), desktop data, and "Other Tovu folders";
  - "Clean up" per site: a running site uses its HTTP API, a stopped site uses the CLI under the lease;
  - **Compact** for stopped sites;
  - "Sign-ins for websites Tovu no longer lists" with per-item Remove;
  - untracked folders and `Tovu-backups` with **Move to Trash** (`shell.trashItem`) only.

## 5 · Safety rules (each pinned by a named test)
1. **No content kind:** the runner type has no content kind, so content is deleted only by explicit owner action through a screen or the approval card.
2. **Live logins are kept:** a partition is never removed without a retirement record and the four next-start checks, and never while any instance holds the profile interlock or a session for it.
3. **No `VACUUM` in a migration or transaction.** Conversion needs the running lease, a verified recovery copy and a verification read-back.
4. **No live link is broken:** share files are removed only for revoked rows or a share's own stated expiry.
5. **No automatic chat deletion.** Bulk delete rechecks pin, scope and activity atomically after confirm.
6. **Dry run is measure-only.** Every manual cleanup previews first.
7. **Busy, expired and protected get different plain messages.** Examples:
   - "This website's database is busy; compaction will try again later."
   - "Kept: this chat is pinned."
   - "This link expired on 3 Dec and was removed."
   A failure never blocks boot or serving.

## 6 · DEFAULTS FOR OWNER OK

| # | Item | Proposed default | Why | Never auto-deleted |
|---|---|---|---|---|
| Q1 | Where the site retention runner runs | Serving/owner process only, beside Trash; report-only until approved | `serving-app.ts:89` records that sweeps in the exporter or daemon would delete rows "from a process nobody is watching" | anything while a site is not served by its owner process |
| Q2 | Owner chat history | **No automatic deletion.** Manual: pin, delete selected, "Delete chats older than X" (preview + confirm) | Owner rule (d); `events_json` holds receipts and replay inputs that cannot be re-created | every owner chat, its messages, tool receipts and attachments; pinned chats even in bulk delete |
| Q2b | `attempt_base_json` on finished runs | Emptied 7 days after the run ends **if** ST-8c proves nothing reads it; otherwise left as is | It is a second copy of the projection, used only for recovery | `events_json`, message text, attachments |
| Q3 | Screenshots `.captures/` | **Manual only** ("Delete screenshots older than X", preview) | Owner artifacts cited by reports (`capture-files.ts:5-15`) | every screenshot |
| Q4 | Share links | New shares: expiry **Never** by default (owner may pick 7/30/90 days). Automatic: retry ZIP delete of revoked shares; remove ZIPs past their own stated expiry | Owner rule (c); there is no reliable way to prove a ZIP has no live link | active shares without a stated expiry, peer-uploaded links, failed rows, tokens and tombstones |
| Q5 | Pre-migration database copies | **Keep newest 5** (today's number), now also enforced by a daily pass that runs only after a verified copy | Keeps the recovery window; the daily pass catches sites that never migrate again | the newest verified copy, protected restore points, any copy a Recovery reader holds |
| Q6 | Post and page revisions | **Manual only** ("Thin revisions older than X" per post/page, preview) | Revisions are visible content, and HTML Pages share the table | published, restore-target and undo-referenced revisions; each item's newest revision |
| Q7 | Desktop cache | 32 MB HTTP cache per site and code cache cleared after updates or when > 64 MB, **after** ST-1a measures it | Loopback assets gain little from caching; 1.2 GB caches seen | cookies, Local Storage, IndexedDB (logins) |
| Q8 | Partitions of erased sites | Removed at the next start with a retirement record + 4 checks | Positive proof that the site is gone | partitions of tracked, untracked, moved or ambiguous sites (their login data) |
| Q9 | Ambiguous partitions (no proof) | Cache folders only, automatically; login data listed for manual removal | Most of the bytes are cache; logins may still matter | everything except `Cache` and `Code Cache` |
| Q10 | SQLite conversion to incremental vacuum | Once per DB, stopped site, idle, preflight + recovery copy; then daily bounded `incremental_vacuum` | Reclaims space after deletes without a serving-time `VACUUM` | rows; the recovery copy follows Q5 |
| Q11 | Purged media files | Removed after the 30-day `gc_grace` once ST-11a's durable protocol is live | The owner already purged them from Trash | live or trashed media, renditions still referenced, legacy orphans (report-only) |
| Q12 | Temp roots (export/import/snapshot) | Crash leftovers in exact writer-owned roots, older than 1 day, with no live owner marker | They are leftovers of finished or crashed jobs | `out/export`, `--out` targets, anything outside the named roots |
| Q13 | Theme v1 rollback copies and staging trees | **Manual only** (listed) | It is the only revert path for a theme migration | every theme copy |
| Q14 | `~/Documents/Tovu-backups`, untracked site folders | Manual Move to Trash only | No product writer; owner's files | all of it |

## 7 · Slices (one implementer each, ≤ 2 h, one repo)

**READY now (unchanged from the check):** ST-4, ST-5, ST-14.

| ID | Repo | What | Tests first (named) | Mutation that must turn a test red | Depends on | Est |
|---|---|---|---|---|---|---|
| **ST-4 · READY** | Jini | **Runner only:** injected scheduling, serialized passes, measure-only dry run, failure isolation, shutdown drain. No file deletion. | `boot, timer and manual passes share one in-flight pass`; `dryRun never calls sweep`; `one failing policy does not stop the next`; `stop awaits the pass in flight`; type test `kind "content" does not compile` | let `runOnce` start a second pass while one is running | — | 2 h |
| **ST-5 · READY** | Jini | **Copy-retention selection + tests only:** a pure `selectDatabaseCopiesToPrune({ copies, verifiedNewest, keep = 5, protectedPaths })`. Keeps the 5-copy default, protected paths and the successful-copy requirement. No production pruning change, no compaction. | `default keeps 5`; `protected paths are kept beyond the cap`; `nothing is selected without a verified newest copy`; `copies from another directory are ignored` | drop the verified-copy requirement | — | 1.5 h |
| **ST-14 · READY** | Tovu | **Measurement only:** `measureSiteStorage` over existing resolved paths; skips symlinks; inaccessible = unknown. No routes, cleanup or approvals. | `categories add up to the walked total`; `a symlink is not followed`; `an unreadable folder is reported unknown, not 0`; `WAL is reported apart from the main file` | follow symlinks | — | 2 h |
| ST-1a | Tovu | Packaged-Electron measurement: two persistent site sessions, repeated writes, cap scope; cookies survive `clearCache` / `clearCodeCaches` | `cache stays under the switch per partition`; `cookie survives clearCache and clearCodeCaches` | call `clearStorageData` in the harness and expect red | — | 2 h |
| ST-1 | Tovu | Cache switch + profile-scoped per-partition one-time clear with retry | `switch set before ready`; `a busy partition is retried next start`; `marker is per profile` | write the marker before the clear succeeds | ST-1a, Q7 | 1.5 h |
| ST-2a | Tovu | Profile interlock + `acquireSiteSession` + contained partitions-root resolver (no deletion) | `opening a site waits while a pass holds the lock`; `a symlinked candidate is skipped`; `unreadable presence = skip`; `second profile is separate` | treat unreadable presence as "no instances" | — | 2 h |
| ST-2b | Tovu | Retirement record in the erase arm only; untrack arm untouched | `erase writes a record after the folder is gone`; `untrack + re-add keeps the login`; `failed erase writes no record` | write the record in the untrack arm | ST-2a | 1.5 h |
| ST-2c | Tovu | Next-start partition pass: retired removal (4 checks) + cache-only for ambiguous | `sibling starting during a sweep keeps its partition`; `add/open during discovery keeps the partition`; `same path re-created → partition kept`; `ambiguous partition keeps Cookies` | skip the "tracked row claims it" recheck | ST-2b | 2 h |
| ST-3 | Tovu | Code cache on update launch + > 64 MB at open (held partitions skipped) | `update launch clears code cache of unheld partitions`; `> 64 MB cleared at open`; `storage untouched` | clear a held partition | ST-2a | 1.5 h |
| ST-6a | Tovu | Wire the ST-4 runner in the serving process, report-only, owner role, drain before storage close | `never starts on a client role`; `stop drains before storage closes`; `report line written` | start on every role | ST-4 + Jini release, Q1 | 1.5 h |
| ST-6b | Tovu | Bind the pre-migration copy policy (keep 5 until Q5), serialized with backup publication and Recovery readers | `a pass waits for backup publication`; `no verified copy → nothing removed`; `protected restore points kept` | prune without taking the shared lock | ST-5, ST-6a | 2 h |
| ST-6c | Tovu | Exact writer-owned temp roots + liveness markers; reuse `tidyImportDatabases` | `a root with a live marker from another process is kept`; `only named prefixes in the named root are touched` | match `tovu-*` broadly | ST-6a | 2 h |
| ST-7a | Jini | `convertToIncrementalVacuum` + `incrementalVacuumStep` in `J/db/src/sqlite/` | `pinned WAL reader → deferred, file intact`; `competing writer → busy deferral`; `low disk → deferred with plain message`; `interrupt then restart completes`; `marker only after auto_vacuum reads 2` | write the marker before verification | — | 2 h |
| ST-7b | Tovu | Run conversion on stopped sites under the running lease (CLI + desktop idle trigger) | `refused while the site is running`; `boot unaffected when preflight fails` | skip the lease | ST-7a + release, ST-16 | 2 h |
| ST-7c | Tovu | Daily `incrementalVacuumStep` policy (converted files only) | `unconverted file is skipped`; `busy defers`; `report has main and WAL sizes` | run on an unconverted file | ST-7a, ST-6a | 1.5 h |
| ST-8a | Jini | Chat persistence: `pinned_at`, `setPinned`, scoped `previewDeleteOlderThan` / `deleteOlderThan` with atomic recheck; route specs via `defineJsonRoute` | `pinned after preview is kept`; `run started during cleanup is kept`; `never crosses owners`; `batches ≤ 500` | drop the `pinned_at IS NULL` recheck in apply | — | 2 h |
| ST-8b | Jini | `ConversationList` pin + multi-select via props/hooks | `pin toggles through props`; `selection emits ids` | ignore the pinned prop | ST-8a | 1.5 h |
| ST-8c | Jini | Proof + trim of `attempt_base_json` on terminal, past-recovery attempts (version bump) | `recoverable attempt untouched`; `replay after trim matches`; `messagesVersion changes` | trim a recoverable attempt | ST-8a | 2 h |
| ST-9 | Tovu | `chat/0004_chat_pinned` (registries, checksums, digests, fresh bootstrap, dialects) + mount Jini routes; `PATCH` compatible | `rename still works with no pinned field`; `fresh bootstrap = migrated schema` | omit the fresh-bootstrap DDL | ST-8a + release | 2 h |
| ST-10 | Tovu | Admin chat list: pin, multi-select delete, "Delete older than" dialog (admin kit, hook props) | `dialog shows the server count before deleting`; `kept items are named` | delete without the preview token | ST-9, ST-8b | 1.5 h |
| ST-11a | Jini | Durable media GC protocol (shared ownership, durable claims, retryable unlink, rendition keys via `cleanupJournal`) | `crash between claim and unlink resumes`; `cross-process same-hash re-upload keeps the file`; `rendition sharing bytes kept` | use the in-process hash lock only | — | 2 h |
| ST-11b | Tovu | Content `0043_blob_gc_journal` + adapter + policy; legacy orphans report-only | `purged file removed only after grace`; `trashed-media reference kept`; `legacy orphan reported, not removed` | delete legacy orphans | ST-11a + release, ST-6a | 2 h |
| ST-12a | Tovu | `expiresAt` opt-in at create (default never) + 404 after own expiry | `no expiry by default`; `peer-uploaded row without URL or storage still served` | default `expiresAt` to 14 days | — | 1.5 h |
| ST-12b | Tovu | Expiry / revoked-retry pass under the per-share lock; tombstones kept | `active link without expiry untouched`; `interrupted expiry retried`; `token stays reserved` | expire rows without `expiresAt` | ST-12a, ST-6a, Q4 | 1.5 h |
| ST-13 | Tovu | Manual revision thinning, explicit page/post scope, protections | `published / restore / undo targets kept`; `newest kept`; `requires explicit scope` | drop the undo-reference check | Q6 | 2 h |
| ST-15 | Tovu | Storage HTTP (Jini spec, Tovu mount) + `site_storage_report` (read) + `site_storage_cleanup` (automatic classes only, approval card) | `cleanup defaults to dryRun`; `content class refused in plain words`; `approval card raised` | default `dryRun` to false | ST-14, ST-6a | 2 h |
| ST-16 | Tovu | CLI `tovu storage report\|clean\|compact --site <dir> --json` under the running lease; report path opens read-only, no boot | `running site → "This website is running; clean it from its Storage screen."`; `report does not migrate` | open writable before the lease | ST-14 | 2 h |
| ST-17 | Tovu | Admin Storage screen | `three class labels`; `dry-run list first` | skip the dry run | ST-15 | 2 h |
| ST-18 | Tovu | Desktop Storage sheet (per site, compact, sign-ins list, Move to Trash) | `untracked folders never removed without the button`; `removing a sign-in asks first` | auto-remove listed sign-ins | ST-2c, ST-16 | 2 h |

**Order:**
- Desktop: ST-1a → ST-2a → ST-2b → ST-2c, with ST-3 after ST-2a and ST-1 after Q7.
- Jini, in parallel: ST-4, ST-5, ST-7a, ST-8a, ST-11a.
- Tovu after each Jini release: ST-6a → ST-6b/6c → ST-7c, then ST-9 → ST-10, then ST-11b.
- ST-14 → ST-15 → ST-17; ST-16 → ST-7b and ST-18.

## 8 · Expected savings on the measured machine (restated)

Partition counts alone cannot show how many partitions are orphans. The numbers below are ranges until the appendix commands are run.

| Area | Today | Automatic saving | Owner-action saving | Assumption |
|---|---|---|---|---|
| Desktop partitions | 7.4 GB | ~3–5 GB from `Cache` + `Code Cache` on all partitions (largest: 1.6 GB of 1.6 GB is cache) | remaining sign-in data of unlisted sites, size unknown until measured | cache dominates (as on the largest partition); historical orphans have no retirement proof, so only their caches go automatically |
| Site folders | 9.1 GB | ~0.1–0.4 GB (compaction after owner deletes, purged media, temp leftovers) | chats, screenshots, revisions and share ZIPs the owner chooses to delete | copies stay at 5 until Q5 |
| `Tovu-backups` | 1.1 GB | 0 | up to 1.1 GB | manual only |

## 9 · Open (NOT-CHECKED, carried from the check)
- The relocation-backup writer behind the dev script (`development/scripts/sites-move-home.ts`).
- P5's history windows.
- Provider-wide native log retention.
- Source-control export leftovers.
- Real Electron/Crashpad behaviour and disk savings (ST-1a measures the first).
- The ST-8c proof that `attempt_base_json` is unread after the terminal state.

## Appendix · Owner-run read-only checks
```sh
P=~/Library/Application\ Support/Tovu/Partitions   # repeat with tovu-desktop
du -sh "$P"/tovu-site-*/Cache "$P"/tovu-site-*/"Code Cache" 2>/dev/null | sort -h | tail
du -sh "$P"/tovu-site-* | sort -h | tail                    # total per partition, to compare with cache
sqlite3 ~/Documents/Tovu/<site>/data.nosync/chat.db \
  "select sum(length(content)), sum(length(events_json)), count(*) from ai_chat_messages; pragma freelist_count; pragma page_count;"
sqlite3 ~/Documents/Tovu/<site>/data.nosync/chat.db "select sum(length(attempt_base_json)) from assistant_run_attempts;"
ls -l ~/Documents/Tovu/*/data.nosync/*.db-wal 2>/dev/null
```
