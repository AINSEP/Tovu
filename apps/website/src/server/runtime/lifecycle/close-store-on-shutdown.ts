import type { SiteStore } from "#src/server/runtime/composition/open-site-store";

/**
 * @file The default boot's (`index.ts`) store teardown for PGlite and Postgres sites.
 *
 * A PGlite owner holds `<site>/pglite/`'s owner lock and serves its socket until its store closes;
 * PGlite also flushes on close. Nothing else in the default boot closes the store (the `serve`
 * command closes its own in its BR-07 shutdown), so without this the lock and the socket file were
 * released only by process death (the next owner takes over a dead pid's lock and unlinks its socket).
 *
 * SQLite sites are left exactly as before: nothing registered, the daemon supervisor keeps its own
 * signal handlers. On a pg site this module owns the signals instead, because the supervisor's
 * handlers call `process.exit(0)` at once, which would cut an async close short.
 */

/** The slice of `process` this module touches, so a test can drive it without real signals. */
export interface ShutdownProcess {
  once(event: "SIGINT" | "SIGTERM" | "SIGHUP" | "beforeExit" | "exit", listener: () => void): unknown;
  exit(code: number): void;
}

/** How long a signal waits for the store to close before exiting anyway (`tsx watch` kills at 5 s). */
const DEFAULT_CLOSE_TIMEOUT_MS = 4_000;

/**
 * Runs `close` and resolves when it settles or after `timeoutMs` (default 4 s), whichever is first.
 * Never rejects: a failed or hung close is logged (`label` names what was closing), so a caller can
 * always exit afterwards. Shared with `tovu serve`'s shutdown.
 */
export function closeWithinBound(
  close: () => Promise<void>,
  options: { label: string; timeoutMs?: number; log?: (message: string) => void }
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const log = options.log ?? ((message: string) => console.error(message));
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      log(`[shutdown] ${options.label} did not close within ${timeoutMs} ms; exiting anyway`);
      resolve();
    }, timeoutMs);
    timer.unref();
    close().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        log(`[shutdown] closing ${options.label} failed: ${error instanceof Error ? error.message : String(error)}`);
        resolve();
      }
    );
  });
}

/**
 * On a PGlite/Postgres site, closes the store on SIGINT/SIGTERM/SIGHUP (then exits 0) and when the
 * event loop drains (`beforeExit`). `onShutdown` (the daemon supervisor's `shutdownAssistantDaemon`)
 * runs first on a signal and again, synchronously, on `exit`, which covers an explicit
 * `process.exit()` elsewhere. A store that fails or hangs on close is logged; the exit still happens.
 *
 * @returns `true` when the handlers were registered (the caller must then start the daemon with
 *   `registerProcessSignalHandlers: false`); `false` on SQLite, where nothing is registered.
 */
export function closeStoreOnShutdown(
  required: { store: Pick<SiteStore, "storage" | "close">; onShutdown: () => void },
  optional: { proc?: ShutdownProcess; timeoutMs?: number; log?: (message: string) => void } = {}
): boolean {
  const { store, onShutdown } = required;
  if (store.storage.kind === "sqlite") return false;
  const proc = optional.proc ?? process;
  const timeoutMs = optional.timeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const log = optional.log ?? ((message: string) => console.error(message));

  let closing: Promise<void> | undefined;
  const closeBounded = (): Promise<void> => {
    closing ??= closeWithinBound(() => store.close(), { label: `the ${store.storage.kind} store`, timeoutMs, log });
    return closing;
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    proc.once(signal, () => {
      onShutdown();
      void closeBounded().then(() => proc.exit(0));
    });
  }
  proc.once("beforeExit", () => void closeBounded());
  proc.once("exit", onShutdown);
  return true;
}
