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
 * A bare TCP connect is also deliberately preferred over an HTTP probe. Every daemon HTTP route is
 * gated by `daemon-auth.ts`, which refuses any request lacking `TOVU_AGENT_DAEMON_TOKEN` — a token
 * the test-runner process does not have. An HTTP probe would need that secret; a connect does not.
 * This also sidesteps the trap recorded in `20260804-session-handoff-2.md`: a probe against an
 * allowlist-gated app route can return a decisive-looking status that is produced BEFORE the
 * request ever reaches the daemon, reporting "ready" with the daemon down.
 */

/** Matches `playwright.destructive.config.ts`'s `DAEMON_PORT`; the config exports it through the
 *  environment so the two can never silently drift apart. */
const DEFAULT_DAEMON_PORT = 4990;

function resolveDaemonPort(): number {
  const raw = process.env.E2E_AGENT_DAEMON_PORT ?? process.env.JINI_AGENT_DAEMON_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : DEFAULT_DAEMON_PORT;
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
 * Resolves once the agent daemon accepts TCP connections, or throws with a diagnostic naming the
 * race rather than the symptom. Memoized per worker process: the daemon boots once per `webServer`,
 * so N tests must not each re-pay the poll.
 */
let readyPromise: Promise<void> | undefined;

export function waitForAgentDaemon(opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<void> {
  if (readyPromise) return readyPromise;
  const port = resolveDaemonPort();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 500;

  readyPromise = (async () => {
    const deadline = Date.now() + timeoutMs;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
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
