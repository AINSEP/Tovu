import fs from "node:fs";
import path from "node:path";

/**
 * @file Shared teardown for every `cli/__tests__` suite that spawns a real `tovu serve` process.
 *
 * Precedent: `server/__tests__/helpers/http-test-server.ts` — one helper module the suites import,
 * rather than a third hand-copy of the same loop.
 */

const RETRY_BUDGET_MS = 10_000;
const RETRY_INTERVAL_MS = 100;

/**
 * Removes a fixture tree, retrying briefly on `ENOTEMPTY`.
 *
 * The agent daemon `tovu serve` spawns is `detached: true`, so it can still be finishing a write
 * under the served site (the agent-plugin package seed, in practice) for a moment after the serve
 * process itself has been reaped. A single `rmSync` racing that writer fails with `ENOTEMPTY` even
 * with `force: true` — that flag suppresses "does not exist", not "a file appeared under a
 * directory I had already emptied".
 *
 * This became reachable on 2026-09-07, when `serve.ts` started pinning `TOVU_SITE_DIR` to the
 * served directory: before that the daemon resolved its site-derived paths against
 * `<process.cwd()>/sites/tovu-com` and wrote those files into the REPO rather than the fixture —
 * the split-brain that pin exists to fix (see `pinServedSiteDirIntoEnv`), which is also why this
 * repo accumulated untracked `sites/tovu-com/agent-plugins/**` entries. The race had nothing in the
 * temp tree to collide with because the writes were not landing there at all.
 *
 * A read-only subtree fails the same `rmSync` too: the agent-plugin package store
 * (`agent-plugins/…/packages/sha256/<digest>`) is written read-only on purpose (immutability), so
 * unlinking inside it fails with `EACCES`/`EPERM`, which `rmSync` can surface as `ENOTEMPTY` on the
 * parent. On any of those codes this restores owner write permission under `parent` — and only
 * there — then retries. That is the teardown's job, not a weakening of the store's design.
 *
 * Retries only `ENOTEMPTY` for the bounded window; `EACCES`/`EPERM` get one retry after the
 * permission restore. Any OTHER failure — or a permission error that survives the restore — is
 * rethrown immediately: a bad path or a tree this process cannot own is a real finding.
 *
 * A tree still occupied after {@link RETRY_BUDGET_MS} warns and gives up rather than throwing,
 * because the writer is not always transient: `spawnRealDaemonProcessFor` launches the daemon as
 * `spawn("npx", ["tsx", …], { detached: true })` in a dev/test tree, so `shutdownAssistantDaemon()`
 * signals the `npx` wrapper and the `tsx` grandchild can outlive it — an orphan holding the served
 * site's SQLite files open, recreating `-wal`/`-shm` under a directory this loop has already
 * emptied, indefinitely. That is a real (pre-existing, out-of-scope here) process-lifecycle gap,
 * reported rather than fixed by this helper; what must NOT happen meanwhile is a suite whose every
 * assertion passed being failed by its own cleanup. The leftover is a `mkdtemp` directory under
 * `os.tmpdir()`, which the OS reclaims.
 *
 * Synchronous on purpose: several of these teardowns sit in non-async tests, and one helper both
 * kinds can call is better than two. `Atomics.wait` on a private buffer is the standard sync sleep.
 *
 * @param parent - the temp directory to remove, recursively.
 * @complexity Bounded — at most `RETRY_BUDGET_MS / RETRY_INTERVAL_MS` attempts.
 */
export function removeFixtureTree(parent: string): void {
  const deadline = Date.now() + RETRY_BUDGET_MS;
  let restoredAfterPermissionError = false;
  for (;;) {
    try {
      fs.rmSync(parent, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        if (restoredAfterPermissionError) throw err;
        restoredAfterPermissionError = true;
        restoreOwnerWrite(parent);
        continue;
      }
      if (code !== "ENOTEMPTY") throw err;
      restoreOwnerWrite(parent);
      if (Date.now() >= deadline) {
        process.stderr.write(
          `removeFixtureTree: gave up on ${parent} after ${RETRY_BUDGET_MS}ms — last error ${code} (a spawned process may still be writing there)\n`
        );
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_INTERVAL_MS);
    }
  }
}

/**
 * `chmod -R u+w` (plus `u+rx` on directories, so they can be listed and traversed) under `root`.
 * Symlinks are skipped, never followed, so nothing outside the fixture tree is touched. Entries
 * that vanish mid-walk are ignored — a concurrent writer or a partial earlier `rmSync` removes them.
 *
 * @param root - the fixture tree to make removable.
 * @complexity O(entries under `root`).
 */
function restoreOwnerWrite(root: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(root);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    tryChmod(root, stat.mode | 0o200);
    return;
  }
  tryChmod(root, stat.mode | 0o700);
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) restoreOwnerWrite(path.join(root, entry));
}

function tryChmod(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode & 0o7777);
  } catch {
    // Vanished or not ours — the retrying rmSync reports whatever is still wrong.
  }
}
