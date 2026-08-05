import net from "node:net";

/**
 * @file Agent-daemon readiness gate for E2E suites that drive a real assistant turn.
 *
 * ## Why this exists (measured, 2026-08-04 — not inferred)
 *
 * Playwright's `webServer.url` probe only proves the APP port answers HTTP. It does not — and
 * cannot — prove the agent daemon is up, because `src/index.ts:148` spawns the daemon from INSIDE
 * `app.listen()`'s callback, after eight boot-readiness promises resolve:
 *
 *     Promise.all([deps.identityReady, deps.settingsReady, ...]).then(() => spawnAgentDaemon(...))
 *
 * So the ordering is: app binds → Playwright sees 200 and releases the tests → daemon process is
 * only then forked → tsx compiles the daemon's module graph → daemon binds. Every test that sends
 * an assistant message inside that window gets `ECONNREFUSED 127.0.0.1:<daemonPort>` surfaced as
 * `[assistant] agent daemon unreachable`, which reads like a broken daemon but is a pure race.
 *
 * Observed directly: a `destructive-path.spec.ts` run failed its first test in 1.1s with
 * ECONNREFUSED, and the daemon was confirmed LISTENING on the same port moments after the run was
 * stopped. Nothing was wrong with the daemon.
 *
 * ## Why a bare TCP connect is a sufficient readiness signal here
 *
 * `agent-daemon-server.ts` registers every route AND awaits `createDiskAttachmentStore()` BEFORE
 * `app.listen()` (see that file's own comment at the `attachmentStore = await ...` line: "before
 * `app.listen()` a few lines down — so no request can ever reach this process while
 * `attachmentStore` is still unset"). There is therefore no partially-ready window behind an open
 * port: if the port accepts, the daemon is fully wired.
 *
 * A bare TCP connect is also deliberately preferred over an HTTP probe of the DAEMON itself. Every
 * daemon HTTP route is gated by `daemon-auth.ts`, which refuses any request lacking
 * `TOVU_AGENT_DAEMON_TOKEN` — a token the test-runner process does not have. An HTTP probe of the
 * daemon would need that secret; a connect does not. This also sidesteps the trap recorded in
 * `20260804-session-handoff-2.md`: a probe against an allowlist-gated app route can return a
 * decisive-looking status that is produced BEFORE the request ever reaches the daemon, reporting
 * "ready" with the daemon down.
 *
 * ## Why a bare TCP connect is NOT sufficient on its own (degraded-boot defect fix)
 *
 * A connect proves *something* is listening on the port — it does not prove that something is the
 * daemon THIS boot spawned. `src/index.ts`'s `spawnAgentDaemon()` can crash on `EADDRINUSE` if a
 * leaked, orphaned daemon from a PREVIOUS run is still squatting the port (exactly the failure mode
 * three prior e2e sessions in this repo's own history spent chasing); that stale process is still
 * there, still accepting connections, and a bare connect cannot tell the difference. Before trusting
 * a connect, this now polls the APP's own unauthenticated `/readyz` (published as `E2E_API_PORT` by
 * `playwright.destructive.config.ts`, this file's only consumer) for `assistantDaemonKnownFailed` —
 * a plain boolean `src/server/routes/ops/health.ts` sets once `index.ts`'s own spawn is confirmed
 * dead, regardless of what (if anything) is still answering on the daemon's port. If it is `true`,
 * this throws immediately instead of polling out the full timeout and reporting a generic
 * "never accepted a connection" error that would be actively misleading (something DID connect —
 * just not to a daemon we can trust).
 */

/** Matches `playwright.destructive.config.ts`'s `DAEMON_PORT`; the config exports it through the
 *  environment so the two can never silently drift apart. */
const DEFAULT_DAEMON_PORT = 4990;

function resolveDaemonPort(): number {
  const raw = process.env.E2E_AGENT_DAEMON_PORT ?? process.env.JINI_AGENT_DAEMON_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : DEFAULT_DAEMON_PORT;
}

/** No default: unlike the daemon port, there is no repo-wide convention for the app's own port
 *  (it varies per config — 4991 here, 4992 in adversarial, etc.), and a wrong guess would silently
 *  probe the WRONG process's `/readyz`. Absent means "the config didn't publish it" — callers treat
 *  that as "skip the known-failure check", not as a fabricated port. */
function resolveApiPort(): number | undefined {
  const raw = process.env.E2E_API_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Polls `/readyz` for the plain-boolean `assistantDaemonKnownFailed` field (see this file's own
 * module doc and `src/server/routes/ops/health.ts`'s doc for why that field exists and what it
 * does — and does not — leak). Never throws: a `fetch` failure here means the APP port itself
 * isn't answering yet, which is normal very early in boot and is not this function's question to
 * answer — the caller's own TCP-connect polling already covers that case.
 */
/** Exported for `daemon-ready.unit.test.ts` only — `waitForAgentDaemon` below memoizes its own
 *  promise per process (by design: "the daemon boots once per webServer"), which makes IT awkward
 *  to unit-test in isolation without changing that memoization. This decision function has no such
 *  state, so it is tested directly against a stand-in `/readyz` server instead. */
export async function isDaemonKnownFailed(apiPort: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/readyz`);
    const body = (await res.json()) as { assistantDaemonKnownFailed?: boolean };
    return body.assistantDaemonKnownFailed === true;
  } catch {
    return false;
  }
}

function tryConnect(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * Resolves once the agent daemon accepts TCP connections FROM A BOOT THIS PROCESS KNOWS IS NOT A
 * CONFIRMED FAILURE, or throws with a diagnostic naming the race (or the known failure) rather than
 * the symptom. Memoized per worker process: the daemon boots once per `webServer`, so N tests must
 * not each re-pay the poll.
 */
let readyPromise: Promise<void> | undefined;

export function waitForAgentDaemon(opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<void> {
  if (readyPromise) return readyPromise;
  const port = resolveDaemonPort();
  const apiPort = resolveApiPort();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 500;

  readyPromise = (async () => {
    const deadline = Date.now() + timeoutMs;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      // Checked BEFORE the connect attempt, every iteration: a connect succeeding against a
      // known-failed boot would otherwise resolve this promise as "ready" one line below, exactly
      // the silent-wrong-result shape this whole fix exists to close. `apiPort` is `undefined` only
      // if some future config reuses this module without publishing `E2E_API_PORT` — degrades to
      // the pre-fix bare-connect behavior rather than throwing on a config that never opted in.
      if (apiPort !== undefined && (await isDaemonKnownFailed(apiPort))) {
        throw new Error(
          `the agent daemon this boot spawned is KNOWN to have failed (see the [WebServer] output ` +
            `for the exact reason, or GET /readyz on 127.0.0.1:${apiPort}). Not retrying: whatever ` +
            `may be answering on 127.0.0.1:${port} is not trustworthy — it can be an orphaned daemon ` +
            `from a previous run still squatting the same port.`
        );
      }
      if (await tryConnect(port, 2_000)) return;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(
      `agent daemon never accepted a connection on 127.0.0.1:${port} within ${timeoutMs}ms ` +
        `(${attempts} attempts). The app port answering HTTP does NOT imply the daemon is up — ` +
        `src/index.ts:148 spawns it from inside app.listen()'s callback. Check the [WebServer] ` +
        `output for a "[index] a boot-readiness promise rejected" line, which means the daemon was ` +
        `never spawned at all rather than merely being slow.`
    );
  })();

  return readyPromise;
}
