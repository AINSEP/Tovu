/**
 * @file Process-level safety net for an unhandled promise rejection escaping every route/middleware
 * layer beneath it — the systemic half of a live-found crash (2026-08-16): an admin route that
 * decrypts a stored secret (`publish-credentials.ts`'s `POST .../:id/verify`) threw on a missing
 * root key with no surrounding try/catch, Express 4 does not catch an async handler's own rejection
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
 * shape (Express 4 swallowing nothing, propagating a rejected promise nowhere). Leaving Node's default
 * `uncaughtException` behavior (log to stderr, exit) in place is the deliberate choice, not an
 * oversight.
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
