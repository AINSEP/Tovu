/**
 * @file How a failed launch ends, and how a `TOVU_DESKTOP_SELFTEST=1` launch reports and exits —
 * the process/dialog effects `main.ts` used to apply inline, extracted so each decision runs against
 * fakes. Electron's `app`/`dialog`, `console` and `process.exitCode` arrive as ports.
 */
import { createSelftestTracker, type SelftestTracker } from "../../selftest-tracker.ts";

/** The process and dialog effects a boot failure may apply. */
export interface BootFailurePorts {
  /** `error instanceof SiteDirSelectionCancelled` (`site-dir-store.ts`). */
  isSelectionCancelled: (error: Error) => boolean;
  /** `TOVU_DESKTOP_SELFTEST === "1"` for this launch. */
  selftest: boolean;
  /** `startup-env.ts`'s `isUnattendedSiteLaunch` over this launch's env; read only when needed. */
  isUnattended: () => boolean;
  /** `dialog.showMessageBox` (no parent window exists yet). */
  showInfo: (options: { type: "info"; title: string; message: string; detail: string }) => Promise<unknown>;
  /** `dialog.showErrorBox`. */
  showError: (required: { title: string; content: string }) => void;
  logError: (message: string) => void;
  setExitCode: (code: number) => void;
  /** `openSites.size`. */
  openSiteCount: () => number;
  quit: () => void;
  exit: (code: number) => void;
}

/** Cancelling the folder picker is the user declining to start: say so (unless headless), exit 0. */
async function reportDeclinedStart(ports: BootFailurePorts): Promise<void> {
  if (!ports.selftest) {
    await ports.showInfo({
      type: "info",
      title: "Tovu",
      message: "No site folder was chosen.",
      detail: "Tovu needs a folder to store your site before it can start. Launch again to choose one.",
    });
  }
  ports.quit();
}

/** An unattended or self-test launch must never block on a modal nobody can dismiss. */
function shouldShowErrorBox(ports: BootFailurePorts): boolean {
  return !ports.selftest && !ports.isUnattended();
}

/**
 * Report a boot failure where the user can actually see it.
 *
 * A packaged `.app` launched from Finder has no terminal attached, so `console.error` alone means
 * the app vanishes with no explanation. Cancelling the folder picker is still not a failure — it is
 * the user declining to start, so this still exits 0 — but it no longer says NOTHING: the picker
 * itself has no window behind it (see `promptForSiteDir`), so a silent quit after it is
 * indistinguishable from the app being broken. A short info dialog closes that gap without turning a
 * legitimate decline into an error.
 *
 * @complexity O(1).
 */
export async function reportBootFailure({ error, ports }: { error: Error; ports: BootFailurePorts }, _optional = {}): Promise<void> {
  if (ports.isSelectionCancelled(error)) {
    await reportDeclinedStart(ports);
    return;
  }
  ports.logError(`tovu desktop: ${error.message}`);
  ports.setExitCode(1);
  if (shouldShowErrorBox(ports)) ports.showError({ title: "Tovu could not start", content: error.message });
  // `app.exit(1)` ONLY when nothing is open — a boot failure this early (resolving which site
  // dir(s) to serve, before any window exists) always has `openSites` empty, so there is nothing
  // for the graceful `before-quit` drain to do, and `app.exit` guarantees the process actually
  // exits with `1` rather than depending on `app.quit()`'s normal shutdown to have honored
  // `process.exitCode` (measured live, 2026-09-06: it did not — the process reported `exitCode=0`
  // to its parent despite this same line running). When a site IS already open (a later site in a
  // multi-dir launch failing after an earlier one succeeded), `app.quit()` stays exactly as before
  // so `before-quit` still gets the chance to stop that child gracefully; that path's exit code is
  // unchanged pre-existing behavior, not something this fix touches.
  if (ports.openSiteCount() === 0) ports.exit(1);
  else ports.quit();
}

/**
 * Wires `selftest-tracker.ts`'s pure completion tracking to this process's own reporting/exit
 * effects — the only Electron/process-specific glue that module deliberately leaves out so its own
 * logic is testable without Electron. See that file's own header for the two ordering hazards its
 * `expectedCount`-seeded design closes.
 *
 * @complexity O(1).
 */
export function buildSelftestTracker({ expectedCount, log, logError, setExitCode, quit }: {
  expectedCount: number;
  log: (message: string) => void;
  logError: (message: string) => void;
  setExitCode: (code: number) => void;
  quit: () => void;
}, _optional = {}): SelftestTracker {
  return createSelftestTracker(expectedCount, {
    onWindowLoaded: ({ url, title }) => {
      log(`tovu desktop: loaded ${url}`);
      log(`tovu desktop: title=${JSON.stringify(title)}`);
    },
    onWindowFailed: ({ url, code, description }) => {
      logError(`tovu desktop: FAILED to load ${url} (${code} ${description})`);
      setExitCode(1);
    },
    onAllSettled: () => quit(),
  });
}
