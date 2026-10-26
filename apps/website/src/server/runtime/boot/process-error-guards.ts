import type { Tracker } from "@jini-ai/diagnostics/observability";

import { redactedError } from "../../../platform/observability/report-error.js";

/**
 * @file Process-level safety net for an unhandled promise rejection escaping every route/middleware
 * layer beneath it — the systemic half of a live-found crash (2026-08-16): an admin route that
 * decrypts a stored secret (`publish-credentials.ts`'s `POST .../:id/verify`) threw on a missing
 * site key with no surrounding try/catch, Express 4 does not catch an async handler's own rejection
 * (that is an Express 5 behavior change, not available here — `package.json` pins `express` to
 * `^4.21.2`), and nothing anywhere in `src/` was listening for `unhandledRejection` either — so
 * Node's own default (`--unhandled-rejections=throw`, terminate the process when no listener is
 * registered) took down the ENTIRE server on one caller's bad request, not just that one request.
 *
 * The route/store-level fix (`publish-credentials/store.ts`'s `decryptRecord`, now converting a raw
 * keyring/sealer error into the typed `PublishCredentialSecretStoreUnconfiguredError` `publish-
 * credentials.ts`'s `sendStoreError` already knows how to map to a 503) closes THAT specific gap.
 * This module is the fleet-wide half: this codebase has no lint rule or type check that would catch
 * a missing try/catch around a decrypting call in some FUTURE route, so a single bug in one route
 * must not be able to repeat the same whole-server outage again.
 *
 * Deliberately logs and continues rather than logging and exiting: this is a multi-tenant,
 * multi-workspace server (`project_tovu_workspace_multitenancy`), not a single-request process — one
 * caller's bug ending every OTHER workspace's in-flight and future requests is a worse outcome than
 * the one request that actually failed underneath the rejection returning a 500/hanging. This is the
 * mirror image of `index.ts`'s OTHER fail-fast behavior (`process.exit(1)` when a CRITICAL boot
 * module never becomes ready): that one is a startup-time gate deciding whether to accept traffic AT
 * ALL; this one is a runtime guard deciding whether one bad REQUEST gets to end every other request
 * too. Different question, different answer — this file does not touch or weaken the boot gate.
 *
 * `uncaughtException` (a synchronous throw, not an async rejection) is deliberately NOT handled the
 * same way here: Node's own guidance is that resuming normal operation after a truly uncaught
 * synchronous exception is unsafe (the process may be in a corrupted state in a way an unhandled
 * promise rejection is not), and the concrete bug this file fixes is specifically the async-rejection
 * shape (Express 4 swallowing nothing, propagating a rejected promise nowhere). Node's fatal
 * behavior (log to stderr, exit) is retained, with a bounded telemetry drain before exiting.
 *
 * Architectural role:
 * Boot-time process wiring, `src/server/boot/` sibling to `registerPluginSdkResolver()` (see that
 * file's own header for this directory's shared "one real top-level boot path, testable via an
 * injectable seam" shape, reused here). Called from `index.ts`'s `main()` — `index.ts` is that one
 * real top-level boot path (never imported by a test), so this file itself must expose the actual
 * `process.on()` registration as an exported, directly callable, directly testable unit rather than
 * an inline, untestable side effect of importing `index.ts`.
 */

export interface InstallUnhandledRejectionGuardOptions {
  /** Test seam: defaults to `console.error`. Every unhandled rejection logs unconditionally,
   *  regardless of this override — logging is the whole point of this guard (a rejection that is
   *  caught here must still read as a real bug in whatever log this process writes to, never a
   *  silent drop), so a test can assert on a stub without needing to capture real stdout/stderr. */
  readonly log?: (message: string, reason: unknown) => void;
}

/**
 * Registers a process-wide `unhandledRejection` listener. Node only terminates the process on an
 * unhandled rejection when NO listener is registered at all — installing one, even one that only
 * logs, is itself the entire fix; multiple listeners (e.g. a second call, or a test's own scoped
 * registration) are harmless, Node simply invokes all of them, so this is deliberately NOT guarded
 * against being called more than once the way `registerPluginSdkResolver` is (that function's own
 * "exactly once" contract exists for a security-relevant module-resolution hook; a duplicate log
 * line here carries no equivalent risk).
 *
 * @returns An uninstall function that removes exactly this call's listener — production's one real
 *   caller (`index.ts`'s `main()`) never calls it (the guard should live for the process's entire
 *   life), but a test needs it to avoid leaking a listener into a later, unrelated test in the same
 *   process and eventually tripping Node's `MaxListenersExceededWarning`.
 * @complexity O(1) — one `process.on()` registration.
 * @overallScore 100
 */
export function installUnhandledRejectionGuard(options: InstallUnhandledRejectionGuardOptions = {}): () => void {
  const log =
    options.log ??
    ((message: string, reason: unknown) => {
      // eslint-disable-next-line no-console
      console.error(message, reason);
    });
  const handler = (reason: unknown): void => {
    log("[unhandledRejection] an async operation rejected with no catch anywhere in its chain — logged, not fatal:", reason);
  };
  process.on("unhandledRejection", handler);
  return () => process.off("unhandledRejection", handler);
}

/**
 * Forwards process-level failures to the observability port (provider wave 2, 2026-10-25): an
 * unhandled rejection (`installUnhandledRejectionGuard` above still logs it and keeps the process
 * up) and an uncaught exception (report, drain telemetry, then exit). Installed by each process once
 * its `RouteDeps` exist — the serving process
 * (`index.ts`, `tovu serve`) and the agent daemon — because the port is only built there. Only add
 * this beside the guard: a rejection listener on its own would also suppress Node's default crash.
 * A fatal exception must never resume service: the deadline forces exit even if a provider hangs.
 * @param required The port and which process this is (`server` or `daemon`), sent as an attribute.
 * @param optional Test seam for the event source; defaults to `process`.
 * @returns An uninstall function removing exactly these two listeners.
 * @complexity O(1) to install; O(n) per report in the error's text length.
 */
export function installProcessErrorReporting(
  required: { tracker: Tracker; processRole: "server" | "daemon" },
  optional: { target?: Pick<NodeJS.EventEmitter, "on" | "off">; flush?: () => Promise<void>;
    exit?: (code: number) => void; timeoutMs?: number; log?: (message: string, error: Error) => void } = {},
): () => void {
  const { tracker, processRole } = required;
  const target = optional.target ?? process;
  const exit = optional.exit ?? ((code: number) => process.exit(code));
  let crashing = false;
  const onRejection = (reason: unknown): void => {
    tracker.error({ error: reason instanceof Error ? reason : redactedError({ error: reason }) }, { context: { operation: "process.unhandled_rejection", attributes: { process: processRole } } });
  };
  const onUncaught = (error: unknown): void => {
    if (crashing) return;
    crashing = true;
    let exited = false;
    const finish = (): void => { if (exited) return; exited = true; clearTimeout(deadline); exit(1); };
    const deadline = setTimeout(finish, optional.timeoutMs ?? 2_000);
    try {
      tracker.error({ error: error instanceof Error ? error : redactedError({ error }) }, { context: { operation: "process.uncaught_exception", attributes: { process: processRole } } });
      (optional.log ?? console.error)("[uncaughtException] fatal; exiting after telemetry flush:", redactedError({ error }));
    } catch { /* A broken diagnostic sink must not skip the fatal drain and exit. */ } finally {
      void Promise.resolve().then(() => optional.flush?.()).catch(() => {}).finally(finish);
    }
  };
  target.on("unhandledRejection", onRejection);
  target.on("uncaughtException", onUncaught);
  return () => { target.off("unhandledRejection", onRejection); target.off("uncaughtException", onUncaught); };
}

/** Report a rejected Tovu boot and terminate, including when stderr itself fails.
 * A boot failure leaves index.ts's reserved listener serving 503 forever, so it cannot use the
 * request-time rejection guard's log-and-continue policy. Dependencies are injectable for unit tests.
 * The raw reason rides along so an unexpected composition failure keeps its stack in server.log.
 * @param error The rejected startup reason; Error messages and non-Error reasons are retained.
 * @returns Never in production; the injected exit port may return in tests.
 * @complexity O(n) time/space in diagnostic length; one log and one exit.
 */
export function reportFatalBootFailure(
  { error }: { error: unknown },
  { log = console.error, exit = (code: number) => process.exit(code) }: {
    log?: (message: string, reason: unknown) => void; exit?: (code: number) => void;
  } = {},
): void {
  try {
    const reason = error instanceof Error ? error.message : String(error);
    log(`[boot] Tovu failed to start: ${reason.replace(/\s+/g, " ")}. Restart Tovu after resolving this error; if the site is running in another app, stop it there first.`, error);
  } finally {
    exit(1);
  }
}
