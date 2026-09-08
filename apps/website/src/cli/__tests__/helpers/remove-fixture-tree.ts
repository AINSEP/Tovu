import fs from "node:fs";

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
 * Retries only `ENOTEMPTY`, and only for a bounded window. Any OTHER failure is rethrown
 * immediately — a permissions problem or a bad path is a real finding, not noise to suppress.
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
  for (;;) {
    try {
      fs.rmSync(parent, { recursive: true, force: true });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw err;
      if (Date.now() >= deadline) {
        process.stderr.write(
          `removeFixtureTree: gave up on ${parent} after ${RETRY_BUDGET_MS}ms — a spawned process is still writing there\n`
        );
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_INTERVAL_MS);
    }
  }
}
