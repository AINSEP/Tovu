import type { SiteStore } from "#src/server/runtime/composition/open-site-store";

import { awaitBootWorkWithinBound } from "./await-boot-work.js";

/**
 * @file Shared site-store teardown for `index.ts` and `tovu serve`, on every storage dialect.
 *
 * A PGlite owner holds `<site>/pglite/`'s owner lock and serves its socket until its store closes;
 * PGlite also flushes on close. Nothing else in the default boot closes the store (the `serve`
 * command closes its own in its BR-07 shutdown), so without this the lock and the socket file were
 * released only by process death (the next owner takes over a dead pid's lock and unlinks its socket).
 *
 * This module owns the signals instead of the daemon supervisor, whose handlers call
 * `process.exit(0)` at once and would cut disposal short. SQLite needs explicit close too:
 * process death can leave WAL/SHM sidecars even when no process holds the files anymore.
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
 * Closes the store on SIGINT/SIGTERM/SIGHUP (then exits 0) and when the
 * event loop drains (`beforeExit`). `onShutdown` (the daemon supervisor's `shutdownAssistantDaemon`)
 * starts first on a signal or a drained loop and the store closes once it settles (bounded); it runs again on `exit`, covering an explicit
 * `process.exit()` elsewhere. A store that fails or hangs on close is logged; the exit still happens.
 *
 * `optional.bootWork` returns the boot passes still reading the store (the legacy publish-credential
 * tail, `createServingApp`'s `bootWork`); the close waits for them first, for half the bound, so a
 * site stopped seconds after boot does not close under them (see `await-boot-work.ts`). It is read
 * when the close starts, not here: `index.ts` registers these handlers before `createServingApp`
 * returns its passes.
 *
 * `optional.stopServing` runs before all of that: it stops the listener taking requests and the
 * background loops (`createServingApp`'s outbox drainer and trash sweeper), and the store closes
 * only once it settles. Without it a drain that had claimed an event and was awaiting a subscriber
 * lost the store beneath it, so the event stayed `processing` until its lease expired and was then
 * delivered again. See {@link stopServingWithinGrace}.
 *
 * `optional.stopOnEnd` (the desktop's stdin pipe on Windows, which has no SIGTERM a parent can
 * deliver) runs the same stop when the stream ends: the desktop closes the pipe to ask for it.
 *
 * @returns `true` when the handlers were registered (the caller must then start the daemon with
 *   `registerProcessSignalHandlers: false`).
 */
export function closeStoreOnShutdown(
  required: { store: Pick<SiteStore, "storage" | "close">; onShutdown: () => unknown },
  optional: {
    proc?: ShutdownProcess;
    timeoutMs?: number;
    log?: (message: string) => void;
    bootWork?: () => readonly Promise<unknown>[];
    stopServing?: () => Promise<void>;
    stopOnEnd?: { once(event: "end", listener: () => void): unknown; resume(): unknown };
  } = {}
): boolean {
  const { store, onShutdown } = required;
  const proc = optional.proc ?? process;
  const timeoutMs = optional.timeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const log = optional.log ?? ((message: string) => console.error(message));
  const bootWork = optional.bootWork ?? (() => []);
  const stopServing = optional.stopServing ?? (async () => {});

  let closing: Promise<void> | undefined;
  let daemonStopped: unknown;
  const closeBounded = (): Promise<void> => {
    closing ??= closeWithinBound(
      async () => {
        await stopServing();
        await awaitBootWorkWithinBound({ work: bootWork() }, { timeoutMs: timeoutMs / 2, log });
        // The daemon shares content.db and chat.db, and SQLite removes the WAL/SHM only on the LAST
        // connection's close: two processes closing at once can both leave them. So the daemon goes
        // first, but only for a quarter of the bound, so an unresponsive daemon cannot keep ours open.
        const daemon = Promise.allSettled([daemonStopped]);
        await Promise.race([daemon, new Promise((resolve) => setTimeout(resolve, timeoutMs / 4).unref())]);
        await store.close();
        // Wait for its outcome too, so a failed tree-stop is logged rather than lost.
        const [stopped] = await daemon;
        if (stopped.status === "rejected") throw stopped.reason;
      },
      { label: `the ${store.storage.kind} store`, timeoutMs, log }
    );
    return closing;
  };

  const stop = (): void => {
    daemonStopped = onShutdown();
    void closeBounded().then(() => proc.exit(0));
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) proc.once(signal, stop);
  optional.stopOnEnd?.once("end", stop);
  // Flowing mode, or a paused stream never reports its end.
  optional.stopOnEnd?.resume();
  // The drained loop closes the same shared store, so the daemon goes first here too.
  proc.once("beforeExit", () => {
    daemonStopped ??= onShutdown();
    void closeBounded();
  });
  proc.once("exit", onShutdown);
  return true;
}

/** The slice of an `http.Server` {@link stopServingWithinGrace} closes. */
export interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections?(): void;
  closeAllConnections?(): void;
}

/**
 * The default boot's (`index.ts`) half of `tovu serve`'s BR-07 shutdown: stops the background
 * loops (so no new drain or sweep starts) and the listener (no new connections), lets requests
 * already in flight finish, and resolves once both have. A keep-alive socket that never sends
 * another request would hold `server.close()` open forever, so idle sockets close at once and any
 * still open after `graceMs` (default 500 ms, `serve.ts`'s window) are cut. Never rejects: a
 * listener that was not running, or a worker whose `stop()` throws, still lets the store close.
 *
 * @complexity O(workers + open connections).
 */
export async function stopServingWithinGrace(
  required: { server: ClosableServer; workers: ReadonlyArray<{ stop(): Promise<void> }> },
  optional: { graceMs?: number } = {}
): Promise<void> {
  const { server, workers } = required;
  const workersStopped = Promise.allSettled(workers.map((worker) => worker.stop()));
  let releaseServer!: () => void;
  const serverClosed = new Promise<void>((resolve) => {
    releaseServer = resolve;
    server.close(() => resolve());
  });
  server.closeIdleConnections?.();
  const cut = setTimeout(() => {
    server.closeAllConnections?.();
    // Upgraded sockets (e.g. admin HMR) can keep close's callback pending after the HTTP cut.
    // The request grace is bounded; they must not prevent database disposal before process exit.
    releaseServer();
  }, optional.graceMs ?? 500);
  cut.unref();
  await Promise.all([workersStopped, serverClosed]);
  clearTimeout(cut);
}
