# Codex gpt-5.6-sol (high) limited review of 2026-09-28 changes (962f928fb..3fa362725)

## Part A: platform/server/cli/contracts (179 files)
Codex(Review Mode):

1. **HIGH** — [pglite-owner.ts:154](/Users/la/Programming/Tovu/apps/website/src/platform/db/kernel/drivers/pglite-owner.ts:154) — Owner-lock acquisition can delete a newly created lock while its PID is still being written.  
   Scenario: two simultaneous starters both become owners and open the same PGlite directory, risking corruption.  
   Fix: use an atomic lock directory, or treat an empty/unreadable fresh lock as contended and retry without unlinking it.

2. **HIGH** — [move-site-storage.ts:99](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/move-site-storage.ts:99) — Target emptiness is checked outside the copy transaction, while `copyPgStore` later unconditionally truncates its tables.  
   Scenario: another process inserts data after the check; the move either deletes those rows or produces a mixed database.  
   Fix: lock target tables and recheck emptiness inside the same transaction before any `TRUNCATE`.

3. **HIGH** — [init-site.ts:303](/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/init-site.ts:303) — Postgres initialization opens and seeds the supplied database without refusing an existing populated Tovu database.  
   Scenario: initializing against another site's database creates a new site identity/key that silently shares its content and cannot decrypt its credentials.  
   Fix: require no non-ledger rows before initialization, with a separate explicit adoption workflow for existing databases.

4. **MEDIUM** — [pglite-owner.ts:121](/Users/la/Programming/Tovu/apps/website/src/platform/db/kernel/drivers/pglite-owner.ts:121) — The `/tmp/tovu-<uid>/<key>` fallback validates only the final directory, not its attacker-controlled parent.  
   Scenario: another local user pre-creates the parent, renames the checked child, and substitutes the expected socket path, enabling denial of service or socket impersonation.  
   Fix: create and validate the per-UID parent itself as non-symlinked, owner-owned, and `0700`.

5. **MEDIUM** — [serve.ts:294](/Users/la/Programming/Tovu/apps/website/src/cli/commands/serve.ts:294) — Once `bootSiteDir` succeeds, several subsequent failures have no teardown path.  
   Scenario: an invalid host, dependency-composition failure, daemon-port failure, or `EADDRINUSE` leaves the PGlite owner/socket and started background workers alive, potentially hanging the command.  
   Fix: put all post-boot setup in an ownership `try/finally`, explicitly stopping workers and closing `bootResult` on rejection.

6. **MEDIUM** — [serve.ts:481](/Users/la/Programming/Tovu/apps/website/src/cli/commands/serve.ts:481) — Shutdown starts `closeSiteDirBoot()` but immediately calls `process.exit(0)` without awaiting it.  
   Scenario: PGlite shutdown is interrupted before its database flush, socket removal, and owner-lock release complete.  
   Fix: make `finish` asynchronous and await bounded store closure before exiting.

7. **MEDIUM** — [export.ts:133](/Users/la/Programming/Tovu/apps/website/src/cli/commands/export.ts:133) — The export cleanup `try/finally` begins only after asynchronous route dependency composition.  
   Scenario: `createSiteRouteDeps` rejects after a PGlite boot, leaving its owner socket active so the export process may not terminate.  
   Fix: begin the `try/finally` immediately after `bootSiteDir` returns.

8. **MEDIUM** — [open-site-content-db.ts:28](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/open-site-content-db.ts:28) — The opened SQLite connection is not closed when recovery, migration, or content preparation rejects.  
   Scenario: a checksum mismatch or seed failure leaks the handle and can obstruct a retry or file replacement.  
   Fix: wrap the complete preparation sequence in `try/catch`, closing the current handle before rethrowing.

9. **LOW** — [deps.ts:728](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/deps.ts:728) — Both expiry-sweep start sites discard the returned stop function.  
   Scenario: short-lived compositions such as export leave an hourly timer retaining and querying an already-closed chat store.  
   Fix: retain the stop handle and invoke it as part of the owning store/composition teardown.

No additional verified authorization gap, plaintext connection-string leak, or clearly dead duplicated code was found in the reviewed subset.

Summary: **9 findings — 3 HIGH, 5 MEDIUM, 1 LOW.**

## Part B: features/assistant/admin/scripts (169 files)
1. **MEDIUM** — `apps/website/src/index.ts:286` — The store is opened during `createSiteRouteDeps()`, but shutdown ownership is not registered until that entire asynchronous composition succeeds.  
   **Scenario:** Workspace resolution or another post-open composition step rejects; the installed rejection guard keeps the process alive while its Postgres pool or PGlite owner socket/lock remains open, potentially blocking the next boot.  
   **Fix:** Catch every post-open boot failure, `await siteStore.close()`, then terminate; ideally make `createSiteRouteDeps()` close stores when construction fails.

2. **LOW — PLAUSIBLE** — `apps/website/src/assistant/persistence/chat-expiry-sweep.ts:52` — Sweep promises are fire-and-forget, and the returned stop function only clears the interval without waiting for an active pass; composition also discards that stop function.  
   **Scenario:** Shutdown closes PGlite/Postgres while the initial or hourly `DELETE` is still running, producing a close/query race; sufficiently slow passes can also overlap on later intervals.  
   **Fix:** Track the active pass and return an async stop operation that clears the interval and awaits completion, then invoke it before closing the store.

No verified secret exposure, admin authorization gap, path traversal, unintended SQLite regression, or newly dead/duplicated code was found within the permitted files. Tests and builds were not run, as requested.

**Summary: 2 findings — 1 MEDIUM, 1 LOW (PLAUSIBLE).**
