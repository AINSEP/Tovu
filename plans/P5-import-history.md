# P5 · Import history (Q4 cases 3–5, indexed store, cutover/rollback)

**Base:** Tovu `41e948ee4` (no Jini change needed). `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`.
**Leads:** Tovu `origin/plan/commit-plans-1120:commit-plans/r62t-rsy-6.plan.md` "Q4 · cloud combine sheet"; `inputs/combine-11-tovu.md` B3 + decision 6. **Q2 (restore from uploaded backup) is OUT of scope** (owner 11-21 ~7:35 PM).
**Owner decision (11-20 ~10:55 PM):** 30 days visible history; a tiny replay record (request digest + outcome) kept 1 year to fence retries.
**Owner rules:** as in P1.

## Current state (verified)
- `W/features/site-backup/import-registry.ts` (162 lines): `:58` `class SiteImportRegistry`, one `createDurableJsonFile` per record/upload (`:70`), import lock `withFileLock(.import.lock)` (`:106`), `SiteImportRecord` `:10` (`expiresAt` `:23`), uploads `:30`, `importSourceDigest` `:44`, upload expiry `:109`.
- `W/features/site-backup/import-backend.ts` (219): replay lookup by scanning `registry.list(input).find(row => row.requestId === …)` (`:157`); `list` (`:215`) calls `registry.expire({})` then `registry.list` — a directory scan on every list.
- `W/features/site-backup/import-backend-steps.ts` (174): `:76–78` `requireStagingBudget` does `readdirSync(registry.directory)` for `.upload.zip`/`.stage` — the **same directory** as history; `:119` `reconcileInterruptedImports`.
- Route `W/server/inbound/admin-http/routes/system/site-imports.ts:90` (GET list), `:94` (POST), `:108` (uploads), `:132` (owner). Tool `site_import_list` at `W/features/site-backup/tool-registrations.ts:91`.
- Acceptance witness committed in combine-11 (`c8686e0cb`): `W/features/site-backup/__tests__/import-history-retention.unit.test.ts` — case 1 green, **case 2 RED as intended** (terminal row still listed after 30 days). Cases 3–5 not written.
- SQLite: website already uses `better-sqlite3` for site DBs (e.g. `server/runtime/composition/site-deps/database-journal.ts:27`); there is **no** SQLite under `SiteImportRegistry` (combine-11 B3: the lead's "existing SQLite infrastructure" does not exist here).

## Design pins (resolve combine-11 decision 6; adopted as recommendations — see owner question)
1. New private SQLite file `site-imports.db` beside the JSON records in `appData/site-imports/`, owned only by `SiteImportRegistry`. Tables: `imports` (row per import, indexed `(principal_id, created_at DESC, import_id)`), `replay` (`principal_id, request_id` PK, `digest`, `import_id`, `outcome`, `accepted_at`), `meta` (`cutover_at`).
2. Payloads move to `appData/site-imports/payloads/` (uploads + stages). `requireStagingBudget` and the orphan sweep read only that folder.
3. Cutover: one backfill under `.import.lock`, marker committed in the same SQLite transaction as the backfilled rows. Unreadable legacy rows block cutover and keep their files.
4. Rollback: before the first indexed write, the legacy JSON snapshot is still authoritative; after any indexed write, the registry keeps reading/writing SQLite (the rollback build must include this reader). If an older build without it starts, import writes are frozen with "Imports are paused until Tovu is updated." (old builds cannot know — so the freeze is a marker file the old build already refuses? **STOP item**, see step P5-T4).

## Steps (all Tovu, sequential: one implementer each)

### P5-T1 · payload namespace + case 4 "no history scan" (~1.5 h)
Move upload/stage paths (`registry.uploadPath`, `stagePath`) to `payloads/`; `requireStagingBudget` (`import-backend-steps.ts:76–78`) and the orphan sweep enumerate `payloads/` only; one-time move of existing `*.upload.zip` / `*.stage` under the lock on first open.
**Tests first** (`import-history-retention.unit.test.ts` case 4 part 1): `staging budget and orphan sweep never enumerate the history directory` (make history-dir `readdir` throw → red now). `active payloads survive the move; stale ones are removed`. Mutation: restore the history-directory enumeration in `requireStagingBudget`.

### P5-T2 · indexed store behind `SiteImportRegistry` + cases 2 and 4 (~2 h)
New `W/features/site-backup/import-index.sqlite.ts` `openImportIndex({ directory }, { now } = {})` (≤ 50-line functions). Registry methods `put/get/list/expire` and replay lookup use it after cutover. `list` pages by `(created_at DESC, import_id DESC)` with an opaque cursor and bounded page size (50); terminal rows hidden 30 days after settlement (`createdAt` for legacy rows without settlement); replay rows kept 365 days from acceptance; replaying never extends retention. Same key + same digest → stored outcome; same key + different digest → `REQUEST_CONFLICT` **before** consuming an upload or verifying.
Route/tool/admin: `site-imports.ts:90` accepts `?cursor=`; `site_import_list` takes optional `cursor`; admin transfer history (`A/features/sites/hooks/site-transfer-dependencies.hooks.ts`) shows "Show more".
**Tests first:** case 2 (existing, red) goes green; add `tied timestamps page with no duplicates, skips or cross-principal rows`, `day 365 + 1 ms frees the key`, `replay at day 200 returns the stored outcome but the row is not listed`, case 4 part 2 `list, retry and expiry work with history-dir enumeration failing`. Mutations: make expiry comparison exclusive; drop the import-id tie-breaker; bypass replay lookup.
i18n (admin, all locales): `"Show more imports"`. API: `openapi` for the list route gets `cursor` / `nextCursor`. Catalog: `site_import_list` schema + golden bytes re-record.

### P5-T3 · backfill + interruption (case 3) (~2 h)
`backfillImportIndex({ registry, index }, _optional = {})` under `.import.lock`: reads every legacy JSON record once; writes terminal details (if within 30 days) and replay fences (if within 365 days) independently; preserves all active rows and their allocations (`verifying`, `creating`); commits the `cutover_at` marker in the same transaction. Origin-only legacy rows (no usable digest) keep a conflict fence for their remaining replay life. Unreadable rows → cutover refused, files untouched, plain log "An import record could not be read; imports keep using the old store until it is fixed."
**Tests first** (case 3): `interrupt the backfill and restart → exactly one copy of each row and fence`, `origin-only key still fences a different source`, `unreadable row blocks cutover and keeps its file`, `active verifying/creating recovery keeps its allocation`. Mutation: commit the marker before the backfill rows.

### P5-T4 · rollback / freeze (case 5) (~1.5 h)
After cutover, the legacy JSON files are left read-only as a snapshot for the verification window (no writes). Case 5 proves: before any indexed write, deleting `site-imports.db` falls back to the legacy snapshot; after an indexed write, a restart keeps using SQLite and a post-cutover replay cannot create a second site.
**Tests first:** `post-cutover replay after restart returns the stored site, not a second one`, `pre-write rollback reads the legacy snapshot`. Mutation: allow writes through the stale legacy registry after cutover.
**STOP** (owner/combine decision): an **older** desktop build (pre-P5) started after cutover would read stale JSON and could re-run a fenced import. Options: (a) accept — desktop auto-updates and nobody downgrades (owner Q1 11-20 said "the desktop app just updates"); (b) have the cutover also rename the legacy folder so an old build sees no history at all (it then has no fence either). **Recommend (a)** with a release note; do not build a freeze for old builds.

## Chrome / Electron owed
Admin → Sites → transfer history: page with "Show more", finish owner setup, restart the app, retry the same import request → same site, no duplicate. Packaged Electron on a real data folder with old imports → backfill once, history shows the last 30 days.

## Owner question
Q4 design pins 1–4 above (combine-11 decision 6) and the old-build rollback choice: **recommend** pins as written and option (a).

## Dependencies / batches
Strictly sequential: P5-T1 → P5-T2 → P5-T3 → P5-T4 (all touch the registry). Can run in parallel with every other plan. P4-T4 sheet I touches `import-local.ts` only — no conflict.

## Estimate
~7 h.
