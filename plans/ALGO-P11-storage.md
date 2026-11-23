DESIGN PARTIAL: desktop section pending merge

# ALGO-P11 · Storage budget — algorithm design (how each slice works)

**Plan:** `plans/P11-storage-budget-v2.md` (WHAT). **Check applied:** `plans/P11-storage-check-v2.md` (every NEEDS item resolved below — see the resolution table). **Owner defaults (binding, approved 2026-11-22 ~2:50 PM PT):** Q1–Q14 as written in plan §6 — no automatic chat deletion; shares never expire by default; keep newest 5 DB copies; desktop cache 32 MB/site (after ST-1a); erased-site partitions removed only after the retirement record + 4 checks.
**Bases (every cite re-verified with `git show <ref>:<path>`):** Tovu `origin/integ/merge-13-2026-11-22` `f7185f153a`, Jini `origin/integ/merge-14-2026-11-22` `4902a6a1a`. Built-slice cites are on the build branches named in §0. `W/` = Tovu `apps/website/src/`, `D/` = Tovu `apps/desktop/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`.
**Design only.** No production code, builds or tests were run. Pseudocode is illustrative; names are proposals the builder may keep.

## 0 · What is already built (fetched 2026-11-23 ~18:50 UTC)

| Slice | Branch / head | State | Design in this file |
|---|---|---|---|
| ST-4 runner | Jini `origin/codex/st-ready-jini` (`J/platform/src/retention/runner.ts`) | built + review fixes | §3 "plug-in contract" only |
| ST-5 copy selection | same (`J/db/src/sqlite/backup-policy.ts:83` `selectDatabaseCopiesToPrune`) | built | §3 plug-in contract |
| ST-14 measurement | Tovu `origin/codex/st-ready-tovu` (`W/features/storage/measure.ts`) + Jini `J/platform/src/retention/measure-tree.ts` | built | §3 plug-in contract |
| ST-7a SQLite conversion + daily step | Jini `origin/codex/p11-next-jini` `1b7dcff86`…`076f73492` | built | §4 algorithm **as implemented** + 5 defects |
| ST-12a share expiry field | Tovu `origin/codex/p11-next-tovu` `b2513fb4a3`, `3df699e25a` | built (API only, no admin choice yet) | §5 as implemented + 3 defects |
| ST-16 report half | Tovu `origin/codex/p11-next-tovu` `1cbfcb0b99` | built | §6 as implemented; clean/compact designed fresh in §22 |
| everything else | — | not started (report `cloud-results/p11-next.md` line 1) | designed fresh |

## Summary

| Step | Operations designed | Invariants | Open owner questions |
|---|---|---|---|
| ST-1a | see Desktop section | see Desktop section | see Desktop section |
| ST-1 | Desktop | Desktop | Desktop |
| ST-2a | Desktop | Desktop | Desktop |
| ST-2b | Desktop | Desktop | Desktop |
| ST-2c | Desktop | Desktop | Desktop |
| ST-3 | Desktop | Desktop | Desktop |
| ST-4 (built) | plug-in contract: request/join/queue/stop | I-4.1–4.4 | — |
| ST-5 (built) | plug-in contract: select | I-5.1–5.3 | — |
| ST-6a | start, boot pass, timer pass, manual pass, stop/drain, report | I-6a.1–6a.5 | OWNER-Q-6a |
| ST-6b | measure, sweep (list→verify→select→remove), migration-callback prune, orphan sidecars | I-6b.1–6b.6 | — |
| ST-6c | writer protocol (claim→stage→release), sweep, pre-protocol report | I-6c.1–6c.6 | — |
| ST-7a (built) | convert (lease→marker→admit→budget→copy→rewrite→verify→mark), daily step | I-7a.1–7a.7 + 5 defects D7a-1…5 | OWNER-Q-7a |
| ST-7b | CLI compact, desktop idle trigger, owner button, maintenance lease | I-7b.1–7b.5 | OWNER-Q-7b |
| ST-7c | measure, bounded multi-step sweep | I-7c.1–7c.4 | — |
| ST-8a | setPinned, preview, apply (per-chat fenced recheck), single delete unchanged | I-8a.1–8a.8 | OWNER-Q-8a |
| ST-8b | pin toggle, selection mode, emit ids | I-8b.1–8b.3 | — |
| ST-8c | reader proof procedure, trim, version rule | I-8c.1–8c.5 | — |
| ST-9 | migration `chat/0004_chat_pinned`, PATCH extension, mount | I-9.1–9.5 | — |
| ST-10 | dialog state machine, preview/apply calls, kept list | I-10.1–10.4 | — |
| ST-11a | upload claim, purge journal, tombstone, unlink pass (fenced), forms mapping | I-11a.1–11a.8 | OWNER-Q-11a |
| ST-11b | migration `content/0043_blob_gc_journal`, adapter, policy, legacy report | I-11b.1–11b.5 | — |
| ST-12a (built) | expiry choice, token refusal | I-12a.1–12a.4 + 3 defects | — |
| ST-12b | expiry pass (tombstone→flip→unlink), revoked retry, download gates | I-12b.1–12b.7 | OWNER-Q-12b |
| ST-13 | preview, apply under revision-stream lock, protection probes | I-13.1–13.6 | OWNER-Q-13 |
| ST-14 (built) | plug-in contract | I-14.1–14.3 | — |
| ST-15 | split 15a (Jini specs) / 15b (Tovu mount) / 15c (tools + approval) | I-15.1–15.5 | — |
| ST-16 | report (built), clean, compact, exit codes | I-16.1–16.5 | — |
| ST-17 | screen state machine, clean-up flow | I-17.1–17.4 | — |
| ST-18 | Desktop | Desktop | Desktop |

## Check v2 NEEDS → where resolved

| Check item | Resolution (section) |
|---|---|
| 1 · partition ownership authoritative (wipe risk) | Desktop section: interlock held across awaits, acquisition via every path, fail closed, retirement bound to profile/root/identity, path-reuse invalidation |
| 2 · cache gate enforceable | Desktop section ST-1a/1/3 (ST-2a hard dep; ST-1a go/no-go) |
| 3 · dry-run semantics, writer-owned cleanup | §3 (runner as built already gives mixed-mode semantics — verified at `runner.ts:172-183`); §7 entry-point × action table (when Q1 permits report/clean/compact); §8 every copy publisher and reader under one mutex; §9 writer owns its marker before staging through child exit/publication; pre-protocol leftovers report-only; exact matcher replaces the prefix matcher |
| 4 · SQLite admission + recovery before rewrite (VACUUM inside migration) | §4: built code admits with `BEGIN EXCLUSIVE` before any byte changes, durable recovery copy distinct from `pre-migrations-*`, `needs-attention` distinct state, identity-scoped completion. Remaining defects D7a-1…5 (rewrite workspace budget, orphan copy, copy retention, needs-attention exit, lease liveness) are designed in §4/§10. Conversion is never a migration (I-7a.1). |
| 5 · deletion confirmation + liveness (chat deletion) | §12: apply = preview ids ∩ fenced recheck; fence is the existing `chat-slot:<id>` lock that run starts already take (`durable-run-store.ts:343`); bulk path never calls cancel/finalize (active chats are kept), so no deadlock and no check-to-delete gap; rename `source` preserved; ST-8c report-only until proof; version rule explicit; ST-13 recheck under `post_revisions:` lock |
| 6 · media purge authority + forms cleanup | §17: DB-held fence replaces the in-process hash lock; forms outbox mapped; probes fail closed; purge provenance recorded; Trash-TTL eligibility explicit (OWNER-Q-11a) |
| 7 · share expiry across delivery + both download routes | §5 (built refuses remote expiry) + §19: no lock across streams — monotonic tombstone then unlink; both routes gate on the overlaid status; remote copies never auto-expired; reentrant verification not involved (no lock held) |
| 8 · ownership/dependencies/estimates | §0 table + each step's Wiring; ST-15 split into 15a/15b/15c; ST-16 clean/compact separate from report; releases listed per step |

## 1 · Cross-cutting model (steps refer to these)

### X1 · Ownership and layers
- **Jini (`@jini-ai/*`, product-neutral):** `platform/retention` (runner, measure-tree), `db/sqlite` (copy selection, compaction), `core/contracts/storage` (ports: compaction marker/fs, retention policy types), `chat` (pin, owner-scoped bulk delete, attempt-base trim), `cms/media` (blob GC protocol), route **specs** via `defineJsonRoute` (`J/core/src/contracts/server/json-route.ts:132`) in the owning package. No Express, no Electron, no Tovu names.
- **Tovu:** bindings and policies (`W/server/runtime/composition/retention.ts`), migrations (ADR-066 TS), share registry/expiry (`W/features/site-backup/*`), revisions (`W/features/post/repo.ts`), CLI, admin screens (via `@jini-ai/admin` kit + hook props), desktop.
- **Must-not-import (all slices):** Jini packages never import `apps/*`, Express (except `http-kit`), Electron (except `desktop-host`), or a package above their domain; `platform` and `db` are peers (no import either way); no re-export shells; Tovu imports Jini owners directly (no barrels added for convenience).

### X2 · Lock hierarchy (one order, never inverted)
1. **Running lease** — cross-process, one owner per site directory: `claimSiteRunning` (`W/platform/site-dir/site-running.ts:19-29`, "Must precede all database reads/writes"). Only the lease holder may delete anything under the site dir or rewrite its DBs. Read-only tools (ST-16 report) take no lease and open nothing writable.
2. **Site ops mutex** — in-process async mutex inside the lease holder, keyed by resource: `ops-copies:<opsDir>`, `shares:<shareId>`, `retention-pass`. Held across awaits.
3. **Temp-root file lock** — cross-process, per staging root: Jini `withFileLock` (`J/platform/src/fs/file-lock.ts:300`; token + inode identify the owner, pid/hostname liveness, `staleMs: Infinity` disables age eviction of live owners, `:5-11,67-70`).
4. **DB transaction + `lockKey`** — innermost. SQLite: `BEGIN IMMEDIATE` makes `lockKey` a no-op (`J/db/src/kernel/sqlite/driver.ts:30,122`); Postgres: advisory xact locks (`J/db/src/kernel/postgres/driver.ts:11,59`).
- **Rule:** acquire outer→inner only. Never await a JS in-process lock (e.g. `withSha256Lock`) while inside a SQLite transaction — the forms code already documents that deadlock (`W/features/forms/form-file-purge.ts` `createFormMediaCleanup` comment). Never hold (3) or (4) across a network call except where a step says so with a timeout.

### X3 · Outcomes, messages, ERR- ids
- **Expected deferrals are outcomes, not incidents:** `busy`, `running`, `low-disk`, `protected`, `expired`, `needs-attention`, `not-converted`, `nothing-to-reclaim`. Each has one fixed plain message (catalog per slice, e.g. `COMPACTION_MESSAGES` at p11-next-jini `J/db/src/sqlite/compaction.ts`). They are logged as one report line and never reported to the tracker.
- **Unexpected failures** (I/O error other than ENOENT/EBUSY/ENOSPC, SQL error other than BUSY/LOCKED, a probe that throws) go through the P4 reporter (`reporter.record({ error, step, operation })` → ERR- id; see `plans/ALGO-P4-errors.md`). The runner already isolates a failing policy and emits `Storage cleanup "<id>" failed while cleaning up.` (`J/platform/src/retention/runner.ts:226` on st-ready-jini); the host's `reportError` binds it to the reporter so the admin line shows `(error ERR-…)`.
- **Disk full (ENOSPC/SQLITE_FULL) during cleanup:** the step stops, leaves the last durable state, reports `low-disk` ("There is not enough free disk space to … Nothing was changed."). Cleanup that only deletes never needs space except for marker writes; a marker write that fails with ENOSPC aborts the step before any delete (write-ahead rule, X4).

### X4 · Write-ahead rule for every destructive step
For every delete: (a) durably record the intent/eligibility (tombstone file, marker, journal row) → (b) perform the irreversible action (unlink/DELETE) → (c) durably record completion. A crash between (a) and (b) retries (b); between (b) and (c) retries (b) idempotently (ENOENT = done) and then writes (c). Readers gate on (a), never on (c), so after (a) nothing new is served.

### X5 · Clocks
- Wall clock (`clock.now()`) only for owner-facing dates: share `expiresAt`, "older than X", media `gc_grace`, Q12's 1-day temp age. Monotonic time (`performance.now()` / scheduler) for timeouts, preview-token TTL and step budgets.
- **Clock set back:** dates are compared with `>=` against the stored instant; a backward jump only delays deletion (never deletes early). **Clock set forward:** could make items eligible early. Mitigation: every automatic deletion also requires a second, clock-independent condition (verified newest copy; lock acquired from a dead owner; tombstone present; owner-confirmed purge). A forward jump therefore cannot remove anything that is not already dead or owner-confirmed.
- **Sleep/wake:** intervals fire late; nothing is "due-at-exact-time". Leases/locks use pid liveness, not heartbeats, so a sleeping owner is never evicted (file-lock `staleMs: Infinity`).

### X6 · Confirm pattern for owner-triggered deletion (chats, revisions, screenshots, sign-ins, Move to Trash)
`preview(scope) → { previewToken, count, bytes, items[≤ 50 shown], kept[] }` → owner confirms in an approval card / dialog → `apply({ previewToken })` deletes **only ids in the preview ∩ still eligible at mutation time**. Tokens: 128-bit random, held server-side in an injected `PreviewStore` (in-memory, TTL 15 min monotonic, bound to the principal and scope, single use, max one live token per principal per kind). Expired/unknown token → `expired` message "This preview is out of date. Preview again." Agent tools use the same preview + approval card (`confirmation: 'always'`), never `policy`.

## 3 · Built plug-in contracts (ST-4, ST-5, ST-14) — how the rest plugs in

### ST-4 · Retention runner (Jini `platform`, built on `codex/st-ready-jini`)
1. **Data model:** in-memory only. `RetentionPolicy { id, kind: 'cache'|'derived'|'old-copy', measure(), sweep({ now }) }` (`J/platform/src/retention/runner.ts:23-35`); kinds validated at runtime (`:111-118`). Pass queue `{ running?, waiting? }` (`:148-155`).
2. **Algorithm (as built):** `request({ dryRun })`: stopped → `{status:'stopped'}`; idle → begin; running same mode → join running promise; running other mode → join/create the single `waiting` pass (`:172-183`). `executePass` runs policies **sequentially** in list order, `measure()` on dry run, `sweep({ now: startedAt })` otherwise; each failure becomes `{status:'failed', message}` and `reportError(error, { policyId })` (`:196-230`). `stop()` cancels `waiting` (resolves `stopped`) and awaits `running` (`:184-193`). Scheduled passes use `scheduledDryRun` (`:60-66,89-93`).
3. **State machine:** queue `idle → running(mode) → [waiting(other mode)] → running(other) → idle`; `stopped` terminal.
4. **Concurrency:** single process only. Mixed-mode semantics required by check 3 hold: a dry run never receives a sweep result and a live request never receives a measurement, in both arrival orders. **Plug-in rule for every policy below:** `sweep()` must be idempotent and re-check eligibility itself (the runner gives no isolation between `measure` and `sweep`), and must honour an `AbortSignal` the host closes over for `stop()` (add per policy: check `signal.aborted` between items; the runner awaits the pass, so a long sweep delays shutdown — every sweep is bounded, see each step).
5. **Limits:** policies run serially; each host policy bounds its own work (items per pass, time budget).
6. **Invariants:** I-4.1 dry run never calls `sweep` (`dryRun never calls sweep`). I-4.2 one in-flight pass per mode (`boot, timer and manual passes share one in-flight pass`). I-4.3 a failing policy does not stop the next. I-4.4 `stop` awaits the pass in flight. (All built.)
7. **Wiring:** `createRetentionRunner({ policies, clock, scheduler, reportError }, { intervalMs, scheduledDryRun, onReport })`. No core runtime imports (review FIX 3).

### ST-5 · Copy selection (Jini `db`, built)
`selectDatabaseCopiesToPrune({ copies, verifiedNewest }, { keep = 5, protectedPaths })` (`J/db/src/sqlite/backup-policy.ts:83-102` on st-ready-jini): returns `[]` without a verified newest; compares resolved identities and collapses aliases; never selects the anchor or protected paths; ignores copies outside the anchor's folder. **I-5.1** nothing without a verified newest; **I-5.2** protected kept beyond cap; **I-5.3** foreign-folder copies ignored. ST-6b is its only production caller.

### ST-14 · Measurement (built)
Jini `measure-tree.ts` walks with an anchored no-follow directory port; unknown ≠ 0; symlinks listed, never followed (header `:2-17`). Tovu `measureSiteStorage` maps resolved site paths to categories and classes. **Plug-in rule:** every policy's `measure()` reuses the same category ids, so the dry-run list (ST-15/17) and the storage report (ST-16) name the same rows. **I-14.1** parts add up to the walked total; **I-14.2** symlink not followed; **I-14.3** unreadable = unknown.

## 4 · ST-7a · SQLite conversion + daily step — AS IMPLEMENTED (Jini `codex/p11-next-jini`)

Files: `J/db/src/sqlite/compaction.ts` (237 lines), `compaction-steps.ts` (62), ports in `J/core/src/contracts/storage/sqlite-compaction.ts`.

1. **Data model.** Marker (host-persisted through `SqliteCompactionMarkerStore { read, write }`): `{ state: 'copied'|'rewriting'|'converted'|'needs-attention', recoveryCopyPath, at, identity?: 'dev:ino', reason? }`. Recovery copy `pre-compact-<db>-<ms>.db` next to the DB (`compactionRecoveryCopyPath`), separate from the `pre-migrations-*` rotation. Tovu will persist the marker in `<site>/ops/maintenance.json` keyed by DB basename (ST-7b).
2. **Algorithm `convertToIncrementalVacuum({ filePath, open, marker, holdsRunningLease }, { recoveryCopyPath?, reserveBytes = 64 MB, fs, now })`:**
   1. `holdsRunningLease()` false → `deferred/running` (file not opened).
   2. `marker.read()`; `needs-attention` → `deferred/needs-attention` (never auto-retried).
   3. `pickRecoveryCopy`: reuse the prior attempt's copy if it still exists; else a new path that must not exist and must not be the DB.
   4. `admit`: open with `timeout: 0`; `PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; ROLLBACK` — any other connection → `SQLITE_BUSY` → `deferred/busy`, file untouched. The exclusive lock is then retained by this connection for the whole operation.
   5. Already converted (`auto_vacuum`=2 **and** marker `converted` **and** identity matches) → `already-converted`.
   6. Disk budget: same device → `2×(main+WAL)+reserve`; split devices → `1×+reserve` on each.
   7. No copy yet → `VACUUM INTO <copy>.partial` → read-only `integrity_check` → `rename` + folder fsync → marker `copied`. Copy exists → re-verify it.
   8. Marker `rewriting` → `verifyRewrite`: if not yet 2: `journal_mode=DELETE; auto_vacuum=INCREMENTAL; VACUUM`; then `journal_mode=WAL`; `wal_checkpoint(TRUNCATE)` busy must be 0; `integrity_check`=ok; `auto_vacuum` reads 2.
   9. Failure → marker `needs-attention` (copy kept) → outcome `needs-attention`. Success → marker `converted` with `dev:ino` → outcome `converted` with before/after sizes.
   **`incrementalVacuumStep({ db, filePath, marker }, { maxPages = 2048, minFreeRatio = 0.2, minFreeBytes = 8 MB, busyTimeoutMs = 250 })`:** refuse inside a transaction → skip unless marker `converted` ∧ identity matches ∧ `auto_vacuum`=2 → skip below both thresholds → set busy timeout, `incremental_vacuum(maxPages)`, restore the handle's timeout; BUSY/LOCKED → `skipped/busy` → report sizes, elapsed, "a long-running reader can delay that".
3. **State machine (marker):** `∅ → copied → rewriting → converted` ; `rewriting → needs-attention` (terminal until owner action, see D7a-4); `converted` is invalidated by identity change (restore/replace) → behaves as `∅`.
4. **Concurrency / crash (as built):** exclusive admission fences other connections in every process; crash during `VACUUM` in DELETE mode → hot journal rolls back on next open; crash after VACUUM before `converted` → next run sees `auto_vacuum`=2 → skips VACUUM, re-verifies, marks. Crash between `.partial` and publish → `.partial` removed next time.
5. **Failure modes:** messages in `COMPACTION_MESSAGES` (running / busy / needs-attention / not-converted / nothing-to-reclaim) and the low-disk sentence with MB figures. Non-busy SQL errors propagate (host reports via P4 reporter).
6. **Invariants + tests (built):** I-7a.1 never inside a migration/transaction (runner refuses; step throws in transaction). I-7a.2 no byte changes before exclusive admission (`pinned WAL reader → deferred, file intact`; `competing writer → busy deferral`; mutation "drop the exclusive admission" → 2/18 red). I-7a.3 marker `converted` only after `auto_vacuum` reads 2 and integrity ok (mutation "marker before verification" → 3/18 red). I-7a.4 verified recovery copy published before rewrite. I-7a.5 completion scoped to file identity (`replaced file does not inherit the marker`). I-7a.6 failed verification is its own state, copy kept. I-7a.7 step skips unconverted files.
7. **Wiring:** `open: StoppedSqliteOpener` (host passes better-sqlite3), `marker`, `holdsRunningLease`, `fs: SqliteCompactionFs`. `compaction-steps.ts` must not import the kernel (comment in `copySqliteFile`).

**Defects against plan/check (the builder of ST-7b fixes D7a-1, D7a-2, D7a-5 in Jini as a follow-up patch to ST-7a; D7a-3, D7a-4 in Tovu ST-7b):**
- **D7a-1 · rewrite workspace not budgeted (check 4 "budget … rewrite workspace on the actual filesystems").** `VACUUM` builds a temp copy in SQLite's temp directory (`SQLITE_TMPDIR`/`TMPDIR`, often a different filesystem) **and** writes a rollback journal of up to 1× in the DB folder in DELETE mode. Peak on the DB filesystem when temp is the same device ≈ copy 1× + temp 1× + journal 1× = **3×**, not 2×. Fix: add `tempDirectory()` to `SqliteCompactionFs` (default `os.tmpdir()` honouring `SQLITE_TMPDIR`); budget per distinct device: DB device `copy(if same) + journal 1× + temp(if same) + reserve`; temp device `1× + reserve`. Test `temp folder on a full disk → deferred low-disk, file intact`.
- **D7a-2 · orphan recovery copy after crash between publish and `copied` marker.** Restart sees no marker → picks a **new** path → the published copy leaks one full DB size forever. Fix: write marker `{ state: 'copying', recoveryCopyPath }` **before** `VACUUM INTO` (write-ahead, X4); `pickRecoveryCopy` reuses `copying` paths (verify or redo). Test `crash after publish before marker reuses the copy`.
- **D7a-3 · `pre-compact-*` copies have no retention.** Each conversion (and each re-conversion after a restore) leaves a full copy. Fix (Tovu ST-7b policy): after `converted` and one later successful boot whose `quick_check` passes, the copy becomes an old copy: keep the newest `pre-compact-<db>-*` per DB for 7 days, then remove it in the ST-6b pass under the same `ops-copies` mutex. Never remove a copy named by a `needs-attention` marker.
- **D7a-4 · `needs-attention` has no exit.** Add owner actions (ST-18/ST-17 sheets): "Restore the copy made before compaction" (stopped site, lease, verify copy, move current file aside as `failed-compact-<db>-<ms>.db`, rename copy into place, fsync, clear marker) and "Keep the current database" (requires a fresh `integrity_check`=ok, clears marker to `∅`). Both are destructive-adjacent → confirm card.
- **D7a-5 · lease checked only once.** `holdsRunningLease()` is probed at entry; if the lease were broken mid-run (dead-pid cleanup misfiring) a server could start and block on the exclusive SQLite lock. Fix: check again after admission and before `rewriting`; and ST-7b's maintenance claim (I-7b.2) makes a would-be server wait instead of attaching.

## 5 · ST-12a · Share expiry field — AS IMPLEMENTED (Tovu `codex/p11-next-tovu`)

1. **Data model:** `SiteShareRecord.expiresAt?: string | null` (`W/features/site-backup/share-registry.ts:26`); choices `SHARE_EXPIRY_DAYS = [7, 30, 90]` + Never (`share-expiry.ts`). Registry clock injected (`share-registry.ts:50`).
2. **Algorithm:** create: `shareExpiresAt({ days, now })` → ISO or null; other values refused "A share link can expire after 7, 30 or 90 days, or never."; expiry with a non-own-folder provider refused ("Links stored with s3 can't expire yet…"). Serve: `findToken` returns null when `isShareExpired({ row, now })` (`share-registry.ts:109-115`); `isShareExpired` is false for absent/null, true when unparseable or `now >= at`. Nothing is flipped or deleted.
3. **State machine:** none new; status stays `active`.
4. **Concurrency:** read-only check at lookup; no race (row field is immutable after create).
5. **Failure:** fail closed on unparseable date.
6. **Invariants (built):** I-12a.1 no expiry by default; I-12a.2 peer-uploaded `url:null`/no-`storage` rows still served; I-12a.3 expired token → 404 on the public route; I-12a.4 remote providers cannot set expiry.
7. **Defects:** **D12a-1** admin download (`W/server/inbound/admin-http/routes/system/site-shares.ts:141`) rejects only `revoked`; once ST-12b removes the ZIP it must also reject `expired` with a plain message (designed in §19). **D12a-2** the admin share screen does not offer the choice yet (report "Not done") — ST-12b's UI part, behind hook props. **D12a-3** wall-clock only: a clock set back extends a link (acceptable per X5; document in the share row tooltip "Expires on <date> (by this computer's clock)").

## 6 · ST-16 report half — AS IMPLEMENTED
`tovu storage report <dir> [--json]` (`W/cli/commands/storage-report.ts` on p11-next-tovu): no boot, no DB open, no lease, `resolveSiteDatabasePaths({ reserveIdentity: false })`, share folder derived without `mkdir`; plain totals per class. **I-16.1** report never migrates, opens a DB, or creates anything (tree snapshot incl. mtimes identical; mutation `resolveShareDirectory` → red). No defects found against plan; `clean`/`compact` designed in §22.

## 7 · ST-6a · Wire the runner in the serving process (Tovu)

1. **Data model.** In-memory: one `RetentionRunner` per served site; `AbortController` for the pass; last pass report kept in memory (for ST-15/17 "last cleanup"). Persisted: none (the report line goes to the site server log). New file `W/server/runtime/composition/retention.ts`.
2. **Algorithm.**
   - `startSiteRetention({ policies, clock, scheduler, reportError, log }, { bootDelayMs = 5 min, intervalMs = DAY_MS, scheduledDryRun = false })`:
     1. Called only from the serving composition next to the Trash sweeper (`W/server/runtime/composition/serving-app.ts:89-96`, which documents why sweeps live only in "the one process pair that serves a site"). Not called by the exporter, daemon, CLI report, or an attached process (`serve.ts:217` returns early for `runningLease.attached`).
     2. Build `policies` in plan order: database copies (ST-6b), temp roots (ST-6c), compaction step (ST-7c), media GC (ST-11b), share expiry (ST-12b); a policy is included only once its slice ships.
     3. `createRetentionRunner(...)`; schedule the boot pass with `scheduler.setTimeout(bootDelayMs)` so boot work (migrations, `tidyImportDatabases`, `serve.ts:191-192`) settles first; `runner.start()` for the daily timer.
     4. `onReport(result)` → one log line `[storage] <dryRun?'measured':'cleaned'> <n> policies: <id>=<freed|bytes|failed> …`; keep `lastReport`.
     5. `reportError(error, { policyId })` → P4 reporter `record({ error, step: 'Storage cleanup', operation: 'storage.retention', attributes: { policyId } })`.
   - **Entry-point × action table (check 3 "define exactly when Q1 permits report, clean and compact"; Q1 approved):**

     | Entry | Report (measure) | Clean automatic classes | Compact (convert) | Content (chats, revisions, screenshots) |
     |---|---|---|---|---|
     | Serving boot/timer pass | yes | yes (`scheduledDryRun:false`) | daily step only (ST-7c) on converted files | never |
     | Admin "Clean up now" (ST-17) | dry run first | after confirm | no (site is running) | never; links to the owner screens |
     | Agent `site_storage_cleanup` (ST-15c) | `dryRun` default true | after approval card | no | refused in plain words |
     | CLI `report` (ST-16) | yes, no lease | no | no | no |
     | CLI `clean`/`compact` (ST-16/7b) | yes | yes, stopped site under lease | yes, stopped site | never |
     | Desktop sheet (ST-18) | yes | via HTTP if running, CLI if stopped | stopped sites only | links only |
   - `stop()`: abort the controller, `await runner.stop()`. Registered as a serve worker so `releaseServeOwnership` (`W/cli/commands/serve.ts:247-252`) stops workers **before** `closeOwnedStore` closes storage.
3. **State machine:** `created → waiting-boot-delay → idle ⇄ passing → stopped`. `stop` during the boot delay cancels the timeout.
4. **Concurrency/crash:** single process per site (running lease). Manual and scheduled passes coalesce via the queue (I-4.2). A crash mid-pass leaves each policy at its own write-ahead state (X4); nothing is "half a pass". Sleep/wake: the interval fires late; no catch-up burst (one pass).
5. **Failure/limits:** a policy failure never blocks boot or serving (runner never rejects, `runner.ts:195`); each policy bounds itself (≤ 2 s CPU or ≤ 500 items per pass). The boot pass is skipped if `stop` arrives first.
6. **Invariants:** I-6a.1 never starts in a non-serving process (`never starts on a client role`; mutation: start on every role). I-6a.2 storage closes only after the runner drained (`stop drains before storage closes`). I-6a.3 one report line per pass (`report line written`). I-6a.4 the boot pass runs after `bootDelayMs`, never before the listener is ready (`boot pass waits for ready`). I-6a.5 no content policy can be registered (type + runtime kind check, I-4 built).
7. **Wiring:** host passes `clock` (routeDeps.clock), `scheduler` (setTimeout/setInterval adapter), `reportError` (P4 reporter), `log`. Imports `@jini-ai/platform/retention` directly. Depends on: ST-4 Jini release.
8. **OWNER-Q-6a:** ship the first release with `scheduledDryRun: true` (shadow mode: measure and log only) and flip to cleaning in the next release? **Recommend yes** — Q1 approves cleaning, but one release of logged dry runs on real agency machines catches a wrong root before anything is deleted; manual "Clean up now" works from day one.

## 8 · ST-6b · Pre-migration copy policy, keep 5 (Tovu binds Jini ST-5)

1. **Data model.** Files only: `<dbdir>/ops/pre-migrations-<ISO>.db` (+ `-wal`/`-shm`) written by `migrateSqliteContentFile` (`W/platform/db/sqlite/content-db.ts:102-117`, name built at `:125-128`, exact matcher at `:131-133`) and the chat DB's equivalent writer. In-memory: `opsCopiesMutex` keyed by resolved ops dir; `heldCopies: Set<path>` registered by Recovery readers.
2. **Algorithm.**
   - `measure()`: list exact-name copies per DB (same regex as `content-db.ts:133`), sum main+wal+shm; return bytes and count beyond 5.
   - `sweep()`: for each ops dir, under `opsCopiesMutex`:
     1. list exact-name copies, parse ISO stamp → `createdAt` (same parse as `:134`); ignore anything else (foreign files untouched).
     2. newest = max `createdAt`; `verifyCopy(newest)`: open read-only, `PRAGMA quick_check` = ok (inject `verify` port; closes handle in `finally`).
     3. `protectedPaths` = journal-protected restore points (`W/platform/db/sqlite/database-journal-repo.ts` protected rotation) ∪ `heldCopies` ∪ every path named by a `needs-attention` compaction marker.
     4. `candidates = selectDatabaseCopiesToPrune({ copies, verifiedNewest: verified ? newest : null }, { keep: 5, protectedPaths })`.
     5. for each candidate (oldest first, ≤ 20 per pass): re-check it is not in `heldCopies` (a reader may have registered meanwhile — the mutex makes this a no-op but keep it as a guard), then `rm main`, `rm -wal`, `rm -shm` (ENOENT ok).
     6. orphan sidecars: `pre-migrations-*.db-wal|-shm` whose main file is absent → remove.
     7. D7a-3: `pre-compact-<db>-*.db` older than 7 days, not the newest per DB, not named by a non-`converted` marker → remove.
   - **Migration callback** (`content-db.ts:111-113` `onBackupComplete → removeOlderMigrationBackups`): refactor to call the same `pruneMigrationCopies({ opsDir, justWritten })` under `opsCopiesMutex`, so boot pruning and the daily pass share one implementation and one lock. Note the boot callback has `justWritten` (fresh copy, trusted as verified by the migrator's own write); the daily pass verifies.
   - **Recovery readers:** every code path that opens a pre-migration copy or restore point for reading (Recovery screen restore, `database-journal-repo` restore) wraps the read in `holdCopy(path, work)` = register in `heldCopies` under the mutex → work → unregister.
3. **State machine:** per copy: `present → (selected) → removed`; `protected` overrides.
4. **Concurrency/crash.** Cross-process: only the running-lease holder writes `ops/` (X2); CLI `report` only reads. In-process: mutex serializes boot migration copy publication, daily pass, ST-7a recovery-copy publication (ST-7b takes the same mutex when run in-process; the CLI holds the lease so no server runs), and Recovery reads. Crash mid-removal: some files of a copy removed; next pass removes the rest (orphan rule 6). Clock: `createdAt` comes from file names, and selection is by rank, not age — a clock jump cannot select the newest 5.
5. **Failure/limits:** newest fails `quick_check` → remove nothing, report `protected`: "The newest database copy did not pass its check, so older copies were kept." I/O error on one file → stop this ops dir, report via P4 reporter, continue other DBs. ≤ 20 removals per pass.
6. **Invariants:** I-6b.1 never more than `keep` unprotected copies removed below 5 (`default keeps 5`). I-6b.2 nothing removed without a verified newest (`no verified copy → nothing removed`; mutation: pass `verifiedNewest: newest` without verifying). I-6b.3 a pass waits for backup publication (`a pass waits for backup publication`; mutation: prune without taking the mutex). I-6b.4 protected restore points and held copies kept (`protected restore points kept`, `a copy open in Recovery is kept`). I-6b.5 foreign files untouched (`foreign file in ops is ignored`). I-6b.6 boot pruning and daily pruning are one function (`migration callback uses pruneMigrationCopies`).
7. **Wiring:** policy factory `createDatabaseCopyPolicy({ opsDirs, verify, listProtected, mutex, fs }, { keep = DATABASE_COPY_RETENTION })` in `W/server/runtime/composition/retention-policies/database-copies.ts` (≤ 80 lines; split `listCopies`, `removeCopy`, `removeOrphans`). Imports `@jini-ai/db/sqlite` (`selectDatabaseCopiesToPrune`, `DATABASE_COPY_RETENTION`). Depends on ST-5 + ST-6a + Jini release.

## 9 · ST-6c · Writer-owned temp roots (Tovu)

1. **Data model.** Roots in `os.tmpdir()` with **exact** names `^(tovu-import-db|tovu-share-projection|tovu-archive-media|tovu-static-copy|tovu-snapshot|tovu-transfer-chat)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` and a sibling lock file `<root>.lock` (Jini file-lock JSON: pid, hostname, token, acquiredAt, optional bootId; `file-lock.ts:47-57`). Each writer: `W/features/site-backup/import-database.ts:61-62` (already: lock before `mkdir`, `staleMs: Infinity`), and the other writers in `W/features/site-backup/*` plus `W/server/runtime/composition/database-transfer-adapters.ts:34` (`tovu-transfer-chat-*`, missed by v2 row 25 — check "missed writers").
2. **Algorithm.**
   - **Writer protocol (every writer adopts it; one helper `withOwnedTempRoot({ prefix, work })`):** 1) `root = tmpdir/<prefix>-<uuid>`; 2) `withFileLock({ lockPath: root + '.lock', run }, { staleMs: Infinity })` — the lock exists **before** `mkdir` (no root without an owner); 3) inside: `mkdir(root, 0o700)` → `work(root)` (including forked children — the parent stays inside `run` until child `close`, as `import-database.ts:77-104` does) → `rm -r root` in `finally`; 4) lock released by `withFileLock`. A root handed to a publisher (e.g. snapshot → share publication) stays inside `run` until publication resolves.
   - **Sweep (policy `temp-roots`, kind `cache`):** generalise `tidyImportDatabases` (the check notes its matcher is a prefix check) to a table of exact patterns:
     1. `readdir(tmpdir)`; keep names matching the exact regex.
     2. no sibling `.lock` → **pre-protocol leftover → report-only** (listed with bytes, never removed).
     3. `lstat(root)` must be a directory (not a symlink); `realpath(root)` must be a direct child of `realpath(tmpdir)`; else skip + report.
     4. root `mtime` younger than 1 day (Q12) → skip.
     5. `withFileLock({ lockPath }, { timeoutMs: 0, staleMs: Infinity })`: acquiring succeeds only when the recorded owner is proven dead (pid probe on the same hostname) — `isLockStale` (`file-lock.ts:67-70`). Foreign hostname/unknown liveness → `FileLockTimeoutError` → skip (`isLockedByAnotherOwner`, `import-database.ts:137-140` treats EBUSY/EPERM/EACCES the same).
     6. inside the lock: re-`lstat` (identity unchanged) → `rm -r root` → lock released.
3. **State machine (root):** `claimed(live owner) → removed by owner` | `claimed(dead owner) → swept` | `unclaimed(pre-protocol) → reported`.
4. **Concurrency/crash.** Several site servers share one tmpdir: two sweepers race on the same lock; exactly one wins (exclusive create), the other skips. Writer crash after lock, before mkdir → lock with dead owner, no root → sweeper removes nothing (root absent) and leaves the lock file; add step 7: a `.lock` whose root is absent and owner dead → remove the lock via the same stale-break path. Sweeper crash mid-`rm -r` → root partly removed, lock stale → next pass completes. PID reuse: token + inode identify the owner (`file-lock.ts:5-6`); a reused pid appears alive → root kept (safe direction).
5. **Failure/limits:** EBUSY/EPERM on Windows (open handle) → skip, retry next pass. ≤ 20 roots per pass. Never follows links. Message for pre-protocol rows in the report: "Left by an older version of Tovu; remove it from the Storage screen if you no longer need it."
6. **Invariants:** I-6c.1 only exact names in the named root (`only named prefixes in the named root are touched`; mutation: match `tovu-*`). I-6c.2 a root with a live owner is kept (`a root with a live marker from another process is kept`). I-6c.3 a root without a lock is never removed (`pre-protocol leftover is report-only`). I-6c.4 every writer owns the lock before creating its root (`writer creates the lock before the folder`, one per writer). I-6c.5 a forked child's root survives until the child exits (`root kept while the worker runs`). I-6c.6 symlinked root skipped.
7. **Wiring:** `withOwnedTempRoot` in `W/platform/temp/owned-root.ts` (Tovu; generic enough to move to `J/platform/src/fs` later — not now, one consumer). Policy gets `{ tmpdir, fileLock, fs, clock }`. Depends on ST-6a.

## 10 · ST-7b · Run conversion on stopped sites (Tovu)

1. **Data model.** `<site>/ops/maintenance.json` `{ version: 1, databases: { "content.db": Marker, "chat.db": Marker } }` (atomic write: temp + rename + fsync, read-modify-write only while holding the lease). **Maintenance claim:** the running record gains `purpose: 'serve' | 'maintenance'` (Jini `DirectoryRunningRecord`, `@jini-ai/platform/fs`, additive field; absent = serve).
2. **Algorithm `compactStoppedSite({ dir, claim, open, markerStore, fs }, { databases = ['content','chat'] })`:**
   1. `claim = claimSiteRunning({ dir, app, purpose: 'maintenance' })`; `claim.attached` → refuse `running`: "This website is running; compaction needs it stopped." (CLI exit 3).
   2. resolve DB paths (`resolveSiteDatabasePaths({ reserveIdentity: false })`).
   3. for each DB in order content → chat: take `ops-copies` mutex (in this process) → `convertToIncrementalVacuum({ filePath, open, marker: markerStore.for(db), holdsRunningLease: claim.isHeld })` → collect outcome. Continue to the next DB after a deferral.
   4. `finally`: `claim.release()`.
   - **Triggers:** (a) CLI `tovu storage compact <dir> [--json]` (ST-16); (b) desktop idle trigger: when the app has had no input for ≥ 10 min, for tracked sites with **no open window**, one site at a time, spawn the CLI (child process, no in-app DB handle); (c) owner "Compact" in the desktop sheet (stopped sites only).
   - **Would-be server meets a maintenance claim:** `claimSiteRunning` loser sees `purpose: 'maintenance'` → instead of attaching (`site-running.ts:23-27`), it polls the lease (every 500 ms, ≤ 180 s) and then claims; desktop shows "Tidying this website's database… it opens in a moment." Timeout → plain error "This website is busy with maintenance. Try again in a few minutes." (P4 ERR- id only if the maintenance owner is dead but the lease is not released — the existing dead-pid cleanup handles that).
3. **State machine:** per site `idle → claiming → converting(db) → released`; desktop idle trigger `armed → running(site) → cooldown(24 h per site)`.
4. **Concurrency/crash.** Lease = cross-process exclusion; SQLite exclusive admission (I-7a.2) = defence in depth against a non-Tovu reader (DB browser) → `busy`. Crash: lease released by process exit/dead-pid cleanup; markers resume (§4). Desktop opening a site mid-conversion waits (bounded) — conversion time is O(DB size); log the measured duration and bound the idle trigger to DBs ≤ 2 GB (larger → owner button only). Two desktop windows / two profiles: the lease is per site dir, shared across profiles. Sleep during conversion: SQLite work just pauses; no wall-clock logic.
5. **Failure/limits:** low disk, busy, needs-attention → outcome messages (§4); boot is never blocked by a failed preflight (conversion is not on the boot path at all). Battery: skip the idle trigger on battery power (Electron `powerMonitor.isOnBatteryPower()`), see OWNER-Q-7b.
6. **Invariants:** I-7b.1 refused while the site is running (`refused while the site is running`; mutation: skip the lease). I-7b.2 a server that meets a maintenance claim waits, never attaches to a port-less record (`server waits for maintenance then starts`). I-7b.3 boot unaffected when preflight fails (`boot unaffected when preflight fails`). I-7b.4 one DB's deferral does not stop the other. I-7b.5 the idle trigger never runs for a site with an open window (`open window → no compaction`).
7. **Wiring:** Tovu `W/features/storage/compact-site.ts` (≤ 80 lines: `claimForMaintenance`, `compactOne`, `summarise`); CLI command and desktop trigger are thin callers. Jini changes: `purpose` field (platform, minor), ST-7a follow-ups D7a-1/2/5 (db, patch). Depends on ST-7a + release, ST-16 command shell.
8. **OWNER-Q-7b:** idle trigger on battery? **Recommend no** (AC only): conversion rewrites the whole DB; owners on laptops can press Compact.
8b. **OWNER-Q-7a:** what is offered when a DB is `needs-attention` (D7a-4)? **Recommend** both owner actions ("Restore the copy made before compaction" / "Keep the current database"), each behind a confirm card; never automatic.

## 11 · ST-7c · Daily bounded step (Tovu policy over ST-7a)

1. **Data model:** none new; reads the marker (§10) and the serving process's existing SQLite handles (content kernel source, chat DB handle).
2. **Algorithm (policy `db-free-pages`, kind `derived` — free pages are not data):**
   - `measure()`: for each converted DB: `freelist_count × page_size`, main and WAL sizes.
   - `sweep()`: for each DB: up to `maxStepsPerPass = 8` iterations of `incrementalVacuumStep({ db, filePath, marker }, { maxPages: 2048, busyTimeoutMs: 250 })`; stop on `skipped` (any reason) or when the pass's elapsed time > 2 s; `await setImmediate` between steps so requests interleave (better-sqlite3 is synchronous; each step holds the event loop for one bounded `incremental_vacuum`).
3. **State machine:** none (stateless per pass).
4. **Concurrency:** runs on the coordinated handle, never inside a transaction (step throws if `inTransaction`); other processes' writers (agent daemon on chat.db, if any) meet `busy_timeout 250` → `busy` defers. Restore/replace changes identity → `not-converted` skip (I-7a.5).
5. **Failure/limits:** ≤ 8 × 2048 pages (≈ 64 MB at 4 KiB pages) per DB per day; ≤ 2 s per pass; WAL growth bounded by the existing checkpoint behaviour; message on a pinned reader: "a long-running reader can delay that".
6. **Invariants:** I-7c.1 unconverted file skipped (`unconverted file is skipped`; mutation: run on an unconverted file). I-7c.2 busy defers without error report (`busy defers`). I-7c.3 report has main and WAL sizes. I-7c.4 pass time-bounded (`stops after the time budget`).
7. **Wiring:** policy factory gets `{ databases: [{ db, filePath, marker }] , now }`; imports `@jini-ai/db/sqlite` `incrementalVacuumStep`. Depends on ST-7a + release, ST-6a, ST-7b (markers exist only after conversion).

## 12 · ST-8a · Chat pin + owner bulk delete (Jini `chat`)

1. **Data model.**
   - `ai_chats.pinned_at` INTEGER NULL (SQLite) / BIGINT NULL (PG); index `ai_chats_owner_cleanup (scope_id, owner_kind, owner_id, pinned_at, updated_at)`. DDL lives in Jini `CHAT_HISTORY_DDL` (`J/chat/src/store/sqlite/schema.ts:40-`) for fresh bootstraps; Tovu ships the ADR-066 migration (ST-9).
   - `ChatStore.setPinned({ id, pinned }) → Conversation | null` (owner-scoped like `rename`).
   - New owner-scoped port `ChatBulkDeletion` (created per request from the owner-bound store, **not** on `ChatHistoryMaintenance`, which is privileged/cross-owner by design — `J/chat/src/store/sql/maintenance.ts:1-3`): `preview({ before }, { limit = 5000 }) → { ids, count, bytes, kept: { pinned: n, active: n } }`, `apply({ ids, before }, { now }) → { deleted: string[], kept: [{ id, title, reason: 'pinned'|'active'|'newer'|'gone' }] }`.
   - `PreviewStore` port (X6) in `@jini-ai/core` (generic: `put({ principal, kind, payload }) → token`, `take({ token, principal, kind }) → payload | null`); in-memory default with monotonic TTL.
   - Route specs (`defineJsonRoute`): `POST /api/assistant/chats/cleanup/preview { before }` → `{ previewToken, count, bytes, kept }`; `POST /api/assistant/chats/cleanup/apply { previewToken, confirm: true }` → `{ deleted, kept }`; `POST /api/assistant/chats/delete-selected { ids[] ≤ 500 }` → `{ deleted, kept }`; PATCH extension `{ title?, pinned? }` (spec only; Tovu mounts in ST-9).
2. **Algorithm.**
   - **setPinned:** `kernel.transaction`: `lockKey('chat-slot:'+id)` → `UPDATE ai_chats SET pinned_at = pinned ? now : NULL WHERE id=? AND owner scope` → return row or null (404, same "not found" for other owners as rename, `assistant-chats.ts:197-200`). Does **not** touch `updated_at` (pinning must not move a chat in "older than" order).
   - **preview(before):** one read: `SELECT c.id, sizes FROM ai_chats c WHERE owner scope AND c.pinned_at IS NULL AND c.updated_at < :before AND NOT EXISTS(active run)` ordered by `updated_at, id` limit 5000; `bytes` = sum of `length(content)+length(events_json)+length(attachments_json)` over messages (+ attempt rows); counts of kept pinned/active in the same range. `active run` = a message with `run_status IN ('queued','running')` **or** an attempt whose `recovery_deadline > now` and whose message is not terminal. Store `{ ids, before }` in `PreviewStore` → token.
   - **apply(token):** `payload = previewStore.take(token)` (single use; null → `expired`). Sort `ids`; process in chunks of ≤ 50; per chunk one `kernel.transaction`: for each id in sorted order: `lockKey('chat-slot:'+id)` → re-select with the **same predicate** as preview plus `id = ?` → match → `DELETE FROM ai_chats WHERE id=?` (cascades via the host FK policy, as `sweepExpired` relies on, `maintenance.ts:13`) → else push `kept` with the reason found (pinned / active / newer (`updated_at >= before`) / gone). Chunk total ≤ 500 deletions per request; the route loops chunks; a larger preview → the UI repeats apply with the remaining token payload (token stays valid until all chunks done — `take` returns the remainder and re-puts it).
   - **delete-selected(ids):** same per-id fenced recheck without the date predicate (owner scope, not pinned, not active).
   - **Single delete (exists):** unchanged — `cancelUnfinishedRuns` then `store.delete` (`assistant-chats.ts:205-222`). Bulk paths never cancel runs; active chats are **kept and named** ("kept: still running"). This removes check 5's deadlock question: the cancel/finalize loop takes its own transactions and run lock (`durable-run-store.ts:445-449`), so it must never run inside the bulk transaction — and with this design it never runs at all on bulk paths.
3. **State machine:** preview token `issued → taken(partial) → consumed | expired`. Chat: `unpinned ⇄ pinned`; `exists → deleted` (terminal).
4. **Concurrency/crash.**
   - **Fence:** run start already locks `chat-slot:<conversationId>` then the run lock (`J/chat/src/store/runtime/durable-run-store.ts:343-344`); apply takes the same `chat-slot` lock before recheck+delete → a run start either commits first (apply sees `active` → kept) or waits until the chat is gone (run start then finds no conversation → its existing "not owned/null" path, `:345-346`). Pin uses the same lock → pin-after-preview is seen by apply.
   - SQLite: `BEGIN IMMEDIATE` serializes all writers across processes (lockKey no-op); chunk of ≤ 50 keeps the writer turn short (the reason `sweepExpired` caps at 500, `maintenance.ts:16-17`). PG: advisory xact locks in sorted id order → no lock-order cycle with run start (which locks one slot).
   - Crash mid-apply: committed chunks are deleted, the rest untouched; the token is in memory → lost on restart → owner previews again (`expired`). Idempotent: an id already gone → `kept: gone`, not an error.
   - Clock: `before` is an owner-chosen date compared to stored `updated_at`; minimum X is 1 day in the UI so a skewed clock cannot select today's chats.
5. **Failure/limits:** preview > 5000 → count shown, ids capped, message "Showing the first 5,000; run it again afterwards for the rest." Token principal mismatch → `expired` (never reveal another owner's token). SQL busy → existing store boundary error → P4 reporter → "Couldn't delete chats right now (error ERR-…). Nothing else was changed."
6. **Invariants:** I-8a.1 pinned after preview is kept (`pinned after preview is kept`; mutation: drop `pinned_at IS NULL` in apply). I-8a.2 run started during cleanup is kept (`run started during cleanup is kept`, two connections, SQLite and PG). I-8a.3 never crosses owners (`never crosses owners`). I-8a.4 only preview ids can be deleted (`chat that became old after preview is not deleted`; mutation: re-select by date instead of ids). I-8a.5 batches ≤ 500 per request, ≤ 50 per transaction (`batches ≤ 500`). I-8a.6 pin does not change `updated_at` (`pinning keeps the chat's place`). I-8a.7 token single use and principal-bound (`a token cannot be replayed or used by another admin`). I-8a.8 bulk paths never call cancel/finalize (`bulk delete of an active chat keeps it and names it`).
7. **Wiring:** Jini `chat` gets `PreviewStore` from the host (core port); route specs export `{ method, path, input, run(deps) }` via `defineJsonRoute`; deps are the owner-bound store factory and `PreviewStore`. Must not import Express or Tovu. Changeset: chat minor, core minor (port).
8. **OWNER-Q-8a:** should "Delete chats older than X" also offer "include pinned"? **Recommend no** — pinning is the owner's keep signal (plan §3); unpin first.

## 13 · ST-8b · `ConversationList` pin + multi-select (Jini `chat/react`)
1. **Data model:** props only: `pinned?: boolean` per item, `selectable?: boolean`, `selectedIds?: ReadonlySet<string>`; hook props `onTogglePin(id, pinned)`, `onSelectionChange(ids)` through `defaultConversationListHooks` style (`J/chat/src/react/components/ConversationList.tsx:116-138`). No fetch inside the component.
2. **Algorithm:** pinned items sorted first (stable, host order otherwise); pin button calls `onTogglePin`; selection mode toggled by the host; shift-click range select over the visible order; "Select all older than…" is the host's dialog, not here.
3. **State machine:** `browse ⇄ selecting`; selection cleared on leaving.
4. **Concurrency:** optimistic pin is the host's choice; component renders props only.
5. **Failure:** none local; host shows errors.
6. **Invariants:** I-8b.1 pin toggles through props (`pin toggles through props`; mutation: ignore the pinned prop). I-8b.2 selection emits ids (`selection emits ids`). I-8b.3 keyboard: Space toggles, menu focus per P1-J3 pattern (`selection is keyboard reachable`). Classes `jini-*`.
7. **Wiring:** copy via existing args objects; no product strings.

## 14 · ST-8c · `attempt_base_json` trim — proof first, then trim (Jini `chat`)
1. **Data model:** none new; `assistant_run_attempts.attempt_base_json` set to `'[]'`.
2. **Algorithm.**
   - **Proof (gating deliverable, test file `attempt-base-readers.test.ts`):** enumerate every non-test reader on the bases — Jini: `chat/src/core/durable-runs/ports.ts:24`, `chat/src/server/durable-runs/recover.ts:53,56,142,151,153`, `chat/src/store/runtime/durable-run-store.ts:113,141,395,426,430,508`, `chat/src/store/runtime/kernel.ts:22`; Tovu: `W/server/runtime/composition/modules/assistant-chats.ts:286`, `…/run-finalizer/entry.ts:103,264,265,303`, `recovery-binding.ts:34,61`, `stream.ts:51`, `watch-state.ts:28,72` (re-grep on the then-current head; `ex5-fnd-seams-jini` edits `durable-run-store.ts`). For each reader write one test that drives it with a terminal, past-deadline attempt whose base is `'[]'` and asserts identical observable output to the untrimmed case. Any reader that differs → ST-8c stays report-only (plan row 9).
   - **Trim (policy `attempt-base`, kind `derived`):** one statement per batch: `UPDATE assistant_run_attempts SET attempt_base_json='[]' WHERE message_id IN (SELECT a.message_id FROM assistant_run_attempts a JOIN ai_chat_messages m ON m.id=a.message_id WHERE m.run_status IN (<terminal statuses>) AND a.recovery_deadline < :now - 7d AND a.attempt_base_json <> '[]' LIMIT 500)`.
3. **State machine:** run status terminal is absorbing (`advance` requires `run_status IN ('queued','running')`, `durable-run-store.ts:413-416`) → a trimmed row can never be advanced again.
4. **Concurrency:** single statement re-checks terminal status atomically; no lock needed (terminal cannot regress). Crash: partial batches are fine.
5. **Limits:** ≤ 500 rows per pass.
6. **Invariants:** I-8c.1 recoverable attempt untouched (`recoverable attempt untouched`; mutation: drop the deadline predicate). I-8c.2 replay after trim matches (`replay after trim matches`). I-8c.3 **version rule:** the trim changes no field served under `messagesVersion` (`J/chat/src/store/sql/store.ts:536-545`); test `messages response bytes identical before and after trim`. If that test cannot pass, the trim must also touch the message row in the same transaction to bump PG `xmin` — decided by the test, not assumed. I-8c.4 `events_json` never touched. I-8c.5 terminal-only (`running attempt untouched`).
7. **Wiring:** policy factory in Jini `chat` (`createAttemptBaseTrimPolicy({ kernel, now })`), registered by Tovu ST-6a only after the proof file is green.

## 15 · ST-9 · `chat/0004_chat_pinned` + mount (Tovu)
1. **Data model:** ADR-066 TS migration `chat/0004_chat_pinned`: `ALTER TABLE ai_chats ADD COLUMN pinned_at INTEGER` (PG `BIGINT`), `CREATE INDEX IF NOT EXISTS ai_chats_owner_cleanup …`. Update registries, `checksums.ts`, `source-digests.ts`, fresh bootstrap `openChatDb` (`W/platform/db/sqlite/chat-db.ts:49-72`), dialect coverage.
2. **Algorithm:** migration runs inside the runner's transaction (DDL only; **no `VACUUM`, no pragma**). Mount Jini specs in `W/server/runtime/composition/modules/assistant-chats.ts` beside `:329-330`. PATCH: parse `{ title?, pinned? }`; neither → 400 "Nothing to change."; `pinned` must be boolean; both → one transaction: `setPinned` then `rename(…, { source })` keeping `source: body.source === 'generated' ? 'generated' : 'manual'` (`:192-194`); null from either → 404.
3. **State machine:** schema version 3 → 4.
4. **Concurrency/crash:** migration atomic; downgrade: an older build ignores the extra column (SQLite and PG) — safe.
5. **Failure:** migration failure → existing migration error path (copy kept).
6. **Invariants:** I-9.1 rename still works with no pinned field (`rename still works with no pinned field`). I-9.2 generated-title semantics preserved (`generated title does not override a manual rename`). I-9.3 fresh bootstrap = migrated schema (`fresh bootstrap = migrated schema`; mutation: omit the fresh-bootstrap DDL). I-9.4 checksums/digests updated (`migration manifest is complete`). I-9.5 no VACUUM in any migration (`no migration contains VACUUM or auto_vacuum` — a static test over the migration sources).
7. **Wiring:** Tovu passes owner-bound store factory + `PreviewStore` into Jini specs. Depends on ST-8a + Jini release.

## 16 · ST-10 · Admin chat list: pin, multi-select delete, "Delete older than" (Tovu)
1. **Data model:** client state only.
2. **Algorithm / 3. State machine (dialog):** `closed → choosing(X: 1 day…1 year, default 90 days) → previewing → preview-shown({count, bytes, kept}) → applying(chunk k/n) → done({deleted, kept[]}) | error(message)`; `expired` → back to `choosing` with "This preview is out of date. Preview again." Delete-selected: `selecting → confirm({count}) → applying → done`.
4. **Concurrency:** apply button disabled while applying; a second tab's token is separate (one live token per principal → issuing a new one invalidates the older; the older tab gets `expired`).
5. **Failure:** plain messages from the server; ERR- ids shown as "(error ERR-…)".
6. **Invariants:** I-10.1 dialog shows the server count before deleting (`dialog shows the server count before deleting`). I-10.2 kept items are named (`kept items are named`). I-10.3 no delete without the preview token (mutation: call apply without token). I-10.4 hooks as props, admin kit only (`uses injected hooks`).
7. **Wiring:** `@jini-ai/admin` kit, ST-8b component, hook props `useChatCleanup({ preview, apply })` supplied by the panel composition. Depends on ST-9, ST-8b.

## 17 · ST-11a · Durable media GC protocol (Jini `cms/media`)

**Today (verified):** three phases — tombstone (`blob-gc.ts:202-222`, row `status='tombstoned'`), delete-pass (`:263-295`: grace check, re-check, write `journalRepo` entry, remove blob row), unlink-pass (`:331-360`: per journal entry, if no live blob row → `blobStore.remove` → drop entry). Every phase serializes with the **in-process** `withSha256Lock` only (`:16-21,44`); live-entry and snapshot conjuncts are stubs that answer "unreferenced" (`:59-99`). **Defect:** a second process (CLI import, desktop sidecar, PG multi-instance) can insert a blob row and write the same content-addressed bytes between the unlinker's "no live row" read and `blobStore.remove` → live media loses its bytes.

1. **Data model.**
   - `asset_blobs`: add `purge_reason TEXT NULL` (`'owner-purge'|'trash-ttl'|'upload-rollback'`), set when tombstoned; legacy tombstones have NULL.
   - Journal (Tovu table in ST-11b, Jini port `BlobGcJournalPort`): row per **exact storage key** `{ workspaceId, storageKey, sha256, kind: 'original'|'rendition', reason, journaledAt, attempts, lastError? }`, PK `(workspace_id, storage_key)`. Rendition keys come from `cleanupJournal` (`media-service.ts:862,888-891`), captured before rendition rows are removed.
   - Fence key: `blob:<workspaceId>:<storageKey>` via `kernel.lockKey` inside `kernel.transaction` (cross-process: SQLite `BEGIN IMMEDIATE`; PG advisory xact lock).
   - Ports: `BlobReferenceProbes { hasLiveEntryRefs, oldestRetainedRecoveryAgeMs }` become **required** for the unlink phase; no stub fallback on that path.
2. **Algorithm.**
   - **Upload / transfer / restore (every byte writer):** `transaction{ lockKey(fence); upsert asset_blobs(status='live', purge_reason=NULL) — resurrects a tombstone; delete any journal row for this key }` → write bytes (content-addressed, idempotent) → **verify after write** (size + sha) → insert media row. Claim-before-write means an unlinker that later takes the fence sees `live` and skips; verify-after-write repairs the case where an older unlinker removed bytes between our claim… which cannot happen because the unlinker re-checks under the fence (below) — the verify is defence in depth for foreign writers.
   - **Purge (owner or Trash TTL):** existing `removeMediaRowsAndTombstoneBlob` (`media-service.ts:883-902`) inside `cleanupTransaction`: journal rendition keys → remove renditions → remove media row → tombstone with `purge_reason`. Upload rollback uses reason `upload-rollback`.
   - **Delete phase (per tombstoned blob, batch ≤ 100):** `transaction{ lockKey(fence); row still tombstoned; grace = max(30 d, oldestRetainedRecoveryAgeMs()) elapsed; isBlobUnreferenced (active/trashed media rows, live entry refs probe, renditions or other blobs naming the same key — same shape as `hasFormFileStorageKeyOwners`, `form-file-purge.ts:60-73`); purge_reason eligible (I-11a.6) → insert journal row(s) for original key; remove blob row }`.
   - **Unlink phase (per journal row, batch ≤ 50 local / 1 remote):** `transaction{ lockKey(fence); owners = live blob row for key ∪ rendition rows with key ∪ pending forms outbox job for key ∪ pending publish-transfer staging for key; owners → delete journal row (someone owns it now), skip; else blobStore.remove(key) (ENOENT ok) → delete journal row }`. The fence is held **across** the remove: local fs unlink is O(1); for a remote store the per-item transaction has a 10 s timeout and batch size 1 (PG advisory lock is fine to hold; SQLite writer turn of ≤ 10 s is acceptable for a nightly pass — but see limits).
   - **Probe failure:** any probe throws or is absent → leave the journal row, `attempts+1`, `lastError` plain; never unlink (fail closed).
   - **Forms mapping (check 6):** the forms outbox cleanup (`createFormMediaCleanup`, `form-file-purge.ts:40-58`) keeps its own outbox jobs but its final unlink calls the same `unlinkIfUnowned({ workspaceId, storageKey })` primitive under the same fence; and the GC unlink phase treats a pending forms outbox job for the key as an owner. Lock order stays: DB transaction outermost; never await `withSha256Lock` inside a SQLite transaction (the forms `tombstoneLock` bypass already encodes this, `:47-51`). `withSha256Lock` remains only as an in-process optimisation **outside** transactions.
3. **State machine (per storage key):** `live → tombstoned(reason, at) → journaled(blob row gone) → unlinked(journal row gone)`; any writer can move `tombstoned|journaled → live` under the fence; `journaled + owner found → (journal dropped, bytes kept)`.
4. **Concurrency/crash.** Crash after tombstone: retried by delete phase. Crash after journal insert + row removal commit, before unlink: journal row remains → unlink phase retries. Crash after `remove`, before journal delete commit: transaction rolls back the journal delete → retry → `remove` ENOENT ok → delete. Two GC passes (two processes): both serialize on the fence; the second sees the journal row gone. Clock forward jump: grace may elapse early, but `oldestRetainedRecoveryAgeMs` is computed from the same clock, and unlink still requires no owner — worst case is earlier removal of bytes no row or recovery copy references.
5. **Failure/limits:** ≤ 100 tombstones and ≤ 50 unlinks per pass; remote store errors → journal `attempts+1`, exponential next-try (1 h, 4 h, 1 d, cap 7 d) stored as `nextAttemptAt`; ENOSPC irrelevant (deletes). Messages: "Kept: this file is still used by …" (protected), "Couldn't remove a deleted file's bytes; will retry (error ERR-…)".
6. **Invariants:** I-11a.1 crash between claim and unlink resumes (`crash between claim and unlink resumes`). I-11a.2 cross-process same-hash re-upload keeps the file (`cross-process same-hash re-upload keeps the file`, two connections; mutation: use the in-process hash lock only). I-11a.3 rendition sharing bytes kept (`rendition sharing bytes kept`). I-11a.4 missing probe → no unlink (`absent snapshot probe fails closed`). I-11a.5 bytes outlive every retained recovery copy that may reference them (`grace extends to the oldest retained copy`). I-11a.6 eligibility by provenance (`legacy tombstone without reason is never unlinked`; `trash-ttl eligible only if OWNER-Q-11a says so`). I-11a.7 forms and GC agree (`forms job pending keeps the bytes`). I-11a.8 never await the JS hash lock inside a SQLite transaction (`no deadlock with an upload holding the hash`).
7. **Wiring:** Jini `cms/media` exports the three phases + `unlinkIfUnowned` with ports `{ kernel, blobRepo, mediaRepo, renditionRepo, journal, blobStore, probes, clock }`. On `ex4-media-jini` the site media pieces move under `J/cms/src/media/site/*` — put the host-neutral protocol next to `blob-gc.ts`, not under `site/`. Changeset cms major (probe ports required on the unlink path).
8. **OWNER-Q-11a:** are bytes of media removed by the existing 60-day Trash TTL (`W/features/trash/ports.ts:33`) eligible for automatic byte removal after the 30-day grace, or only bytes the owner purged by hand? **Recommend eligible** — the Trash TTL is an owner-visible, owner-approved rule ("items in Trash are deleted after 60 days"), the bytes are unreachable after it, and grace adds 30 more days; provenance is still recorded so this can be narrowed later.

## 18 · ST-11b · `content/0043_blob_gc_journal` + adapter + policy (Tovu)
1. **Data model:** ADR-066 migration `content/0043_blob_gc_journal`: table `blob_gc_journal(workspace_id, storage_key, sha256, kind, reason, journaled_at, attempts DEFAULT 0, next_attempt_at, last_error, PRIMARY KEY(workspace_id, storage_key))`; `ALTER TABLE asset_blobs ADD COLUMN purge_reason`. Fresh bootstrap (`W/platform/db/sqlite/fresh-content-db.ts:57-77`), checksums, digests, dialects. No VACUUM (I-9.5 static test covers it).
2. **Algorithm:** adapter implements `BlobGcJournalPort` on the content kernel. Policy `media-bytes` (kind `old-copy`): `measure()` = sum of sizes of tombstoned + journaled keys (stat; unknown on error) + legacy orphan report; `sweep()` = delete phase then unlink phase (bounded). Tovu probes: `oldestRetainedRecoveryAgeMs = now − min(createdAt of pre-migration copies, pre-compact copies, restore points incl. protected)`; `hasLiveEntryRefs` = real query over the content tables that hold media references (or explicit `true` = keep, until written).
   - **Legacy orphans** (bytes under `uploads/` with no blob row and no journal row) → report-only list, never removed.
3. **State machine:** as §17.
4. **Concurrency:** runs inside the serving process under the runner; CLI `clean` runs it under the lease.
5. **Failure/limits:** per §17.
6. **Invariants:** I-11b.1 purged file removed only after grace (`purged file removed only after grace`). I-11b.2 trashed-media reference kept. I-11b.3 legacy orphan reported, not removed (mutation: delete legacy orphans). I-11b.4 protected restore point keeps old bytes (`protected restore point extends grace`). I-11b.5 fresh bootstrap = migrated schema.
7. **Wiring:** depends on ST-11a + Jini release, ST-6a. On `ex4-media-tovu`, `W/platform/db/repos/media-repo.ts` changes — rebase the adapter onto its destination.

## 19 · ST-12b · Expiry pass, revoked retry, download gates (Tovu)
1. **Data model.** New create-only tombstone `<shareId>.expired` (content: ISO time), mirroring `<shareId>.revoked` (`share-registry.ts:117-125`); `registry.get`/`list` overlay it as `status: 'expired'` the same way they overlay `.revoked` (`:85-95`) — so a racing whole-record `put` (acknowledge/delivery rewrite) can never resurrect `active`. Status union gains `'expired'`. Artifact `ops/shares/<id>.tovu.zip`. Token reservation files and tombstones kept forever (row 35).
2. **Algorithm (policy `share-files`, kind `old-copy`):**
   - `measure()`: ZIP bytes of rows that are (a) revoked with ZIP present, (b) past own `expiresAt` with ZIP present.
   - `sweep()`: for each row under the in-process `shares:<id>` mutex (≤ 50 per pass):
     - **Expired** (`expiresAt` set and `isShareExpired`, provider own-folder — ST-12a refuses others): 1) `writeFile(<id>.expired, now, { flag: 'wx' })` (EEXIST ok) — readers now see `expired`; 2) `deleteArtifact` (ENOENT ok; EBUSY/EPERM on Windows → keep, retry next pass); 3) nothing else — metadata, token and tombstones stay.
     - **Revoked with ZIP present:** `deleteArtifact` only (the revoke already tombstoned; this is the "Retry revoke" of `share-service.ts:110-111`, local part only). Remote-copy failures stay manual (owner presses Retry revoke with the original provider binding, `deleteRemoteArtifact` `:115-124`).
     - Never touched: active without `expiresAt`, peer-uploaded rows (`url: null`, no `storage`), `failed` rows (remote copy may exist — report-only), metadata, `.token`, tombstones.
   - **Download gates (no lock across streams):** public route — `findToken` already refuses past `expiresAt` (§5); add: `servesToken` requires `status === 'active'` (`share-registry.ts:146-147`), which the overlay makes false once `.expired` exists. Admin route — reject `revoked` **or** `expired` with "This link expired on <date> and its file was removed." (fixes D12a-1 at `site-shares.ts:141`). A download admitted before step 2 has an open file handle: POSIX keeps the inode; Windows libuv opens with delete-sharing, so unlink succeeds or fails EBUSY and is retried — the in-flight stream always completes. A download looked up before step 1 but opened after step 2 gets `sendFile` ENOENT → 404 (`site-share.ts:18-20`), which is the correct answer for an expired link.
3. **State machine (share):** `active → revoked` (owner) | `active → expired` (own date) | `active → failed` (delivery); `expired`/`revoked` terminal; ZIP `present → removed` only after the tombstone.
4. **Concurrency/crash.** Cross-process: only the lease holder runs the pass; the public and admin routes run in the same serving process. A revoke racing an expiry: both tombstones are create-only; overlay precedence `revoked > expired`. Crash after tombstone, before unlink → next pass unlinks (ZIP present + `expired`). Reentrant verification (check 7): no lock is held while serving, so a remote provider's verification callback into the share server cannot deadlock. Clock: back = later expiry; forward = earlier, but only for links whose owner chose an expiry.
5. **Failure/limits:** ≤ 50 rows per pass; unlink error other than ENOENT/EBUSY/EPERM → P4 reporter, continue.
6. **Invariants:** I-12b.1 active link without expiry untouched (`active link without expiry untouched`; mutation: expire rows without `expiresAt`). I-12b.2 tombstone before unlink (`interrupted expiry retried`; mutation: unlink first). I-12b.3 token stays reserved (`token stays reserved`). I-12b.4 a racing `put` cannot resurrect (`acknowledge after expiry keeps it expired`). I-12b.5 in-flight download completes (`download admitted just before expiry completes`). I-12b.6 admin download of an expired share answers the expired message. I-12b.7 peer-uploaded and `failed` rows untouched.
7. **Wiring:** policy in `W/features/site-backup/share-retention.ts` (≤ 80 lines: `expireOne`, `retryRevoked`, `listCandidates`); registry gets `markExpired`. Admin share screen: expiry choice (Never default / 7 / 30 / 90) and "Expired" badge via hook props (D12a-2). On `ex4-deploy-tovu`/`ex5-fnd-*`, `share-backend.ts`/`share-hosting.ts` change — rebase; registry/service files are not moved by them.
8. **OWNER-Q-12b:** after expiry, keep the row visible as "Expired" forever, or hide it after 90 days? **Recommend keep visible** (metadata is tiny; it explains to the owner why a link stopped).

## 20 · ST-13 · Manual revision thinning (Tovu)
1. **Data model:** none new; `post_revisions` (incl. HTML Pages, `W/features/pages/html-document-store.ts:113,479`). Protection ports: `{ isPublishedRevision, isRestoreTarget, isUndoReferenced }` injected (each a scoped query; HTML page undo change sets per P1-T2's `page-html` reverter).
2. **Algorithm:** `preview({ workspaceId, postId, olderThan })` → candidates = revisions with `created_at < olderThan` minus the newest revision minus protected ones → `PreviewStore` token (X6). `apply(token)`: `kernel.transaction{ lockKey('post_revisions:<ws>:<postId>') (same key as appendRevision, `W/features/post/repo.ts:315-318`); recompute protection for each id; delete ids ∈ preview ∩ still-unprotected ∩ not-newest }`. Batch ≤ 500 per post. Scope is always one post/page (explicit; no site-wide thinning).
3. **State machine:** revision `kept | thinned` (terminal).
4. **Concurrency:** a new revision appended after preview takes the same lock → apply's "newest" recheck keeps it and its predecessor chain semantics (`previousId`) — deleting a middle revision must keep `previousId` integrity: re-point the next revision's `previous_id` to the deleted one's predecessor in the same transaction (or, if the schema forbids, thin only a contiguous oldest run). Probe error → keep (fail closed).
5. **Failure:** "Kept: this version is published." / "…is a restore point." / "…can still be undone."
6. **Invariants:** I-13.1 published/restore/undo targets kept (mutation: drop the undo-reference check). I-13.2 newest kept. I-13.3 requires explicit scope. I-13.4 reference added after preview kept (`undo reference added after preview is kept`). I-13.5 previous-id chain stays valid (`history reads the same after thinning`). I-13.6 two-connection PG test of the lock.
7. **Wiring:** Tovu feature `W/features/post/revision-thinning.ts`; route spec + approval card for the agent tool (destructive). Depends on Q6 (approved: manual only).
8. **OWNER-Q-13:** thin by date only, or also "keep one per day"? **Recommend date only** for v1 (simplest preview to understand).

## 21 · ST-15 · Storage HTTP + agent tools — split (check 8)
- **ST-15a (Jini `platform`, specs only — no HTTP server code):** route **specs** in a small Jini domain module `J/platform/src/retention/routes.ts` using `defineJsonRoute` (core contract, no Express): `GET storage/report → measure()` and `POST storage/cleanup { dryRun = true } → runner.runOnce({ dryRun })`. Deps: `{ runner, measure }`. Changeset platform minor. (If the layer check refuses `platform` → `core` contracts, put the specs in Tovu instead and say so; do not add a package above domains.)
- **ST-15b (Tovu):** mount at `/api/admin/storage/*` behind owner role; dry run returns the runner's measured outcomes + ST-14 categories.
- **ST-15c (Tovu):** tools `site_storage_report` (read, no confirmation) and `site_storage_cleanup` (`class: 'destructive'`, `confirmation: 'always'`, `dryRun` default true). Live run: tool first performs a dry run, the approval card lists categories + bytes, approve → `runOnce({ dryRun: false })`. Any request naming chats/revisions/screenshots/media-in-use → refused "Tovu never deletes your content automatically. Use the Chats/Revisions screens." 
- **Invariants:** I-15.1 cleanup defaults to dryRun (mutation: default false). I-15.2 content class refused in plain words. I-15.3 approval card raised for live cleanup. I-15.4 owner role only. I-15.5 a dry run during a live pass returns a measurement (runner I-4).

## 22 · ST-16 · CLI `clean` and `compact` (Tovu; report built)
1. **Data model:** none new.
2. **Algorithm:** `tovu storage clean <dir> [--dry-run] [--json]`: `claimSiteRunning({ purpose: 'maintenance' })` → attached → exit 3 "This website is running; clean it from its Storage screen." → open stopped-site handles (writable, **after** the lease) → build the same policy list as ST-6a with those handles → `createRetentionRunner(...).runOnce({ dryRun })` → print outcomes → close handles → release. `compact` → ST-7b `compactStoppedSite`. Exit codes: 0 done, 2 partial (some deferred), 3 running, 1 error (ERR- id printed).
3. **State machine:** per invocation `claim → open → run → close → release`.
4. **Concurrency/crash:** lease per X2; crash releases by process exit.
5. **Failure:** messages as each policy's outcome.
6. **Invariants:** I-16.1 report does not migrate (built). I-16.2 running site refused with the plain line (`running site → "This website is running; clean it from its Storage screen."`). I-16.3 no writable open before the lease (mutation: open writable before the lease). I-16.4 `clean` never runs a normal boot (no migrations) (`clean does not migrate`). I-16.5 `--dry-run` never deletes.
7. **Wiring:** CLI composition root (as the report command, `.dependency-cruiser.mjs` entry added on p11-next-tovu).

## 23 · ST-17 · Admin Storage screen (Tovu)
- **States:** `loading → shown(report) → previewing → preview-shown(outcomes) → cleaning → done(freed, failures) | error`. Bars labelled "Cleaned automatically" / "Yours" / "Shown only"; "Clean up now" always shows the dry-run list first (I-17.1, mutation: skip the dry run); links to Chats (ST-10), Trash, Database (restore points, compaction state incl. needs-attention actions D7a-4), Exports (ST-12b), Screenshots ("Delete older than…" via X6 preview), Revisions (ST-13). Three class labels (I-17.2); last automatic pass time and result from `lastReport` (I-17.3); admin kit + hook props only (I-17.4).
