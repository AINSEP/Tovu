STORAGE PLAN COMPLETE

# P11 · Storage budget: keep Tovu's disk use bounded for agencies with many sites

**Base:** Tovu `main` `0df57a3af`, Jini `main` `131a68bd7`. Planning only, no code changed.
`W/` = Tovu `apps/website/src/`, `D/` = Tovu `apps/desktop/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`.
**Owner ask (11-22):** "should we create a plan to keep the size for tovu sites under control? deleting old chats and stuff? this is also for website builders so they'd be creating a lot of sites so we gotta fix this."
**Measured on the owner's Mac (coordinator, 11-22):** desktop partitions 7.4 GB (55 partitions; the largest is 1.6 GB = Cache 1.2 GB + Code Cache 402 MB), site folders 9.1 GB (29 sites), `~/Documents/Tovu-backups` 1.1 GB. **Total ≈ 17.6 GB.**
**Owner rules applied to every step:** inject everything; hooks as props; `(required, _optional = {})` pads and the args rule; functions ≤ 80 lines, complexity ≤ 10; plain error words; no vendor code in core; Jini stays server- and vendor-neutral; schema changes only through ADR-066 TS migrations; tests first with a named mutation; one implementer per step, ≤ ~2 h, one repo.

## Headline findings (verified in code)

1. **The biggest item, the desktop partitions, has no limit and no cleanup at all.** `D/desktop-auth.ts:157` names one `persist:tovu-site-<sha256(path.resolve(siteDir))[:32]>` partition per site path. The desktop calls no `disk-cache-size`, `clearCache`, `clearCodeCaches` or `getCacheSize` anywhere except the one-off capture session (`D/desktop-capture.ts:35-36`). Deleting a site (`D/project-ipc.ts:1030-1068`) stops the server, erases the folder, untracks the site and deletes its preview PNG (`:1067`), but **leaves the partition untouched**. Previews already get an orphan sweep at boot (`D/site-preview-store.ts:183`, wired at `D/main/index.ts:969-978`), but **partitions do not**.
   - **Why there are 55 partitions for 29 sites:** the digest is taken from the site's *path*, so moving or renaming a site folder (for example `development/scripts/sites-move-home.ts`) creates a new partition and leaves the old one orphaned. Dev (`tovu-desktop`) and packaged (`Tovu`) use separate `userData` folders, so a site opened in both has two partitions.
2. **Old chats cannot be cleaned up in bulk.** Admin chats live in `chat.db` (`ai_chats` plus `ai_chat_messages.events_json` holding the full tool events, `W/platform/db/migrations/chat/0001_sqlite_chat_tables.ts:36-50`). The only retention is the **guest**-chat sweep: a 2-day `expires_at` (`W/assistant/persistence/tenant-scope.ts:34`) swept on the owner process (`W/server/runtime/composition/deps.ts:857-862` → `J/chat/src/store/runtime/chat-expiry-sweep.ts`). Owner chats have `expires_at NULL`, which means kept forever by design (`J/chat/src/store/sqlite/schema.ts:33-35`). One chat can be deleted (`DELETE /api/assistant/chats/:id`, `W/server/runtime/composition/modules/assistant-chats.ts:193`), but there is no pin, no "delete older than", no size cap and no event trimming. Deleting removes messages, run attempts, sessions and approvals through `ON DELETE CASCADE` (`chat/0002_durable_run_attempts.ts:11`).
3. **Nothing reclaims SQLite space.** No `auto_vacuum` and no `VACUUM` on site databases (the only `VACUUM`s are in duplicate and seed paths, plus Jini's daemon-db operation at `J/server/src/builtin-features.ts:147-163`). After rows are deleted, `chat.db` and `content.db` keep their size.
4. **Purged media files are never removed.** `purgeMedia` only tombstones the file (`J/cms/src/media/media-service.ts:800-860`). The delete and unlink passes exist (`J/cms/src/media/blob-gc.ts`), but its own header says "nothing calls it on a schedule". In Tovu, `W/platform/db/repos/media-repo.ts:29-32` says no root wires a `BlobGcJournalRepoPort`, and Tovu's migrations have **no `blob_gc_journal` table**. So every media item the owner purges from Trash keeps its file in `uploads/` forever.
5. **Some cleanup already exists and is reused rather than rebuilt (owner rule: search first):**
   - **Database copies:** Jini `pruneDatabaseCopies` with `DATABASE_COPY_RETENTION = 5` (`J/db/src/sqlite/backup-policy.ts:5,49`). It is used for `pre-migrations-*.db` (`W/platform/db/sqlite/content-db.ts:88-139`) and restore points (`W/platform/db/sqlite/database-journal-repo.ts:335-349`, which skips protected copies). It only runs **after a new copy is written**, so a site that never migrates again keeps its copies forever. The owner's three 11–19 MB copies are under the cap of 5, so nothing has ever been pruned.
   - **Trash:** 60-day `TRASH_RETENTION_DAYS` (`W/features/trash/ports.ts:33`), swept by `startTrashSweeper` only in the serving process (`W/server/runtime/composition/serving-app.ts:80-94`). Theme trash goes through the same Trash (`W/features/theme/theme-trash.ts:16-19`).
   - **Other existing limits:**
     - Mail retention of 30 days and 1 day (`W/features/mail/retention.ts:5-7`).
     - Chat-attachment upload TTL and per-run cleanup (`J/daemon/src/http/attachments.ts:44-47`).
     - Rotating logs of 5 MB × 2 per file (`W/platform/server-logs/log-file.ts:20,64`).
     - Import uploads expire after 1 h (`W/features/site-backup/import-registry.ts:33`). Import *history* is planned in P5 (30 days visible, 1-year replay record).
     - Publish bundle staging expires after 24 h (`W/features/publish-content/bundle-staging.ts:77`).
     - Daemon terminal events are kept 15 min in memory (`J/daemon/src/event-log.ts:49`).
   - **Sweeper pattern already used 4 times:** chat expiry, mail retention, the submission-IP sweep (`W/features/forms/submission-ip-expiry-sweep.ts:15`) and the trash sweeper all follow "run at boot, then an `unref`'d interval, skip overlapping ticks, report errors". The new sweeper generalizes that shape. It does not replace these four (they keep working; folding them in is optional later).
6. **Where the sweeper runs (a correction to the brief):** the brief says "daily by the daemon". `serving-app.ts:80-84` records the opposite decision for Trash: a sweep "in the exporter or the agent daemon would hard-delete a site's rows from a process nobody is watching". **This plan runs the site sweeper in the owner/serving process**, like the trash sweeper and chat expiry (owner role only, `deps.ts:862`). The desktop runs its own sweep in the Electron main process. The engine (Jini) only provides the neutral runner. **Owner OK needed (Q1).**

## 1 · Inventory

"Line" = where the bytes are written or the limit lives. "Auto?" says whether the **proposed** retention runs without asking: **A** = automatic (cache, derived data or old copies only), **M** = manual only (content), **S** = setting, off or on by owner choice.

| # | Item | Where (file:line) | Growth driver | Current limit | Proposed default | Auto? | Visible to the user? |
|---|---|---|---|---|---|---|---|
| 1 | Desktop per-site HTTP cache (`Partitions/tovu-site-*/Cache`) | `D/desktop-auth.ts:157`; sessions at `D/main/index.ts:429,573-575,597,622` | every admin build's new hashed assets; never evicted below Chromium's dynamic max | **none** (no `disk-cache-size`) | 32 MB per partition (loopback assets gain little from caching) | A | no (in the Storage sheet) |
| 2 | Desktop per-site V8 code cache (`…/Code Cache`) | same sessions | compiled JS per build; old builds' entries stay | **none** | cleared once after each app update; cleared when > 64 MB at site open | A | no |
| 3 | Orphan partitions (deleted, moved or renamed sites, old test sites) | path-hashed name, `D/desktop-auth.ts:157-160` | site move or rename = new partition; delete never removes it | **none** (previews have a sweep, partitions don't) | removed at desktop start when no tracked site claims it and no other instance of this profile is running | A | no |
| 4 | Partition of a site deleted in the app | `D/project-ipc.ts:1030-1068` | delete path skips it | **none** | storage + cache + code cache cleared at once; folder removed next start (#3) | A | no |
| 5 | Site preview PNGs | `D/site-preview-store.ts:136,160,183` | one per site | ✅ delete + orphan sweep | unchanged | A | no |
| 6 | Admin chats (messages, `events_json` tool payloads, run attempts, sessions, approvals) | `W/…/modules/assistant-chats.ts:254` (append); schema `chat/0001…:36-50`, `0002…:10` | every turn; tool results are the bulk (to confirm, see appendix) | owner chats **none**; guest 2 days | see §3 defaults: pin = never auto-deleted; tool details shrunk after 30 days; unpinned chats idle 180 days deleted (setting) | S | yes (chat list + Storage) |
| 7 | `chat.db` / `content.db` free pages after deletes | no `auto_vacuum` anywhere in `W/` | deletes leave holes | **none** | switch to `auto_vacuum=INCREMENTAL` once (migration), then `incremental_vacuum` when free > 20 % and > 8 MB | A | no |
| 8 | `pre-migrations-<ts>.db` (11–19 MB each) | `W/platform/db/sqlite/content-db.ts:93,124-139` | one per migrating boot | newest 5, pruned only on next copy (`J/db/src/sqlite/backup-policy.ts:5,49`) | newest **2** + any < 7 days, also pruned by the daily sweep | A | yes (Storage, "Old database copies") |
| 9 | Restore points `restore-point-*.db` | `W/platform/db/sqlite/database-journal-repo.ts:307,335-349` | publishes / migrations | newest 5 + protected | unchanged (they are the Recovery screen's choices) | A (existing) | yes (Database screen) |
| 10 | Share ZIPs `ops/shares/*.tovu.zip` (≤ 300 MiB each) | `W/features/site-backup/share-registry.ts:121-127`; dir `W/server/runtime/composition/deps.ts:525-538` | each export/share | deleted only on revoke (`share-service.ts:107-114`) | Zip-only shares (no link host): local ZIP removed **14 days** after creation, row kept as "Expired, export again". Linked shares served from this folder: kept until revoked, listed with size | S (needs OK) | yes |
| 11 | Screenshots `.captures/<date>/*.jpg` | `W/features/web-screenshot/capture-files.ts:7,31-42` | `web_screenshot_page` rounds | **none, on purpose** (`:13-15` "owner's to delete") | date folders older than **30 days** removed | S (reverses a recorded decision, needs OK) | yes |
| 12 | Theme trash `themes-trash/` | `W/features/theme/theme-trash.ts:16-19,205` | trashed themes | 60-day Trash sweep | unchanged; the implementer confirms the theme adapter is in the sweep set (test) | A (existing) | yes (Trash) |
| 13 | Content trash (posts, pages, media rows…) | `W/features/trash/ports.ts:33`, `serving-app.ts:85` | deletes | 60 days | unchanged | A (existing) | yes |
| 14 | Purged media files in `uploads/` | `J/cms/src/media/media-service.ts:800-860`, `blob-gc.ts` header; `W/platform/db/repos/media-repo.ts:29-32` | every purge keeps the bytes | **never removed** (no journal table, no schedule) | removed after the existing 30-day `gc_grace`, only when no media row shares the sha256 | A (the purge was already confirmed) | no |
| 15 | Media originals and variants (live) | `uploads/` | user uploads | n/a | **never automatic** (content) | M | yes |
| 16 | Post revisions (`post_revisions`, full copy per save) | `W/features/post/repo.ts:226-233` (only deleted with the post); `J/cms` post writes | every save; agent edit loops make many | **none** | keep all from the last 30 days; older: newest 20 per post + published + any `restored_from` target | S (needs OK) | yes (revision list) |
| 17 | Theme v1 rollback copies `<theme>.v1-backup-<ts>` | `W/features/theme/migration/migrate-theme.ts:315-316` | each v1→v2 theme migration | **none** | newest one per theme + any < 30 days | A (old copy) | no |
| 18 | Database ledger rows `database_ledger` | `W/platform/db/sqlite/database-journal-repo.ts:132,172` | each journalled operation; small rows | **none** | watch only (rows are tiny); revisit at > 10 MB | — | yes (Database screen) |
| 19 | Site logs `ops/logs/*.log` (server, daemon, local-site) | `W/platform/server-logs/log-file.ts:20,64,70`; `W/server/runtime/lifecycle/local-site-process.ts:39` | console output | ✅ 5 MB × 2 per file | unchanged | A (existing) | yes (server-logs tool) |
| 20 | Import history + uploads `appData/site-imports/` | `W/features/site-backup/import-registry.ts:33,58-109` | each import | uploads 1 h; history **none** | **P5 owns this:** 30 days visible, 1-year replay record. No new work here | A | yes |
| 21 | Chat attachments (daemon upload dir) | `J/daemon/src/http/attachments.ts:44-47` | uploads in chat | ✅ TTL + `cleanupRun` + emptied at start | unchanged | A (existing) | no |
| 22 | Agent-plugin copies `agent-plugins/` (16 MB/site) | `W/platform/site-dir/layout.ts:94`; installs replace in place (`W/features/agent-plugins/install-upload.ts:366`) | per-site copy of bundled plugins | one version per id | unchanged (site content; dedupe across sites is a separate idea, not in this plan) | M | yes |
| 23 | Themes + `__original-themes__` (23 MB/site) | `W/features/theme/index.ts:197`, `duplicate-theme.ts:317` | per-site theme copies and their Reset originals | n/a | unchanged (content, and Reset needs the originals) | M | yes |
| 24 | Export/share temp folders (`tovu-share-projection-*`, `tovu-archive-media-*`, `tovu-static-copy-*`) | `W/features/site-backup/share-database/repo.sqlite.ts:321,395`, `static-copy.ts:163` | each export | OS temp dir | sweeper removes `tovu-*` temp folders older than 1 day that this process doesn't hold | A | no |
| 25 | `~/Documents/Tovu-backups` (1.1 GB) | **no product writer found** (repo-wide grep); dev relocation backups `*.relocation-*-backup` come from `development/scripts/sites-move-home.ts:31` | manual / dev scripts | none | **never automatic**; shown in the desktop Storage sheet as "Other Tovu folders", with an explicit "Move to Trash" | M | yes |
| 26 | Electron Crashpad reports | `D/product-telemetry.ts:24` | crashes | Chromium's own pruning | unchanged; size shown in the Storage sheet | A (Chromium) | no |

## 2 · Mechanisms

### 2a · One shared retention sweeper (Jini, host-neutral)
- **Where:** `J/platform/src/retention/` (new; it is a leaf utility with no server or vendor code). The implementer confirms the layer with Jini `scripts/check-package-layers.ts`. If `platform` turns out to be the wrong layer, `J/core` is the fallback. No other change.
- **Shape:**
  - `createRetentionSweeper({ policies, clock, scheduler }, { intervalMs = DAY_MS, onReport, onError } = {})` returns `{ runOnce({ dryRun }), start(), stop() }`.
  - Each policy is injected: `{ id, kind: "cache" | "derived" | "old-copy" | "history", measure(), sweep({ now, dryRun }) }`, returning `{ bytes, items }` and `{ removedBytes, removedItems }`.
  - **There is no `"content"` kind.** The type cannot express "delete user content automatically", and a test pins that.
- **Behaviour:** one pass at start, then daily on an `unref`'d timer. Overlapping ticks are skipped. One failing policy never stops the others (plain error words in the report). `dryRun` measures only.
  - `stop()` waits for the pass in flight, the same contract as `startChatExpirySweep` (`J/chat/src/store/runtime/chat-expiry-sweep.ts`).
  - The scheduler and clock are injected, as `createTrashScheduler` does (`W/features/trash/scheduler.node.ts`).
- **Hosts supply every policy.** Jini ships the runner and two generic policy helpers only:
  - `filesOlderThan({ root, match, maxAgeMs, keepNewest })` (for captures, temp folders and v1 backups).
  - `databaseCopies({ list, keep, keepNewerThanMs, remove })` (wraps `pruneDatabaseCopies`).
- **Database copies:** `pruneDatabaseCopies` gains `{ keep = DATABASE_COPY_RETENTION, keepNewerThanMs = 0 }` options. The default stays 5, so restore points are unchanged; pre-migration copies pass `keep: 2, keepNewerThanMs: 7 days`.
- **Compaction:** a new `compactSqlite({ db }, { minFreeRatio = 0.2, minFreeBytes = 8 MB, maxPages } = {})` in `J/db/src/sqlite/`. It reads `PRAGMA page_count/freelist_count/page_size` and runs `PRAGMA incremental_vacuum(n)` only when worthwhile. It reports `{ beforeBytes, afterBytes }` like `buildDaemonDbOperations.vacuum` (`J/server/src/builtin-features.ts:147`).

### 2b · Tovu site wiring (owner process only)
- `W/server/runtime/composition/retention.ts` (new) builds the sweeper with Tovu's policies:
  - pre-migration copies (#8), captures (#11), theme v1 copies (#17), temp folders (#24);
  - later: chat (#6), compaction (#7), media files (#14), shares (#10), revisions (#16).
- It starts beside the trash sweeper in `serving-app.ts:85` (the serving process, owner role), and `stop()` joins `bootDrains`.
- **Settings** (chat auto-delete days, capture days, share ZIP days) are stored in the site's settings table (owner-editable) and read by the policies at each pass.

### 2c · SQLite compaction
- One ADR-066 TS migration per database switches to `auto_vacuum=INCREMENTAL`: `chat/0004_incremental_vacuum` and content `0042_incremental_vacuum`.
- SQLite needs one full `VACUUM` after changing that pragma. The migration runner already writes the pre-migration copy first (`content-db.ts:93`) and already refuses when the disk is low (`assertDatabaseCopySpace`, `backup-policy.ts:24`).
- After that, the sweeper's compaction policy calls `compactSqlite` daily and right after any bulk chat delete. No exclusive full `VACUUM` ever runs while serving.

### 2d · Desktop (Electron main, Tovu `D/`)
- **Cache cap.** `app.commandLine.appendSwitch("disk-cache-size", String(32 MB))` before `ready`, through a new injected `applyDesktopCacheLimits({ appendSwitch }, { cacheBytes } = {})` in `D/desktop-storage-limits.ts`. The switch applies to every session, so all site partitions are capped.
  - The first launch after shipping runs a one-time pass: any tracked partition whose `session.getCacheSize()` > cap gets `clearCache()` (marker in preferences).
- **Code cache.**
  - After an update: `desktopLaunchMode` already detects an update launch (`D/main/updates/product-telemetry-boot.ts:150`). On that launch, call `clearCodeCaches({})` and `clearCache()` on each tracked partition (old hashed assets are dead).
  - At each site open: measure `Partitions/<p>/Code Cache`, and clear it when it is over 64 MB.
- **Delete a site.** In `deleteProject` (`D/project-ipc.ts:1030`), after the server stops: `clearStorageData()`, `clearCache()` and `clearCodeCaches({})` on that partition's session (injected `clearPartition` dep, next to `deletePreview`).
  - The folder itself can't be removed while the session object lives, so the next start's orphan sweep removes it.
  - This runs in **both** delete arms (erase and untrack). Re-adding a site only costs a fresh automatic owner sign-in, which the desktop does itself (`armDesktopOwnerSignIn`).
- **Orphan partition sweep.** It runs at start after discovery settles, in the same `sweep` slot as previews (`D/main/index.ts:976`).
  - It removes `<userData>/Partitions/<name>` only when the name matches `^tovu-site-[0-9a-f]{32}$` and no tracked site's `sitePartition` claims it.
  - It **skips the whole sweep** when `instance-presence` (`D/instance-presence.ts:38`) shows another live instance of this profile, because `main.ts` takes no single-instance lock (`D/project-ipc.ts:1040-1046`).
  - It never touches non-Tovu partitions or the default session.

### 2e · Measurement (feeds both Storage screens and the assistant)
- `measureSiteStorage({ siteDir, paths }, { fs } = {})` in `W/features/storage/` (new feature folder) returns bytes per category:
  - chats, content database, media originals, themes, plugins, old database copies, shares, screenshots, trash, logs, other.
  - Each category is labelled `automatic` or `yours` (content).
- The walk is read-only, bounded (skips `node_modules`) and cached for 60 s.

## 3 · Chat history (owner: "deleting old chats")

**Proposed defaults (need owner OK, Q2):**

| Rule | Default | Owner can change |
|---|---|---|
| Pinned chats | never deleted automatically, never trimmed | pin / unpin any chat |
| Tool details (`events_json`) in a chat not opened or updated for 30 days | shrunk to a summary per tool call (name, status, first 2 KB of the result); message text kept | days: 14 / 30 / 90 / never |
| Whole unpinned chats idle for 180 days | deleted automatically | Never / 90 / 180 / 365 days |
| First run after upgrade | no automatic deletion for 7 days; the Storage screen shows "N chats will be removed on <date>" | — |
| Per-site chat size over 200 MB | shrinks tool details of the oldest unpinned chats first (older than 7 days); **never** deletes whole chats for size | cap 100 / 200 / 500 MB |
| Guest (site visitor) chats | unchanged 2 days (`tenant-scope.ts:34`) | — |
| Manual | delete one (exists), select several, "Delete chats older than …" (confirm dialog with count), "Delete all unpinned" | — |

**Engine pieces:**
- **Jini `@jini-ai/chat`:**
  - add `pinned_at INTEGER` to `CHAT_HISTORY_DDL` (`J/chat/src/store/sqlite/schema.ts`);
  - add `ChatStore.setPinned`, and owner-scoped `deleteOlderThan({ before, keepPinned: true })` on the *scoped* store (no cross-owner hatch);
  - add `ChatHistoryMaintenance.trimEvents({ before }, { limit })` and `sweepIdle({ before }, { limit })` in batches of ≤ 500 (same bounded-delete reason as `J/chat/src/store/sql/maintenance.ts:14-15`);
  - `ConversationList.tsx` gets pin and multi-select through props.
- **Tovu:**
  - chat migration `0004_chat_pinned` (ADR-066), routes `PATCH …/chats/:id {pinned}` and `POST /api/assistant/chats/delete-older`, and the retention policy;
  - the admin dock passes the new props.
- **Assistant tools** (Tovu, using the existing approval card):
  - `site_storage_report` (read-only, `system.read`).
  - `site_storage_cleanup({ categories, olderThanDays?, dryRun = true })`. It always runs as a dry run first; the real run shows the approval card listing counts and bytes. It refuses content categories with "That is your content. Delete it from its own screen."

## 4 · Storage screens

**Admin, per site: Design & System → Storage** (`A/features/storage/`, new).
- A total, then one bar per category, each labelled "Cleaned automatically" or "Yours".
- **Clean up now**: shows a dry-run list first, then runs the automatic categories only.
- **Settings**: chat auto-delete, tool-detail trimming, screenshot days, share-ZIP days.
- Links to Trash, Database (restore points) and Exports for the "Yours" and recovery items.
- Data comes from `GET /api/admin/v1/storage` and `POST /api/admin/v1/storage/cleanup` (`dryRun` defaults to true), both behind `system.read` / `system.write`.

**Desktop, agency view: a "Storage" sheet from the Websites screen header ("Storage: 16.5 GB").**
- **Totals:**
  - all site folders, then per site (folder + its desktop data);
  - desktop data (partitions, previews, Crashpad);
  - "Other Tovu folders" (e.g. `~/Documents/Tovu-backups`).
- **Per site:** "Clean up" runs that site's automatic policies. A running site uses its HTTP API; a stopped site uses a new CLI `tovu storage report|clean --site <dir> --json` under the site lock, following the existing pattern where the desktop runs the CLI (`runOwnerStoreCli`, `D/main/index.ts:337`).
- **"Clean up all sites"** runs them one at a time with progress.
- **"Not in Tovu any more":**
  - orphaned partitions and previews are removed automatically (§2d);
  - untracked folders under the sites home and "Other Tovu folders" are only **listed**, with an explicit **Move to Trash** (`shell.trashItem`, recoverable in Finder). Nothing in this list is ever automatic.
- **Hide/archive:** todo #22's "Hide from list" keeps the folder. Hidden sites keep their data; "Delete website" stays the only erase.

## 5 · Safety rules (tests pin each one)
1. **Content is never deleted automatically.** This covers pages, posts, media originals, themes in use, plugins, live share ZIPs with links, `Tovu-backups` and untracked site folders. The sweeper type has no content kind; content deletion always goes through an explicit screen or the approval card.
2. **Automatic means cache, derived data or an old copy only**: HTTP/code cache, orphan partitions, tool-detail trimming, `incremental_vacuum`, old database copies, purged-media files past grace, temp folders, and expired local ZIPs of Zip-only shares (owner OK).
3. **Recovery window:**
   - migration copies keep the newest 2 plus anything < 7 days, and are never pruned before a new copy succeeds (existing rule at `backup-policy.ts:44-46`);
   - restore points stay at 5, protected ones excluded;
   - Trash stays at 60 days.
4. **Dry run first** for every manual cleanup. Every pass writes a one-line report (bytes and items per policy) to the site log, and the Storage screen shows the last pass.
5. **Never delete what another process holds:**
   - the orphan-partition sweep skips when another instance is live;
   - site cleanup through the CLI takes the site lock;
   - temp-folder cleanup skips folders this process created.
6. **Plain errors:** e.g. "Could not remove old screenshots in .captures: permission was denied." A failure never blocks boot or serving.

## 6 · Defaults needing owner OK

| Q | Decision | Proposed default |
|---|---|---|
| Q1 | Where the site sweeper runs | the owner/serving process, **not** the agent daemon (keeps the `serving-app.ts:80-84` rule) |
| Q2 | Chat defaults | §3 table: pin = keep; trim tool details after 30 days; delete unpinned chats idle 180 days; 7-day grace after upgrade; 200 MB size cap trims only |
| Q3 | Screenshots `.captures/` | delete date folders > 30 days (reverses `capture-files.ts:13-15`) |
| Q4 | Share ZIPs | Zip-only shares: local ZIP removed after 14 days; linked shares kept until revoked |
| Q5 | Pre-migration copies | newest 2 + any < 7 days (today: newest 5, only pruned on the next copy) |
| Q6 | Post revisions | all < 30 days; older: newest 20 per post + published + restore targets |
| Q7 | Desktop cache | 32 MB HTTP cache per site; code cache cleared after updates and when > 64 MB |
| Q8 | Untracked partitions | removed at start (also re-adds a site with a fresh automatic sign-in) |

## 7 · Steps (one implementer each; ordered by disk saved per hour; Jini steps come before the Tovu steps that depend on them)

The desktop steps (ST-1..3) need no Jini change, so they go first: they hold ~80 % of the expected saving.

| ID | Repo | What | Tests first (named) | Mutation that must turn a test red | Files | Depends on | Est | Saves (owner's Mac) |
|---|---|---|---|---|---|---|---|---|
| **ST-1** | Tovu | Desktop cache cap + one-time oversized-cache clear | `caps every site session's disk cache at 32 MB before ready`; `clears a tracked partition over the cap once, then never again` | drop the `appendSwitch` call, or drop the "already cleared" marker check | `D/desktop-storage-limits.ts` (new), `D/main/index.ts` (call before `app.whenReady`), `D/desktop-storage-limits.test.ts` | — | 1.5 h | ~1.5–2.5 GB (caches of the largest partitions) |
| **ST-2** | Tovu | Orphan-partition sweep at start | `removes tovu-site-* folders no tracked site claims`; `keeps every claimed partition and every non-Tovu folder`; `skips the whole sweep while another instance is live`; `missing Partitions folder is not an error` | remove the presence check, or widen the name regex to `^tovu-site-` without the hex length | `D/site-partition-sweep.ts` (new, ≤ 60 lines), `D/main/index.ts:969-978` (second sweep in the `sweep` slot), test | — | 1.5 h | ~2–4 GB (est. 15–30 orphans of 55) |
| **ST-3** | Tovu | Clear partition on delete + code cache after update / > 64 MB | `deleting a site clears its partition storage, cache and code cache after the server stops`; `an update launch clears code and HTTP cache of tracked partitions`; `code cache over 64 MB is cleared at site open` | skip `clearPartition` in the untrack-only arm | `D/project-ipc.ts:1030-1068` (+ `clearPartition` dep at `:1881`), `D/main/index.ts` (deps + update hook), `D/desktop-storage-limits.ts`, tests | ST-1 | 2 h | ~0.3–0.6 GB now; prevents regrowth |
| **ST-4** | Jini | Retention sweeper runner + `filesOlderThan` helper | `runs every policy once at start`; `skips a tick while a pass is running`; `one failing policy does not stop the next`; `dryRun removes nothing`; `stop waits for the pass in flight`; type test: `a policy of kind "content" does not compile` | delete the in-flight guard | `J/platform/src/retention/{sweeper,files-older-than,index}.ts` (new) + `__tests__`, package `exports` | — | 2 h | enabler |
| **ST-5** | Jini | `pruneDatabaseCopies` `keep` / `keepNewerThanMs` + `compactSqlite` | `keep:2 with keepNewerThanMs keeps a 3-day-old third copy`; `default still keeps 5`; `compactSqlite does nothing below 20 % free`; `reclaims free pages under auto_vacuum=INCREMENTAL` | ignore `keepNewerThanMs` | `J/db/src/sqlite/backup-policy.ts:49-65`, `J/db/src/sqlite/compact.ts` (new), `index.ts:8`, tests | — | 1.5 h | enabler |
| **ST-6** | Tovu | Site retention wiring + pre-migration, captures, v1-theme and temp-folder policies + daily report line | `pre-migration copies: keeps newest 2 + any < 7 days on the daily pass, not just after a new copy`; `captures older than 30 days removed, newer kept`; `never starts on a client role`; `stop joins boot drains` | start the sweeper on every role | `W/server/runtime/composition/retention.ts` (new), `serving-app.ts:85` (start beside trash), `W/platform/db/sqlite/content-db.ts:130-139` (pass keep options), `W/features/web-screenshot/capture-files.ts` (doc + policy), tests | ST-4, ST-5 | 2 h | ~0.5–0.9 GB |
| **ST-7** | Tovu | `auto_vacuum=INCREMENTAL` migrations + compaction policy | migration tests in the existing runner style: `chat 0004 / content 0042 switch auto_vacuum and keep every row`; `compaction policy calls compactSqlite after a bulk delete` | omit the one-time `VACUUM` (pragma silently stays 0) | `W/platform/db/migrations/chat/0004_incremental_vacuum.ts`, `W/platform/db/migrations/0042_incremental_vacuum.ts`, `checksums.ts`, `retention.ts`, tests | ST-5, ST-6 | 2 h | frees what later deletes remove |
| **ST-8** | Jini | Chat: `pinned_at`, pin, scoped `deleteOlderThan`, maintenance `trimEvents` / `sweepIdle`, `ConversationList` pin + multi-select props | `pinned chats survive sweepIdle and deleteOlderThan`; `trimEvents keeps message text and caps each tool result at 2 KB`; `deleteOlderThan never crosses owners`; `batches stop at 500` | drop the `pinned_at IS NULL` predicate | `J/chat/src/store/{ports.ts,sqlite/schema.ts,sql/maintenance.ts,sql/store…}`, `J/chat/src/react/components/ConversationList.tsx`, tests | — | 2 h | enabler |
| **ST-9** | Tovu | Chat migration `0005_chat_pinned`, pin and delete-older routes, chat retention policy (idle 180 days, trim 30 days, 7-day grace, 200 MB trim cap) | `PATCH pinned round-trips`; `delete-older refuses without a date and returns the count`; `policy deletes nothing during the 7-day grace`; `size cap trims, never deletes` | remove the grace check | `W/platform/db/migrations/chat/0005_chat_pinned.ts`, `W/server/runtime/composition/modules/assistant-chats.ts`, `W/assistant/persistence/chat-retention.ts` (new), `retention.ts`, tests | ST-8, ST-7 | 2 h | ~0.3–0.8 GB over time (chat.db 52 MB on one site) |
| **ST-10** | Tovu | Admin chat list: pin, multi-select delete, "Delete chats older than…" dialog | `pin shows first and survives reload`; `older-than dialog shows the server's count before deleting` | delete without the confirm step | `A/components/AssistantDock/…` (pass props), new hook file, tests | ST-9 | 1.5 h | — |
| **ST-11** | Tovu | Media file GC: `blob_gc_journal` migration + SQLite `BlobGcJournalRepoPort` + daily delete/unlink policy | `a purged file is removed only after 30 days`; `a file another media row shares (same sha256) is kept`; `unlink after a crash between passes resumes from the journal` | drop the sha256-uniqueness check | `W/platform/db/migrations/0043_blob_gc_journal.ts`, `W/platform/db/repos/media-repo.ts` (adapter), `retention.ts`, tests | ST-6 | 2 h | unknown (all purged media to date) |
| **ST-12** | Tovu | Share ZIP expiry for Zip-only shares | `a Zip-only share's ZIP is removed after 14 days and its row says "Expired, export again"`; `linked shares are kept`; `a share being downloaded is not removed` | expire linked shares too | `W/features/site-backup/share-retention.ts` (new), `share-registry.ts` (`expiredAt`), `retention.ts`, admin export list label, tests | ST-6, Q4 | 1.5 h | ~0.3–1 GB (36 MB on one site) |
| **ST-13** | Tovu | Post revision thinning | `keeps every revision < 30 days`; `keeps newest 20 + published + restore targets for older`; `never touches a post's only revision` | drop the restore-target protection | `W/features/post/revision-retention.ts` (new), `retention.ts`, tests | ST-6, Q6 | 1.5 h | small (content.db 19 MB) |
| **ST-14** | Tovu | `measureSiteStorage` + `GET/POST /api/admin/v1/storage` + assistant tools `site_storage_report` / `site_storage_cleanup` (approval card) | `categories add up to the walked total`; `cleanup defaults to dryRun`; `content categories are refused with the plain message`; `cleanup tool raises the approval card` | default `dryRun` to false | `W/features/storage/{measure,routes,agent-tools,tool-registrations}.ts` (new), route registration in `W/server/runtime/composition/app.ts`, tests | ST-6 | 2 h | — |
| **ST-15** | Tovu | Admin Storage screen | `shows "Yours" vs "Cleaned automatically"`; `Clean up now shows the dry-run list first`; `settings save` | skip the dry-run step | `A/features/storage/` (new), sidebar entry, i18n, tests | ST-14 | 2 h | — |
| **ST-16** | Tovu | CLI `tovu storage report\|clean --site <dir> --json` (stopped sites, takes the site lock) | `refuses a running site with "This website is running; clean it from its Storage screen."`; `JSON matches the HTTP report` | skip the lock | `W/cli/commands/storage/*.ts` (new), tests | ST-14 | 1.5 h | — |
| **ST-17** | Tovu | Desktop Storage sheet (agency view): totals, per site, clean up all, "Not in Tovu any more" with Move to Trash | `totals = folders + desktop data`; `untracked folders are listed, never removed without the button`; `Move to Trash uses shell.trashItem` | auto-remove untracked folders | `D/storage-ipc.ts` (new), `D/renderer/…/StorageSheet*.tsx` (new), preload bridge, tests | ST-2, ST-16 | 2 h | makes `Tovu-backups` (1.1 GB) visible; manual only |

**Critical path:** ST-1 → ST-2 → ST-3 (desktop, ~5 h) can run in parallel with ST-4/ST-5 (Jini) → ST-6 → ST-7 → ST-9…; ST-8 (Jini) can run alongside ST-6.
**Order inside each repo** keeps Jini before the Tovu steps that consume it. ST-8 needs a Jini release (or the `file:../Jini` dev link) before ST-9.

## 8 · Expected GB saved on the measured machine

These are estimates. Each assumption is stated; the appendix commands confirm them in ~1 minute.

| Area | Today | After plan (automatic only) | Saved | Assumption |
|---|---|---|---|---|
| Desktop partitions | 7.4 GB | ~1.0–1.5 GB | **~5.9–6.4 GB** | 15–30 of 55 partitions are orphans (moved, renamed or deleted sites); the rest are capped at ≤ 32 MB cache + ≤ 64 MB code cache + small storage |
| Site folders | 9.1 GB | ~7.6–8.3 GB | **~0.8–1.5 GB** | pre-migration copies 0.3–0.5, captures 0.2–0.3, chats (trim + idle + vacuum) 0.3–0.8 over time, share ZIPs if Q4 OK 0.3–1, purged media unknown; uploads, themes and plugins are content and untouched |
| `Tovu-backups` | 1.1 GB | 1.1 GB | 0 automatic | no product writer; owner decides in the Storage sheet |
| **Total** | **17.6 GB** | **~10–11 GB** | **≈ 6.7–7.9 GB** (up to ~8.9 GB with Q4 and a manual `Tovu-backups` cleanup) | — |

**Steady state for an agency:** desktop data per site is bounded at about 32 MB + 64 MB + storage (~100 MB worst case, typically far less), and goes to zero on delete or move. Site folders grow only with content (uploads, themes, plugins), chats inside the chosen window, 2 database copies + < 7 days, 5 restore points, 60-day Trash, and ~10 MB of logs per log file pair.

## Appendix · Owner-run checks that confirm the estimates (read-only)

```sh
# Orphans: partitions vs. tracked sites (packaged profile; repeat with "tovu-desktop")
ls ~/Library/Application\ Support/Tovu/Partitions | grep -c '^tovu-site-'
du -sh ~/Library/Application\ Support/Tovu/Partitions/*/Cache ~/Library/Application\ Support/Tovu/Partitions/*/"Code Cache" 2>/dev/null | sort -h | tail
# What fills chat.db (tool details vs. text), one site:
sqlite3 ~/Documents/Tovu/fake-test-site/data.nosync/chat.db \
  "select sum(length(content)), sum(length(events_json)), count(*) from ai_chat_messages; pragma freelist_count; pragma page_count;"
# Old copies and captures across all sites:
du -ch ~/Documents/Tovu/*/data.nosync/ops/pre-migrations-*.db | tail -1
du -ch ~/Documents/Tovu/*/.captures | tail -1
du -ch ~/Documents/Tovu/*/data.nosync/ops/shares | tail -1
```

## Out of scope / related
- **Admin tab memory with a long chat** (`development/todos.md:244`, about 1 GB of heap from mounted tool cards). That is memory, not disk. Trimming tool details (ST-9) makes old chats lighter, but the fix belongs to the chat UI todo.
- **Import history retention:** P5.
- **Deduplicating bundled agent plugins and theme originals across sites:** a separate design, because it would change site portability.
