/**
 * @file Route SIGINT/SIGTERM/SIGHUP into `main.ts`'s graceful quit exactly once, so a termination
 * signal stops every open site's `tovu serve` instead of stranding it.
 *
 * **The defect this exists for.** `kill -TERM <dev-desktop.mjs>` left `tovu serve` running with PPID 1,
 * still holding its site's `content.db`, with the agent daemon tree hanging off it. Two facts
 * combined, both measured against Electron 43 on macOS with a scratch app (2026-09-12):
 *
 * - Chromium's own handler for these three signals is ONE-SHOT. `GracefulShutdownHandler`
 *   (`shell/browser/electron_browser_main_parts_posix.cc`) resets the signal to `SIG_DFL` and posts
 *   `Browser::Quit`. A single SIGTERM therefore gets a clean `before-quit` drain; a second copy
 *   arriving before that drain ends kills Electron outright.
 * - Every launcher delivers more than one copy. `dev-desktop.mjs` signals `npm run dev`'s whole
 *   process group, so Electron gets the group's copy, then `electron/cli.js` forwards its own, and
 *   npm forwards another. A terminal Ctrl-C reaches the whole foreground group the same way. Electron
 *   died with `exited with signal SIGTERM` before `before-quit` had stopped anything, and
 *   `tovu-server.ts` spawns `detached`, so the child was outside every group kill.
 *
 * A Node `process.on(signal)` listener is persistent, so it absorbs every copy. It only takes effect
 * once the app is READY: Chromium installs its handler after `main.ts` has loaded, which silently
 * replaces a listener registered at module load. The probe showed no module-load listener ever firing.
 *
 * **Once, not per copy.** Calling `app.quit()` for each copy re-enters `before-quit` while its drain
 * is still running. `before-quit`'s old `shuttingDown` guard let that call through, and Electron
 * exited mid-drain, which is the same leak with extra steps (also measured). `quit-drain-gate.ts` now
 * holds any quit attempt made during the drain. The first signal requests the quit, and later copies
 * do nothing.
 *
 * **Bounded.** Absorbing repeats removes the old accidental escape hatch: a second signal can no longer
 * end a drain that has hung (`endSiteSession`'s loopback logout has no timeout of its own). The
 * first signal therefore also arms a deadline that force-exits. A row still in `open-sites.json` then
 * lets the next launch's `reconcileOrphans()` reap whatever the drain did not reach.
 *
 * No `electron` import, so it can be tested under plain `node --test`, the same convention as
 * `shutdown-tracker.ts`.
 */

/** The same three signals Chromium's one-shot handler takes. */
const QUIT_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/** A timer as {@link routeQuitSignals} uses it: `setTimeout`, or a recording fake in tests. */
type QuitTimer = (fn: () => void, ms: number) => { unref?: () => void };

/** {@link routeQuitSignals}'s input. */
interface QuitSignalInput {
  processLike: { on(signal: NodeJS.Signals, listener: () => void): unknown };
  quit: () => void;
  forceExit: () => void;
  deadlineMs: number;
}

/** {@link routeQuitSignals}'s options. */
interface QuitSignalOptions {
  setTimer?: QuitTimer;
}

/**
 * Register one persistent listener per {@link QUIT_SIGNALS} entry. The first signal calls `quit()`
 * and arms the `forceExit()` deadline, and every later signal is absorbed.
 *
 * @param input
 * @param input.processLike `process`, or a fake emitter in tests.
 * @param input.quit the graceful quit, i.e. `app.quit()`, which runs `before-quit`'s drain.
 * @param input.forceExit the last resort once `deadlineMs` passes, i.e. `app.exit(1)`.
 * @param input.deadlineMs how long the graceful quit gets before `forceExit`.
 * @param [options] timer seam; `setTimer` defaults to `setTimeout`.
 * @complexity O(1): three registrations, and O(1) work per signal.
 */
function routeQuitSignals(input: QuitSignalInput, options: QuitSignalOptions = {}): void {
  const setTimer: QuitTimer = options.setTimer ?? setTimeout;
  let requested = false;

  const onSignal = () => {
    if (requested) return;
    requested = true;
    setTimer(input.forceExit, input.deadlineMs).unref?.();
    input.quit();
  };

  for (const signal of QUIT_SIGNALS) input.processLike.on(signal, onSignal);
}

export { routeQuitSignals, QUIT_SIGNALS };
export type { QuitSignalInput, QuitSignalOptions, QuitTimer };
