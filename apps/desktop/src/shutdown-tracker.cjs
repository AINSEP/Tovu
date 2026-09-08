/**
 * @file The set of teardowns that have been STARTED but have not finished, so `main.cjs`'s
 * `before-quit` drain can wait for them.
 *
 * **The defect this exists for (D-09).** A site window's `closed` handler removes its entry from
 * `openSites` synchronously, then starts an asynchronous teardown — end the admin session over
 * loopback, then `server.stop()` (SIGTERM plus `serve.ts`'s BR-07 drain, up to 5 s). Closing the
 * LAST window therefore left `openSites` empty while the child was still very much alive:
 *
 * - `window-all-closed` fires immediately after `closed` and calls `app.quit()`;
 * - `before-quit` reads `openSites.size === 0`, concludes there is nothing to drain, and returns
 *   without `preventDefault()`;
 * - Electron exits, and the pending teardown never resolves — often `server.stop()` is never even
 *   reached.
 *
 * The child survives that: `tovu-server.cjs` spawns `detached: true`, so it is its own process-group
 * leader and outlives its parent. And because the `closed` handler had already dropped the
 * crash-safety row, the NEXT launch's `reconcileOrphans()` has nothing to find — a stranded
 * `tovu serve` holding a site's `content.db` open forever, invisible to the one mechanism built to
 * reap exactly that.
 *
 * The same gap applies with several sites open, less visibly: closing one of them leaves that one's
 * teardown unawaited while `before-quit` drains only the others.
 *
 * Deliberately knows nothing about sites, servers, windows or Electron — it holds promises. That is
 * what makes it testable under plain `node --test`, the same convention as `keyed-serializer.cjs`,
 * `selftest-tracker.cjs` and `site-supervisor.cjs`.
 */

/**
 * @returns a tracker with {@link track}, `size`, and {@link drain}.
 * @complexity O(1) to construct.
 */
function createShutdownTracker() {
  /** @type {Set<Promise<void>>} teardowns started and not yet settled. */
  const pending = new Set();

  return {
    /**
     * Register an in-flight teardown. The tracked promise is pre-neutralized with `.catch()`, so a
     * teardown that rejects is still *waited for* and still leaves {@link drain} resolving — a quit
     * that hangs on a failed logout would be strictly worse than the leak this whole module exists
     * to close.
     *
     * @param promise the teardown to wait for.
     * @returns the neutralized promise, so a caller can await this one instead of the original.
     * @complexity O(1).
     */
    track(promise) {
      const settled = Promise.resolve(promise).then(
        () => {},
        () => {}
      );
      pending.add(settled);
      void settled.then(() => pending.delete(settled));
      return settled;
    },

    /** How many teardowns are still in flight — what `before-quit` reads alongside `openSites.size`
     *  to decide whether it has anything to wait for at all.
     *  @complexity O(1). */
    get size() {
      return pending.size;
    },

    /**
     * Resolve once every tracked teardown has settled, INCLUDING any registered while this was
     * already waiting. A single `Promise.all` over one snapshot would miss those, and the ordinary
     * shutdown does exactly that: draining one site's stop can be what lets another's `closed`
     * handler run.
     *
     * @complexity O(n) in teardowns, bounded by each one's own duration; the loop cannot spin, since
     *   every iteration awaits at least one promise that is already in the set.
     */
    async drain() {
      while (pending.size > 0) {
        await Promise.all([...pending]);
      }
    },
  };
}

module.exports = { createShutdownTracker };
