/**
 * @file Decide what `main.ts`'s `before-quit` does with a quit attempt: let it through, start the
 * graceful drain, or hold it because a drain is already running.
 *
 * **The defect this exists for.** A second Cmd+Q during the drain still orphaned site servers.
 * `before-quit` stops every open site's `tovu serve` in parallel, then waits on the window teardowns
 * already in flight, and quits once both finish. Every quit re-enters `before-quit`: Cmd+Q, the
 * menu, a termination signal, `window-all-closed`'s `app.quit()`. The old guard,
 * `if (nothing to drain || shuttingDown) return;`, returned WITHOUT `preventDefault()` once the drain
 * had started, so the second attempt quit Electron before the `server.stop()` calls finished.
 * `tovu-server.js` spawns `detached`, so those children outlived the app.
 *
 * **Held, not let through.** An attempt during the drain is prevented and dropped: the drain's own
 * closing `app.quit()` is the one that ends the app. Held whatever the counts say by then:
 * `site-supervisor.ts` removes a site from `openSites` as soon as its child exits, so "nothing to
 * drain" can read true while the drain has not finished. `main.ts` arms a force-exit deadline when the
 * drain starts, so holding can never keep a hung drain alive forever.
 *
 * No `electron` import, so it can be tested under plain `node --test`, the same convention as
 * `shutdown-tracker.ts` and `quit-signals.ts`.
 */

/** Where `main.ts`'s quit is. See {@link decideBeforeQuit}. */
type QuitPhase = "idle" | "draining" | "drained";

/** What `before-quit` does with one quit attempt. See {@link decideBeforeQuit}. */
type BeforeQuitAction = "proceed" | "drain" | "hold";

/** {@link decideBeforeQuit}'s input. */
interface BeforeQuitInput {
  phase: QuitPhase;
  nothingToDrain: boolean;
}

/**
 * @param input
 * @param input.phase where `main.ts`'s quit is: nothing started, the drain running, or the drain
 *   finished and its own `app.quit()` going through.
 * @param input.nothingToDrain no open site and no window teardown in flight.
 * @returns `"proceed"`: return without `preventDefault()`. `"drain"`: `preventDefault()` and start
 *   the drain. `"hold"`: `preventDefault()` and nothing else.
 * @throws {TypeError} on any other `phase`, so a misspelled phase fails loudly instead of draining
 *   twice. The type rejects one at compile time; this still guards a caller the type cannot see.
 * @complexity O(1).
 */
function decideBeforeQuit(input: BeforeQuitInput): BeforeQuitAction {
  switch (input.phase) {
    case "idle":
      return input.nothingToDrain ? "proceed" : "drain";
    case "draining":
      return "hold";
    case "drained":
      return "proceed";
    default:
      throw new TypeError(`decideBeforeQuit: unknown quit phase ${JSON.stringify(input.phase)}`);
  }
}

export { decideBeforeQuit };
export type { BeforeQuitAction, BeforeQuitInput, QuitPhase };
