REVISED r62t-rev-p5: 6 SOL sheets (3 Jini / 3 Tovu), 2 OPUS sheets

Verified against `origin/integ/merge-21-2026-11-24` at Tovu `7c87b3c3f9` and Jini `010c8cd874`. No files changed. No tests, builds, installs, or type-checks ran.

**Build order.** T1.J → T2.J → T3.J → T1.T → T2.T → T3.T → T4.J → T4.T. T2 ships paging on the legacy store and exercises indexed behavior in fixtures. T3 prepares backfill without selecting production index authority. T4 wires production authority and ships with `"rollback"` selected. Q5 is decided. The owner accepts the pre-P5 downgrade limitation with a release note and no freeze. Opus lands the one-line enablement commit only after copied-legacy-folder verification in Chrome and packaged Electron passes.

**Conventions for all sheets.** `J` means Jini `packages`, `W` means Tovu `apps/website/src`, `A` means Tovu `apps/admin/src`, and `B` means `W/features/site-backup`. Paths are relative to the named repo. Follow functions by name if lines move. An omitted second argument uses `_optional: Record<string, never> = {}`. Keep new public APIs and callbacks on two object arguments and preserve existing pads. Inject implementation dependencies, use direct owner imports, and keep why-comments with moved code. No re-export shells, native drivers, Express, Tovu imports, or sibling-package implementation imports in the Jini feature. Keep new functions at most 80 lines and complexity at most 10. Keep themes and the product screen in Tovu. No P9 extraction is a prerequisite.

For each new Jini subpath, use `types` / `import` / `default` entries pointing at the owning `dist` file and add the corresponding `jini` target classification. Baselines are under Jini `api-baseline/`. Sol writes the named witnesses and leaves mutations unapplied. Opus runs the originals and each red mutation, regenerates the named API baselines with the Jini API updater after building, and checks the diff. For the migration pin, Sol leaves a placeholder. Opus generates and verifies it.

## P5-T1.J — Payload namespace

BUILDER: SOL

**Files.** In `J/devops/src/backup/site/import-index/`, add `payload-namespace.ts`, `errors.ts`, and `__tests__/payload-namespace.test.ts`. Add universal subpaths `./backup/site/import-index/payload-namespace` and `./backup/site/import-index/errors`. Changeset `p5-t1-import-payloads.md`, devops patch. Baseline `jini-ai__devops.json`.

**Tests first.**

| Exact test | Named red mutation |
|---|---|
| `staging budget and orphan sweep never enumerate the history directory` | Read the root instead of `payloads/` for budget counting. Tovu also pins the real caller. |
| `interrupted move (ZIP moved, metadata not) then restart keeps the upload claimable and owner setup completes` | Sweep before ensure. Jini tests the split rename and preserved files. Tovu pins actual owner completion. |
| `active payloads survive the move; stale ones are removed` | Drop the metadata move pass. |
| `second open does not readdir the history root` | Ignore the marker on a fresh instance. |

**API.** Define synchronous `ImportPayloadFs` with `readdir({dir}) → string[]`, `kind({file}) → "file" | "directory" | "other" | "missing"` using no-follow inspection, `rename({from,to})`, `rm({file,recursive})`, `mkdir({dir,mode})`, `chmod({file,mode})`, `writeExclusive({file,mode})` for an empty file, `fsyncFile({file})`, and `fsyncDir({dir})`. The host supplies every port.

- `payloadPaths({root}, {}) → {dir,marker,upload,uploadMeta,stage}`. Set `dir=<root>/payloads` at `0700`, `marker=<root>/payloads/.namespace-v1`, `upload({uploadId},{})=<dir>/<uploadId>.upload.zip`, `uploadMeta({uploadId},{})=<dir>/<uploadId>.upload.json`, and `stage({importId},{})=<dir>/<importId>.stage`. Only canonical lowercase UUIDs may become payload filenames. The moves preserve the basenames verified in Tovu `B/import-registry.ts:8,98–99`.
- `ensurePayloadNamespace({root,paths,fs},{}) → void`.
- `expirePayloads({paths,fs,clock,readUpload,statusOf,report},{}) → void`. `readUpload({uploadId},{}) → JsonFileRead` uses the Core contract. `statusOf({importId},{}) → "active" | "terminal" | "unreadable" | "absent"`. `report({operation,error},{})` receives a fixed operation label.
- `countStagedPayloads({paths,fs},{}) → number`.
- `new ImportHistoryUnavailable({code,status,message},{cause?} = {})`. Start the closed code union with `IMPORT_PAYLOADS_UNMOVABLE`. Status is `503 | 507`. Preserve the original cause for the redacting incident sink, never in caller copy.

**Build.** Under the existing workspace lock, check the marker first. If absent, ensure the private payload directory and read the root once. Move matching regular UUID ZIPs, then regular metadata files, then real stage directories. A duplicate destination wins only if both entries have the expected type. A wrong type at an owned destination refuses preparation. Do not overwrite or traverse it. Flush the payload directory, then the root. Create `.namespace-v1` exclusively at `0600`, fsync the file, and flush the payload directory again. Accept `EEXIST` only for the expected marker. Write no marker before the moves. The host may cache successful readiness. Split classification, pass, move, and marker helpers.

Expiry scans only `payloads/`. Expire metadata with `null` or `createdAt + 3_600_000 < now`, removing ZIP before metadata. A missing or unreadable metadata file makes its ZIP an orphan. Keep stages whose by-ID owner is unreadable. Remove stages only for terminal or absent owners. Isolate cleanup failures per entry and preserve unknown entries. Count only matching ZIPs and stage directories. Preparation failure leaves preparation retryable.

| Preparation failure | Code and status | Exact message |
|---|---|---|
| `EACCES` / `EPERM` | `IMPORT_PAYLOADS_UNMOVABLE` / 503 | Imports are paused because the app could not move its import files. Check that the app can write to its data folder, then try again. |
| `ENOSPC` | `IMPORT_PAYLOADS_UNMOVABLE` / 507 | There is not enough free disk space to prepare imports. Free up space and try again. |

**Why-comments.** ZIP precedes metadata on write and on migration. The marker makes root enumeration a one-time migration cost. An unreadable owner is not evidence that its stage is orphaned. Atomic rename is same-volume and directory fsync has platform limits.

## P5-T2.J — SQL index, replay, pagination and neutral surfaces

BUILDER: SOL

**Files.** Add `J/core/src/contracts/site/site-import-history.ts`. In `J/devops/src/backup/site/import-index/`, add `migrations/site-imports-v1.ts`, `migrations/checksums.ts`, `schema.ts`, `open.ts`, `rows.ts`, `store.ts`, `paging.ts`, `admission.ts`, `sweep.ts`, and `__tests__/{schema,store,paging,admission,sweep}.test.ts`. Extend `errors.ts`. Extend `J/cms/src/admin-http/routes/system/site-imports.ts` and `J/cms/src/admin-http/routes/system/__tests__/site-imports.test.ts`. Add `J/devops/src/backup/site/react/ShowMoreImports.tsx` and its colocated test. Extend `optionalPeers.react` in `J/devops/package.json:92` to name this new React feature and its import subpath alongside `./deploy/react`.

Export Core universal `./contracts/site/site-import-history`, devops node `./backup/site/import-index/{open,rows,store,paging,admission,sweep}`, and devops browser `./backup/site/react/ShowMoreImports`. No public schema or migration export. CMS already exports the route owner. Changeset `p5-t2-indexed-import-history.md`, Core/devops/CMS minor. Baselines `jini-ai__core.json`, `jini-ai__devops.json`, `jini-ai__cms.json`. Do not change Admin’s manifest or baseline.

**Tests first.** Use structural statement and opener fakes in Jini. Tovu supplies real-driver and host-effect witnesses.

| Exact test | Named red mutation |
|---|---|
| `history boundary: listed at 30d − 1 ms, hidden at exactly 30d` | Make the visible comparison inclusive. |
| `day 365 + 1 ms frees the key` and `fence still conflicts at 365d − 1 ms` | Use inclusive fence visibility. Include exactly 365d in the inputs so the mutant fails. |
| `replay at day 200 returns the stored outcome but the row is not listed` | Bypass replay lookup. |
| `REQUEST_CONFLICT leaves the upload unconsumed and makes no HTTP call` | Consume before checking the fence. Assert budget and new-row callbacks are also untouched. |
| `admission insert failure leaves no fence` | Split fence and row inserts into two transactions. |
| `tied timestamps page with no duplicates, skips or cross-principal rows` | Drop the import-ID tie-breaker. Use 120 rows, seven shared timestamps, and three principals, with more than 50 rows for one principal so size 50 actually turns a page. |
| `invalid cursor (bad base64, v2, unsafe int, non-uuid) → INVALID_CURSOR` | Catch and treat the cursor as absent. |
| `recovery issues one indexed active-row query` | Remove the active-status predicate. |
| `needs-owner past deadline fails with "Owner setup expired" and its stage is removed` | Use `<=` for owner expiry or skip stage removal. |
| `site-imports-v1 DDL checksum and applied ledger are pinned` | Change one DDL byte, or add an unknown applied ID to the ledger and assert the open refuses. |

Add route tests for `{}`, one cursor, duplicate/array/unknown query keys, missing authenticated context, and dispatch with the authenticated principal. Add a component test that the supplied button renders only with a cursor and invokes the supplied loader once per press.

**Shared contract.** Move types, not runtime. `SiteImportRecord` keeps the merge-21 shape from `B/import-registry.ts:10–29`. Reference Core `SiteCreationAllocation` and use structural readonly `{path:string;kind:string}` warning elements. `SiteImportSource` is `{url:string} | {uploadId:string}`. `SiteImportStatus` is `"verifying" | "needs-owner" | "creating" | "ready" | "failed"`. `SiteImportView` keeps the shape at `B/import-backend-steps.ts:19–26`, including both `state` and `status` and required `credentialWarnings`. Add `SiteImportPage<T = SiteImportView> = {imports:T[];nextCursor?:string}` and `SiteImportPageInput = {principalId:string;cursor?:string;limit?:number}`. `ImportHistoryPolicy` is readonly `{cutoverPolicy:"enable"|"rollback";historyVisibleMs:2_592_000_000;replayFenceMs:31_536_000_000;legacyRetireMs:2_592_000_000;sweepOnClockRollback:false}`. Define `MinimalImportOutcome` as a pick of `importId`, `status`, `newSiteId`, `newSiteName`, `displayName`, `createdAt`, `source`, `adminUrl?`, `error?`, `hasEncryptedKeys?`. No allocation, warnings, request ID, digest, passwords, or credentials.

**Schema.** Dedicated `<ws>/site-imports.db`. It creates itself on a create-capable open. Do not touch the Tovu content chain, its `checksums.ts` or `source-digests.ts`, the Drizzle journal, `freshSiteOperations`, or the database-journal schema. No VACUUM, chat deletion, or login deletion. Use a neutral ledger name, following `J/commerce/src/payments/ledger/migrations/index.ts:20–21,66–71` and `J/db/src/owner-store/migrations/index.ts:6`. Keep the ordered step array and ledger as the history. Do not add `migrations/journal.ts` or a `when` stamp.

```ts
export const IMPORT_INDEX_V1_DDL = `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE site_import_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT;
CREATE TABLE imports (import_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, request_id TEXT, status TEXT NOT NULL CHECK (status IN ('verifying','needs-owner','creating','ready','failed')), created_ms INTEGER NOT NULL, settled_ms INTEGER, expires_ms INTEGER NOT NULL, row_json TEXT NOT NULL, CHECK ((status IN ('ready','failed')) = (settled_ms IS NOT NULL))) STRICT;
CREATE INDEX imports_page ON imports (principal_id, created_ms DESC, import_id DESC);
CREATE INDEX imports_active ON imports (status, expires_ms) WHERE status IN ('verifying','needs-owner','creating');
CREATE INDEX imports_settled ON imports (settled_ms) WHERE settled_ms IS NOT NULL;
CREATE TABLE replay (principal_id TEXT NOT NULL, request_id TEXT NOT NULL, fence_kind TEXT NOT NULL CHECK (fence_kind IN ('sha256','upload','origin')), fence_value TEXT NOT NULL, import_id TEXT NOT NULL, accepted_ms INTEGER NOT NULL, outcome_json TEXT NOT NULL, PRIMARY KEY (principal_id, request_id)) STRICT, WITHOUT ROWID;
CREATE INDEX replay_expiry ON replay (accepted_ms);
PRAGMA user_version = 1;`;
```

Export the literal only from the internal migration file. The test imports `IMPORT_INDEX_V1_DDL` and hashes its UTF-8 string with LF separators, no added indentation, and no trailing LF inside the literal. Hash the string, not the source or emitted JS, so a comment does not affect the pin. Sol leaves `OPUS_PIN_PENDING` in `migrations/checksums.ts` for `site-imports-v1`. Opus re-derives both reviewer values before relying on them and installs the verified DDL-string pin. The reviewer’s DDL-string value is `483c2b21e3343c4b834bc499ca5136c1b7cb664a99fbd4cca6286460619549fb`. The whole-file comparison value is `b17023c34d6a0fe0f86d90e28ee436489a241e544a323bbb9d1298a9c50b8edb` for exactly the code block with one final LF and no `@file` header or comments. Do not switch the test to whole-file hashing.

`migrateImportIndex({db,clock},{})` permits version zero only on a create-capable open. Use `BEGIN IMMEDIATE`, recheck version inside, execute the DDL, then insert the ledger and meta rows in the same transaction. The inserts are `INSERT INTO site_import_migrations(id,checksum,applied_at) VALUES('site-imports-v1',<pin>,clock.nowMs())` and `INSERT INTO meta VALUES('schema','site-imports-v1')`. Bind the verified pin and clock result as SQL values. A v1 open verifies the ledger ID/checksum and `meta.schema`. Refuse a missing, mismatched, or unknown applied step. A future `user_version` is `IMPORT_HISTORY_NEWER`, not a repair path.

**Open, store, and paging.**

- `openImportIndex({file,open,clock,policy,checkIntegrity},{mustExist=false,readonly=false} = {}) → {db,store,close({},{})}`. Use Core `SqliteSyncOpener` behind the two-object factory. Writers set WAL, FULL, 5000 ms busy timeout, and foreign keys in that order. Tolerate a non-WAL return. A read-only reopen uses `fileMustExist:true`, neither migrates nor sets writer pragmas, and applies only connection busy timeout and foreign keys. Inject `checkIntegrity({db,file},{})` for `quick_check(1)` once per successfully checked DB identity per process, not once across workspaces. Close acquired handles on failure without masking the original failure.
- `createImportIndexStore({db,clock,policy},{}) → ImportIndexStore` borrows the handle. `get({importId,principalId},{})` uses both keys with no visibility filter. `statusOf({importId},{})` is private maintenance. `activeRows({},{})` selects only `verifying` and `creating`. `dueOwnerSetups({now},{})` selects `needs-owner` with `expires_ms < now`. Query errors must not look like absent rows.
- `put({row,beforeWrite},{})` checks prior status and immutable identity before invoking the current operation’s `beforeWrite({},{})`. Allow new → verifying, verifying → verifying/needs-owner/failed, needs-owner → creating/failed, creating → creating/ready/failed, and ready → ready for start-result fields only. No failed exit. In one immediate transaction upsert the row and update its fence outcome by principal, request ID **and** import ID. Preserve first settlement with `COALESCE` and never update acceptance time. `assertTransition`, `toRowParams`, `minimalOutcome`, and `isTerminal` own conversion. Terminal URL sources keep only origin in both detail and outcome.
- `encodeCursor({createdMs,importId},{})` and `decodeCursor({cursor},{})` use canonical, unpadded base64url of ASCII `v1.<decimal ms>.<lowercase UUID>`. Accept at most 96 characters, URL-safe alphabet, canonical round-trip bytes, 1–15 decimal digits, and a safe nonnegative integer. Refuse invalid input with `INVALID_CURSOR`. Use a small ASCII codec, not a Node or driver import.
- `listPage({db,clock,policy,principalId,cursor?,limit?},{}) → SiteImportPage<SiteImportRecord>`. Clamp integral limit to 1–50, default 50. Filter by principal and visibility, then tuple bound `(created_ms,import_id) < (?,?)`. Order both descending and fetch `n+1`. Emit the last returned row’s cursor only if there is more. Active rows are visible. Terminal rows are visible only while `now < settled + historyVisibleMs`. Read the clock once per page. `listAll({readPage},{})` is the array compatibility loop, not the network route.
- `lookupFence({db,policy,principalId,requestId,now},{})`, `sameFence({fence,source,digestSource},{})`, and `admitImport({db,clock,policy,principalId,requestId?,source,digestSource,requireBudget,makeRow,beforeWrite},{})`. Inject the host URL digest and `makeRow({now},{})` for ID allocation, display copy, and the one-hour owner deadline. Look up a live fence before budget, ZIP I/O, or row creation. Match SHA-256, exact upload UUID, or normalized origin for a migrated origin-only fence. Changed source conflicts. A match returns `{kind:"replay",row}` using same-principal visible detail, or `{kind:"replay",outcome}` using the minimal outcome. Do not write on replay. Otherwise check budget, call `beforeWrite`, then delete only the exact expired key if present, insert the keyed fence if any, and insert the verifying row in one immediate transaction. Return `{kind:"admitted",row}`. Consume or download only after commit.
- `sweepExpired({db,clock,policy},{})` skips physical deletes if `now < meta.last_sweep_ms`. Delete due terminal rows at `settled_ms <= now - historyVisibleMs` in batches of 500. Delete expired replay by composite PK, not `rowid` on a `WITHOUT ROWID` table. Use one immediate transaction per batch and upsert the high-water mark only after both loops succeed. Query visibility and fence liveness do not depend on physical sweep. The 30-day sweep is owner-decided retention and needs no approval card.

**Failure modes.** Supply the exact caller-safe copy as fields on the existing host args. `mapSqliteError({error,messages},{})` also maps `SQLITE_LOCKED` to busy, preserves `IMPORT_HISTORY_NEWER`, and propagates unclassified errors to the ordinary incident path. Refusals and NOT_FOUND are not storage incidents.

| Condition | Code and status | Exact plain message | ERR-ID |
|---|---|---|---|
| Bad cursor | `INVALID_CURSOR` / 400 refusal | This list of imports changed. Reload it to see the newest imports. | No |
| Limit outside 1–50 | Clamped | — | — |
| Same key, different source | `REQUEST_CONFLICT` / 400, existing refusal | requestId already belongs to another source. | No |
| `SQLITE_BUSY` after 5 s | `IMPORT_HISTORY_BUSY` / 503 | Import history is busy. Try again in a moment. | Yes |
| `SQLITE_FULL` / `ENOSPC` | `INSUFFICIENT_STORAGE` / 507 | There is not enough free disk space to record the import. Free up space and try again. | Yes |
| `SQLITE_CORRUPT` / `NOTADB` / failed `quick_check` | `IMPORT_HISTORY_DAMAGED` / 503 | Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID. | Yes |
| `user_version > 1` | `IMPORT_HISTORY_NEWER` / 503 | Import history was written by a newer version of the app. Update the app to continue. | Yes |

**Neutral HTTP and React.** In the existing CMS route owner add `siteImportListRouteSpec = defineJsonRoute<SiteImportListQuery,SiteImportPage,SiteImportListRouteDeps,SiteImportListPrincipal>(...)`. Core `JsonRouteSpec` and `defineJsonRoute` are now at `J/core/src/contracts/server/json-route.ts:121,161`. Use lowercase `get`, path `/api/admin/v1/workspaces/:workspaceId/site-imports`, and authenticated context `{principalId:string}`. The only route dependency is `listPage:(required:SiteImportPageInput,optional?:Record<string,never>)=>Promise<SiteImportPage>`. `parseSiteImportListQuery({query},{}) → Result<{cursor?:string}>` accepts only a single optional cursor of length 1–96 and the permitted alphabet. Canonical decode stays in paging. Use existing Core result helpers, fail closed without context, and return `INVALID_CURSOR` for invalid query shape. Tovu maps that error to its flat response.

`ShowMoreImports({nextCursor,loading,onLoadMore,Button,label},{})` returns `null` without a cursor. Otherwise it renders the injected `Button` slot with `children`, `onPress`, `disabled?`, and `pending?`. `onLoadMore({},{})` returns `void | Promise<void>`. The leaf has no Admin implementation import, custom hooks, translations, or Tovu policy.

**Why-comments.** Settlement and acceptance are distinct clocks. A fence outlives detail. A cursor never selects a principal. A ready row and its fence commit together. The composite PK is required for replay deletion. The injected slot keeps domain UI outside Admin.

## P5-T3.J — One-transaction backfill

BUILDER: SOL

**Files.** Add `J/devops/src/backup/site/import-index/backfill.ts` and `J/devops/src/backup/site/import-index/__tests__/backfill.test.ts`. Export node `./backup/site/import-index/backfill`. Changeset `p5-t3-import-backfill.md`, devops minor. Baseline `jini-ai__devops.json`. Do not write external authority state from this module.

**Tests first.**

| Exact test | Named red mutation |
|---|---|
| `backfill crash before commit leaves no marker and no rows` and `interrupt the backfill and restart → exactly one copy of each row and fence` | Commit the marker separately. Inject interruption mid-rows, before commit, and after commit before external state publish. For the restart case, include a candidate DB already holding a committed marker from a prior attempt. Also check that plain meta INSERTs fail the rerun witness. |
| `origin-only key still fences a different source` | Skip no-digest URL rows when creating fences. |
| `unreadable row blocks cutover and keeps its file` and `malformed-but-parseable row blocks cutover` | Skip bad records and cut over anyway. |
| `active verifying/creating recovery keeps its allocation` and `needs-owner row and its stage survive backfill; owner setup completes after cutover` | Apply the terminal cutoff to active records or drop `creation`. Jini pins row preservation. Tovu pins recovery and actual owner completion. |
| `two legacy rows with one requestId: newest fences, both histories listed` | Sort duplicate owners ascending. |

**API and build.** `backfillImportIndex({root,fs,readJson,openCandidate,clock,policy,newDbId,log},{}) → {state:"blocked"} | {state:"cutover";dbId:string;cutoverAt:number;backfillCount:number}`. The caller holds `.import.lock`. `fs` needs only root enumeration. `readJson({file},{}) → JsonFileRead` does not quarantine. Open the owned candidate with `openCandidate({},{}) → {db,close}` only after validation. Inject `newDbId({},{})` and `log({message,counts},{})`.

- `scanLegacy({root,fs,readJson},{})` reads UUID `.json` files in slices of 500. `validateLegacyRow({value,id},{})` requires matching canonical `importId`, nonempty principal, known status, finite parsed creation time, safe integer owner deadline, exactly one HTTPS or canonical upload source, optional request ID matching `/^[a-zA-Z0-9_-]{1,128}$/`, optional 64-hex digest, and string `creation.siteId` if a creating allocation is present. Reject URL credentials and fragments. A file that disappears after enumeration is unreadable for this attempt. Leave legacy files and stages unchanged. If blocked, log counts and “An import record could not be read; imports keep using the old store until it is fixed.” Warn above 20,000 rows. No paths or contents in logs.
- `deriveBackfillRows({rows,now,policy},{})` derives active/visible detail and live fences independently. Active rows keep allocation, deadline, and stage ownership. Use legacy `createdAt` for terminal settlement and fence acceptance. Strip terminal URL details. Fence by lowercase SHA-256 if present, exact upload UUID for uploads, otherwise canonical origin. Use the index `minimalOutcome` constructor. `pickFenceOwners({candidates},{})` chooses newest `(createdMs,importId)` descending in binary string order per `(principalId,requestId)`. Keep all eligible duplicate details.
- `commitBackfill({db,rows,fences,dbId,now},{})` runs inside the same `BEGIN IMMEDIATE`: `DELETE FROM imports; DELETE FROM replay; DELETE FROM meta WHERE key='last_sweep_ms';`, insert rows and fences, then for each of `db_id`, `cutover_at`, `backfill_count`, and `schema` run `INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`. Read `backfill_count` using `SELECT COUNT(*) FROM imports` inside the transaction. Set `schema` to `site-imports-v1`. Never advance external state in this transaction. Roll back on failure. `SQLITE_FULL` logs a safe storage code and returns blocked so legacy can operate. Other failures retain their index classification. Close the candidate on every exit.

**Why-comments.** Legacy has no settlement timestamp. One transaction makes the marker proof of a complete candidate. Upserts cover both the schema row created by migration and all four meta rows left by a previously committed attempt. Bad JSON is evidence to preserve. Newest-wins matches historical scan precedence and makes ties deterministic.

## P5-T1.T — Wire payloads into the current Tovu registry

BUILDER: SOL

**Files.** Change `B/{import-registry,import-backend,import-backend-steps}.ts`, `W/server/runtime/composition/site-import-backend.ts`, `W/server/inbound/admin-http/routes/system/site-imports.ts`, and `W/server/inbound/shared/admin-failure.ts`. Add `W/server/runtime/composition/site-import-payload-fs.ts`. Update `B/__tests__/{import-registry.unit.test,import-registry-notices.unit.test,import.fixture,import-interruption.fixture,import-interruption.integration.test}.ts` and `W/cli/__tests__/integration/import-local.integration.test.ts`. Extend `B/__tests__/import-history-retention.unit.test.ts`. Consume `@jini-ai/devops/backup/site/import-index/{payload-namespace,errors}`. No manifest, changeset, or API-baseline change.

**Tests first.** Add `staging budget and orphan sweep never enumerate the history directory` and `interrupted move (ZIP moved, metadata not) then restart keeps the upload claimable and owner setup completes` to the retention suite. Mutate budget counting back to the root and move sweep ahead of namespace ensure, respectively. In the restart fixture, write legacy metadata at root and its ZIP under `payloads/`, omit the marker, restart, and assert owner setup actually finishes. Move ordinary stage and ZIP fixtures under `payloads/`. Keep explicit migration fixtures at root. Preserve registry expiry assertions, with mutation putting legacy owner expiry back in `expirePayloads`. Keep the notices test on the actual durable JSON binding with `saveUpload` under the lock.

**Build.**

- `new SiteImportRegistry({directory,payload:{fs,clock,lock,readJsonAt,writeJsonAt}},{log?} = {})`. Use Core `FileLockPort`. Bind `readJsonAt({file},{}) → JsonFileRead` and `writeJsonAt({file,value},{}) → void` to the existing notices and durable JSON owner. Production composition and all direct fixtures pass the bag. Keep `directory` for legacy, add `payloadDirectory`, split legacy history and upload metadata paths, and validate IDs before forming paths. Share the clock between upload creation and TTL. Keep non-recursive private history handling.
- `exclusive({run},{})` retains the existing lock with `staleMs:Infinity`. Ensure the namespace before `run` and before backend reconciliation. Cache successful readiness per registry. `expirePayloads({},{})` binds by-ID status and translates unreadable to `unreadable`. `expireHistory({},{})` preserves owner expiry and terminal-source cleanup. `expire({},{})` composes both for existing legacy admission, owner completion, list, and tidy. Budget does not depend on `expire`.
- `requireStagingBudget({registry},{})` runs payload expiry and `countStagedPayloads`, refuses at four with current copy, and checks free space on `payloadDirectory`. Do not indirectly enumerate the root through `registry.expire`. Keep guarded download, ZIP `wx` before metadata, and existing consume and restore behavior.
- `createSiteImportPayloadFs({},{}) → ImportPayloadFs` binds Node fs, same-volume rename, no-follow classification, exclusive marker creation, and file fsync. Directory sync follows existing best-effort platform behavior. Server and CLI use one composition root, `composeSiteImportBackend`, with the workspace root at `W/server/runtime/composition/site-import-backend.ts:39`.
- Widen `FailureOptions.status` in `W/server/inbound/shared/admin-failure.ts:18` from `503` to `503 | 507`. Explicit 507 uses the normal ERR-ID path, not the default `DatabaseDiskSpaceError` branch at `:79`. In the existing `importFailure` adapter, recognize `ImportHistoryUnavailable` before generic parser classification. Pass safe code, message, status, and `field:"message"` to `sendAdminFailure` without sending diagnostics. Tools continue rethrowing non-refusals to the existing reporter.

**Why-comments.** Keep the ZIP-before-metadata warning and lock-liveness rationale. The staging cap counts disposable payloads, not history. A lock-free pre-migration view can transiently omit stage warnings. Legacy history expiry stays separate until indexed mode.

## P5-T2.T — Connect the index seam and ship paged surfaces

BUILDER: SOL

**Files.** Change `B/{import-registry,import-backend,import-backend-steps,tool-registrations}.ts`, `W/server/runtime/composition/site-import-backend.ts`, and `W/server/inbound/admin-http/routes/system/site-imports.ts`. Add `B/__tests__/import-history-index.fixture.ts`. Extend `B/__tests__/import-history-retention.unit.test.ts` and `B/__tests__/import-tools.unit.test.ts`. Update route doubles and wire witnesses in the existing `site-imports*.test.ts`, `W/server/inbound/admin-http/routes/system/__tests__/site-import-errors.unit.test.ts`, and `W/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`. `FailureOptions.status` already admits 507. No change to `admin-failure.ts` in this sheet.

Change these Admin files:

- `A/features/sites/SiteImportTab.tsx`
- `A/features/sites/site-transfer-i18n.ts`
- `A/features/sites/hooks/site-transfer-dependencies.hooks.ts`
- `A/features/sites/hooks/use-site-import-state.hooks.ts`
- `A/features/sites/hooks/use-site-transfer.hooks.ts`
- `A/features/sites/hooks/site-import-controller.ts`
- `A/features/sites/hooks/site-transfer-rules.ts`

Extend the existing site transfer and i18n suites. Create `openapi/022-site-imports.yaml`, add it to `openapi/README.md`, and update `W/assistant/__tests__/fixtures/moved-tools.golden.json`. No manifest, changeset, or package-baseline change.

**Tests first.** Preserve both existing Q4 titles at `B/__tests__/import-history-retention.unit.test.ts:27,42`:

- `Q4 durable replay: after a restart at day 31 the same request returns the stored outcome; a changed source conflicts before any effect`.
- `Q4 expiry: terminal history leaves the list after 30 days, replay still works, replaying does not extend it, and the key is reusable after 365 days`. Mutate first-settlement `COALESCE` away or write on replay.

Use real SQLite to pin the 30-day and 365-day strict boundaries, day-200 replay without visible history, conflict before ZIP or HTTP effects, admission rollback leaving no fence, tied-timestamp pages without cross-principal rows, malformed cursor refusal, one indexed active-row query, and strict owner expiry with stage removal. Mutate the comparison boundaries, bypass replay, consume before checking the fence, split the transaction, drop the import-ID tie-breaker, treat bad cursor as absent, remove the recovery predicate, and use inclusive owner expiry or skip stage removal, respectively. For paging use 120 rows over seven shared timestamps and three principals, with at least one principal exceeding 50 rows. Also add:

| Exact test | Named red mutation |
|---|---|
| `two workspaces under one appData never see each other's rows or fences` | Remove `workspaceId` from the DB path. |
| `list, retry and expiry work with history-dir enumeration failing` | Leave `registry.expire` on indexed list. Install the failing root read after setup and exercise ordinary expiry/tidy before retirement is due. |
| `site import paging preserves gate precedence and private response headers` | Validate the cursor before the workspace/auth/backend gate, or skip the publish-trust branch. |
| `load more cannot append a stale page after refresh or principal change` | Remove the scope/generation check. |

**Registry and backend.** Import the types directly from `@jini-ai/core/contracts/site/site-import-history`. Repoint source/view callers and remove the forwarding export from the backend. Add `listPage(required:SiteImportPageInput,_optional={}) → Promise<SiteImportPage>` to `SiteImportBackend`. Keep the array `list({principalId},{}) → Promise<SiteImportView[]>` and synchronous `get`.

Add optional structural authority `history?:{read<T>({run},{})→T;locked<T>({run},{})→Promise<T>}` to registry args. A read session is `{kind:"legacy"}` or `{kind:"index",db,store}`. A locked session adds mode-specific maintenance closures and indexed `beforeWrite({},{})`. Production omits the seam through backfill preparation and therefore stays legacy. Only the fixture supplies the real index and a no-op write fence. Acquire locked authority inside `.import.lock` and pass that session through put, recovery, admission, expiry, and tidy. Sync get and indexed list use the read session. Legacy `listPage` retains the lock and refusal behavior, sorts by timestamp then ID descending, and slices with the same cursor. Legacy array list may take one snapshot. Indexed array list loops pages without the import lock. Indexed reads project overdue pending owner rows as failed without a write and omit stale setup URLs and warnings.

The indexed branch never calls the JSON history scan, even indirectly. `reconcileInterruptedImports({registry,workspace,put,activeRows},{})` uses the session’s active query, with `registry.list({})` filtering only in legacy. Indexed owner expiry stores `"Owner setup expired"` and removes its stage only when the deadline is strictly `< now`. Keep lock-entry recovery of unrelated interrupted rows and the in-process BUSY guard. Conflict causes no admission write, ZIP consumption, or HTTP request. Report committed admission once and only then consume and verify. A replay maps stored detail or minimal outcome to the public view, supplies `credentialWarnings:[]` for minimal outcomes, and never rereads the stage. Run physical sweep on fresh indexed admission and tidy, not on replay or read. A maintenance failure is not permission to recreate an import. Keep `tidyImportDatabases`.

Bind `openNativeSqlite` at `W/platform/db/kernel/drivers/sqlite.ts:48`, not the Kysely journal kernel. Adapt the host `open({file,options},{})` seam to Core `SqliteSyncOpener`. Use the same per-workspace root as the registry. Create only under `.import.lock` in the `0700` root. Precreate the missing DB exclusively at `0600`, verify regular file type and owner-only mode, and leave WAL/SHM to the driver in that root. Fixture handles close in teardown. Production authority will use scoped handles rather than continue using a stale descriptor after removal or exchange of the DB.

**HTTP.** Replace only the hand-written GET in `registerListAndImportRoutes` at `W/server/inbound/admin-http/routes/system/site-imports.ts:86–89`. Mount the CMS `siteImportListRouteSpec` with `mountJsonRoute` from `J/http-kit/src/adapter.ts:37`. Leave POST, raw upload, and owner gates in place. Factor `gateImport` to take `{deps,res,workspaceId,step,permission}` so GET can call it from `authenticate({raw,res},{})` without `res.req`. Old callers extract those fields from their requests. If the gate has answered, throw a private sentinel ignored by `onError`. Otherwise return the ID from `getAuthedPrincipal(res)`. Bind a mount-local `listPage` closure for the current gated backend. Query data never supplies identity.

Use `answerImportFailure({deps,res,error,step},{})` in both adapters. `onReturnedError` sends HTTP 400 with `{code:"INVALID_CURSOR",message:"Import history failed: This list of imports changed. Reload it to see the newest imports."}`. Map backend decode refusals to the same body. Preserve no-store, nosniff, `noindex, nofollow`, and no-referrer on every GET outcome, grant-aware authorization, and the old fixed 404/503 bytes. Change list test doubles to `listPage` without changing existing wire expectations. OpenAPI documents optional cursor string with maximum length 96, `imports`, optional `nextCursor`, flat 400 `INVALID_CURSOR`, authorization/workspace refusals, and correlated 503/507. Adjust route-table pins only for an actual registration-name or order change.

**Tool.** Keep `site_import_list`, its approval, and `system.read`. Add only `cursor: {type:"string",maxLength:96,description:"nextCursor from the previous page."}` to its schema, keeping `additionalProperties:false`. In `B/tool-registrations.ts:242`, replace the no-fields refusal with `new SiteShareRefusal({code:"INVALID_INPUT",message:"site_import_list accepts only cursor."})` for unknown fields. Reject unknown fields after authorization, validate the optional cursor, call `listPage` using `ctx.principal.id`, and return the page directly. Keep the normal refusal envelope and incident reporter. The golden fixture at `W/assistant/__tests__/fixtures/moved-tools.golden.json:535` is `762098`. The 92-byte addition makes the expected value `762190`. Update only that scalar. Opus confirms it against the real catalog. Leave tool approval/search metadata unchanged.

**Admin.** Change the host port to `listImports({cursor?},_optional={}) → Promise<SiteImportPage<SiteImport>>`. Encode the query with `URLSearchParams`. Pass `{}` at every first-page call, including the query in `A/features/sites/hooks/use-site-import-state.hooks.ts:15`, the retry in **`A/features/sites/hooks/site-transfer-rules.ts:65`** (`port.listImports()` → `port.listImports({})`), and direct port tests. Do not edit the like-named `A/features/sites/site-transfer-rules.ts` for this change.

Keep the principal-scoped first-page query. Implement `useImportHistoryPages({scopeKey,firstPage,listImports,onReset,t},{})` in `A/features/sites/hooks/use-site-import-state.hooks.ts`. Expose `{imports,nextCursor,loadingMore,moreError,loadMore,reset}` through the controller. Dedupe by `importId`, preserve first occurrence and page order, and allow one in-flight request per current cursor. Reset on refresh and scope change. Discard late responses by scope plus generation, including refresh during a later-page request. An invalid later cursor resets to page one with localized reload copy. Other later-page failures keep rows visible and allow retry. Keep first-page unavailable and error behavior.

Mount `@jini-ai/devops/backup/site/react/ShowMoreImports` immediately after the table in `ImportList`, anchored at `A/features/sites/SiteImportTab.tsx:327–353`. Pass the `Button` from `useAdminKit()` in `ImportList`’s host binding. `useAdminKit` is exported from `@jini-ai/admin/react/kit`, with the host `components.Button` bound at `A/integrations/jini-kits.ts:42–43` and supplied at `A/main.tsx:97–104`. Ensure test renders exercising the paging binding are under the host kit provider. Pass the typed controller values and translated label to the hook-free Jini leaf. Keep the product screen, custom hooks, live-site handoff, credentials UI, and CSS in Tovu. Add “Show more imports” and “This list of imports changed. Reload it to see the newest imports.” to every existing locale. Pin empty, first-page, and error behavior, cursor transport, scope reset, dedupe, and owner action on an appended row.

**Why-comments.** Authorization precedes query interpretation. A cursor chooses a position, not a principal. An old response without `nextCursor` remains a valid first page. Scope/generation guards private results against late promises. The real-driver fixture does not select production authority.

## P5-T3.T — Bind legacy scan and prove the cutover input

BUILDER: SOL

**Files.** Add `W/server/runtime/composition/site-import-backfill.ts`. Extend `W/server/runtime/composition/site-import-backend.ts` and the T2 index fixture and retention suite. No manifest, changeset, or API-baseline change.

**Tests first.** Use T3.J’s exact I18–I22 cases in the appropriate real-db fixtures. For interruption after commit/before state publish, close and reopen the DB and rerun from the same legacy snapshot. For the active cases seed a real durable owner stage and a creating allocation. Assert the selected index recovery does not create another site, a valid `needs-owner` stage can complete, and an unreadable file is byte-for-byte unchanged. Assert blocked cutover produces no partial indexed authority. Mutations are the corresponding T3.J cases.

**Build.** `bindSiteImportBackfill({directory,fs,clock,policy,openCandidate,log},{}) → (required:Record<string,never>,_optional?) => BackfillResult`. Bind `readJson({file},{})` through `createDurableJsonFile` plus `createNodeDurableJsonPorts` using `.read({})` only. Bind `newDbId` with host `randomUUID`. Bind the candidate to the same private workspace DB file and T2 opener. Feed only safe counts or classified failure codes to the host log. Use this bound function in integration fixtures. Prepare it in the existing composition args for T4, but do not call it from production until durable external state is wired. Preserve the old registry’s unreadable refusal. Do not move unreadable JSON aside or add a repair UI.

**Why-comment.** The SQL marker proves a complete candidate, not permission to treat it as the authority. The external state publish is a separate, later operation.

## P5-T4.J — Mode, durable write fence and snapshot retirement

BUILDER: OPUS

**Files.** Add `J/devops/src/backup/site/import-index/mode.ts` and `J/devops/src/backup/site/import-index/__tests__/mode.test.ts`. Extend `errors.ts` with `IMPORT_HISTORY_MISSING`, status 503, and exact copy “Import history is missing, so imports are paused to avoid creating the same site twice. Nothing was changed. Contact support with this error ID.” Export node `./backup/site/import-index/mode`. Update the `backup/site` Wiring documentation in `J/devops/src/backup/site/README.md`. Changeset `p5-t4-import-index-mode.md`, devops minor. Baseline `jini-ai__devops.json`.

**Tests first.**

| Exact test | Named red mutation |
|---|---|
| `missing DB after an indexed write fails closed` | Allow stale JSON writes or open indexed without `fileMustExist`. |
| `index-state says indexed before the first post-cutover row is committed` | Write external state after commit. Assert at the first mutating SQL statement. |
| `pre-write rollback reads the legacy snapshot` and `permitted pre-write rollback can still complete owner setup` | Refuse a missing DB while still pre-write. Tovu exercises real owner completion. |
| `post-cutover replay after restart returns the stored site, not a second one` | Bypass replay lookup on a fresh registry. |
| `DB from another workspace is refused` | Skip `db_id` comparison. |
| `snapshot retained at 30d − 1 ms, removed at 30d, never in cutover mode` | Use `>` or permit removal during cutover. |
| `retirement keeps a history file written after cutover` | Drop the mtime predicate. |
| `lost state with evidence of indexed writes fails closed` | Remove the indexed-evidence check. |
| `newer sidecar is not quarantined` | Classify future schema as corruption. |
| `retirement resumes after a partial pass and keeps non-history files` | Retire by generic `.json` suffix. |

**State and API.** `ImportIndexState` is a discriminated union with schema `"site-import-index-state/1"`. Legacy has `mode:"legacy"`, `dbId:null`, and `cutoverAt`, `firstIndexedWriteAt`, `legacyRetiredAt` all zero. Cutover has a UUID `dbId`, integer `cutoverAt`, and zero write/retire times. Indexed has the UUID and cutover time, a recorded first-write time, and zero or a recorded retirement time. Use `mode`, not timestamp truthiness, as authority. Store state in `<root>/import-index.state.json`.

- `readIndexState({file,readJson},{}) → {kind:"missing"} | {kind:"invalid"} | {kind:"valid";state:ImportIndexState}`. Reject malformed but parseable shapes without salvaging or quarantining them.
- `writeIndexState({file,writeJson,state},{}) → void`. The `writeJson({file,value},{})` port guarantees atomic private-mode replacement.
- `resolveMode({state,evidence,access,policy,openExisting,writeState,backfill,prepareRetry,log},{}) → {mode:"legacy"} | {mode:"cutover"|"indexed";state;handle} | {mode:"refused";error}`. Access is `"read" | "locked"`. `evidence:{dbArtifactsPresent:boolean;indexedWitnessPresent:boolean}` comes from fixed-path probes, never root enumeration. `openExisting({readonly},{})` validates schema and supplies an owned handle. Inject `writeState({state},{})`, `backfill({},{})`, `prepareRetry({reason},{})`, and `log({message},{})`. Split mode branches to stay under the complexity cap.
- `markIndexedWrite({state,clock,writeState,ensureIndexedWitness},{}) → ImportIndexState`. Durably publish indexed state, then write `<root>/.history-indexed-v1` with `wx` and mode `0600`, then fsync the witness file, then flush the root directory. Only then allow SQL mutation. The witness is monotonic and never retired. If state is already indexed but the witness is absent and the DB validates, re-establish the witness under the lock before allowing SQL. If the state or witness write fails, allow no SQL mutation.
- `retireLegacySnapshot({root,state,clock,policy,fs,writeState,log},{}) → {removed:number;finished:boolean}`. Add a no-follow `stat({file},{}) → {kind,mtimeMs}` port. Only in indexed mode at `now >= cutoverAt + legacyRetireMs`, delete at most 200 regular files per tidy pass whose names match `^<uuid>\.json$` and whose `mtimeMs <= state.cutoverAt`. Check type with lstat. Never recurse or delete payloads, state, witness, or DB artifacts. Preserve every newer history file. It can only come from a pre-P5 build after downgrade and may be the only copy. Log only the newer-file count. Set `legacyRetiredAt` once no eligible regular history file with `mtimeMs <= cutoverAt` remains. An incomplete or failed pass leaves it unset for retry. This owner-decided automatic retention needs no approval card.

**Mode rules.**

- **Legacy.** Missing state with no DB artifacts and no witness means legacy. Missing state with DB artifacts or a witness, unreadable/malformed state, or a witness with a non-indexed state means refusal. On locked legacy with enable, publish explicit legacy state before any candidate open, distinguishing interrupted initial backfill from lost state. Publish cutover only after a complete backfill commit. Blocked conversion stays legacy. Read access never backfills, writes state, sweeps, quarantines, or creates a DB.
- **Cutover.** Open existing only and require matching `db_id` and `cutover_at`. If valid and enabled, use it. On rollback, close and durably publish legacy before JSON writes. A missing, known corrupt, or mismatched DB before the first write leaves legacy authoritative. Locked resolution closes local handles, preserves artifacts through `prepareRetry`, makes legacy authority durable, and applies policy. Read resolution may read legacy in that pre-write condition but never changes disk. Busy, permission denial, and newer schema do not authorize repair or reinitialization. Sweep does not run in cutover mode.
- **Indexed.** Ignore rollback. Open existing only, verify the two meta values, close rejected handles, and never fall back to legacy. Missing/mismatched maps to `IMPORT_HISTORY_MISSING`, corrupt to `IMPORT_HISTORY_DAMAGED`, and future schema to `IMPORT_HISTORY_NEWER`. The host latches refusal. An indexed admission, recovery/expiry put, or ordinary put all cross the same write fence. Before a legacy put, confirm legacy authority under the current lock.

**Documentation and why-comments.** Document the injected opener, workspace root, lock, clock, atomic state, active-row recovery, fence-before-consume, cursors, and host Admin/tool mounting. Include a host-binding example and forbidden imports. External state plus witness prevents a missing DB from reopening stale JSON. A crash after state/witness but before SQL closes fallback conservatively. Allowed pre-write rollback preserves pending stages. Retirement is tidy-only and never removes the witness. Document that same-ID backup restore, loss of committed WAL, and simultaneous loss of all authority evidence are not detected.

## P5-T4.T — Bind authority, rollback, retire and document

BUILDER: OPUS

**Files.** Add `W/server/runtime/composition/site-import-index-state.ts` and `B/__tests__/import-history-mode.integration.test.ts`. Change `W/server/runtime/composition/site-import-backend.ts`, `B/{import-registry,import-backend}.ts`, `W/cli/commands/import-local.ts`, and `B/README.md`. Add `seedIndexState({mode,dbId,cutoverAt})` and `seedWitness({})` to `B/__tests__/import-history-index.fixture.ts`, preserving optional argument pads. Add `ADS-memory/specs_as_built/changelog/p5-import-history-downgrade.md`. Use `@jini-ai/devops/backup/site/import-index/mode`. No manifest, changeset, or API-baseline change.

**Tests first.** Pin the following at the real host binding.

| Exact test | Named red mutation |
|---|---|
| `missing DB after an indexed write fails closed` | Allow stale JSON writes or open without `fileMustExist`. |
| `index-state says indexed before the first post-cutover row is committed` | Write state after commit. Assert at the first mutating SQL statement. |
| `pre-write rollback reads the legacy snapshot` and `permitted pre-write rollback can still complete owner setup` | Refuse a missing DB while still pre-write. Pin retained pending payloads and actual owner completion. |
| `post-cutover replay after restart returns the stored site, not a second one` | Bypass replay on a fresh registry. |
| `DB from another workspace is refused` | Skip `db_id` comparison. |
| `snapshot retained at 30d − 1 ms, removed at 30d, never in cutover mode` | Use `>` or permit cutover-mode retirement. |
| `retirement keeps a history file written after cutover` | Drop the `mtimeMs <= state.cutoverAt` predicate. |
| `lost state with evidence of indexed writes fails closed` | Remove the indexed-evidence check. |
| `newer sidecar is not quarantined` | Classify a future schema as corruption. |
| `retirement resumes after a partial pass and keeps non-history files` | Retire by generic `.json` suffix. |

Also pin missing or malformed state with either a surviving witness or DB, no touching state/DB/snapshot on a refused upload or read, pre-write corrupt/missing DB with WAL/SHM leftovers, and a state-write failure before admission.

**Host wiring.** `bindSiteImportIndexState({directory,policy,clock,fs,open,checkIntegrity,backfill,log},{})` supplies the registry authority seam `history:{read<T>({run},{})→T;locked<T>({run},{})→Promise<T>}`. `composeSiteImportBackend` passes one policy to every authority session, opener, and backfill binding. Use this policy in the T4.T commit:

```ts
{
  cutoverPolicy: "rollback",
  historyVisibleMs: 2_592_000_000,
  replayFenceMs: 31_536_000_000,
  legacyRetireMs: 2_592_000_000,
  sweepOnClockRollback: false
}
```

The server binding and `import-local` both use `composeSiteImportBackend`. Current callers are `W/server/runtime/composition/site-deps/site-imports.ts:29` and `W/cli/commands/import-local.ts:59`.

- Bind `readJson({file},{})` to the non-quarantining durable reader. Write `<root>/import-index.state.json` with `writeJsonFileAtomic`, `createNodeAtomicFilesystem`, explicit `mode:0o600`, and owner-only verification, not the durable JSON writer’s default umask mode. `writeJsonFileAtomic` is at `J/platform/src/fs/atomic-write.ts:206`. Create `<root>/.history-indexed-v1` using `wx` at `0600`, fsync the file, and flush the root. Document best-effort platform flush limits. Keep all paths fixed beneath the private resolved root.
- Open existing data only in `openExisting({readonly},{})`. Validate the phase’s DB identity with `db_id` and `cutover_at` as well as the schema. Own a fresh scoped handle per read and per locked acquisition. Close in `finally` after success, refusal, or a throw. Never retain a handle across resolutions. Do not add a long-lived client to the content-store shutdown list. The one-shot CLI uses the same scoped cleanup.
- `prepareRetry({reason},{})` acts only in verified pre-write cutover under `.import.lock` after local handles close. Preserve suspect DB, WAL, and SHM in a unique private quarantine location keyed to the old DB ID. Move sidecars and the main file without overwriting artifacts. A partial move remains resumable and cannot permit a fresh DB beside old sidecars. If an artifact cannot safely move, refuse retry without deleting it. Never quarantine a newer schema, a busy connection, or indexed data.
- On a locked entry, perform the nonmutating refusal check before any namespace change. If permitted, ensure payloads and finish locked resolution. Publish successful cutover before recovery. Capture the operation’s mode, update the session when crossing the indexed fence, and re-read state on each following acquisition. A read that sees authority change during its legacy/pre-write snapshot discards the result and resolves again without disk mutation. Never serve stale JSON once indexed is observed. Latch refusal for the process and fail all backend methods through the typed error, including `importBackup`, `completeOwner`, `upload`, `list`, `listPage`, `get`, and CLI `tidy`. Preserve safe CLI copy for known history errors.
- Bind the retirement `stat` port with `fs.lstatSync(file)` for no-follow kind and `fs.lstatSync(file).mtimeMs` for mtime, capturing both from the same stat result. `tidy` runs existing cleanup and calls retirement only in indexed mode. Delete at most 200 matching regular UUID history files at or before the cutover mtime per pass. Leave newer files untouched, log only their count, and mark completion only when no eligible files remain. An unfinished pass is resumable. No new timer. P11 may schedule the existing public `tidy`.
- Document the opener, workspace root, lock, clock, private atomic state, active-row recovery, fence-before-consume, cursors, and Admin/tool mounts in the Wiring docs, with the host-binding example and forbidden imports. Cite ADR-071 at `origin/plan/whats-left-1122:plans/P12-adr-drafts.md:5` until the standalone ADR lands. The release note records the owner’s Q5 decision, acceptance with a release note and no freeze. Distinguish index-aware rollback from pre-P5 downgrade, which cannot see post-cutover fences or relocated payloads. Record the detection limits for same-ID backup restore, committed WAL loss, and loss of every authority artifact.

**Why-comments.** Lock-free get and list do not cut over or expire anything. Fresh scoped opens see missing or exchanged DBs that old descriptors could hide. Quarantine is a pre-write recovery path only. Once indexed, failing closed prevents a second site.

**Enablement.** Keep `"rollback"` in this commit. After Opus passes copied-legacy-folder verification in Chrome and packaged Electron, Opus lands a one-line commit flipping `cutoverPolicy` to `"enable"` in `W/server/runtime/composition/site-import-backend.ts`. Verify Show more, owner setup after pre-write rollback, restart replay without a second site, and a missing indexed DB refusing without fallback. Verify crash ordering, including failure before the first SQL mutation, on real disk. Restore-from-backup and the P11 schedule are out of scope.
