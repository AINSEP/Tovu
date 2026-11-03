/** Tovu's idle policy and HTTP stream lifecycle over Jini's shared activity/idle owner. */
import type { RequestHandler, Response } from "express";
import { createSystemClock, type Clock } from "@jini-ai/core/primitives";
import { createIdleMonitor, type IdleMonitor } from "@jini-ai/daemon";
import { createTimeoutScheduler, type SchedulerPort } from "@jini-ai/daemon/scheduler";
import { AGENT_DAEMON_EXIT_CODE } from "#src/assistant/daemon-exit-codes";

const DEFAULT_IDLE_MINUTES = 15;

/** Parse the host's optional policy. Zero disables; malformed/negative/overflow uses the default.
 * No supplied value is logged. O(1) state, O(input length) parsing. */
export function daemonIdleMs({ value }: { value: string | undefined }, { warn = console.warn } = {}): number {
  const minutes = value === undefined ? DEFAULT_IDLE_MINUTES : Number(value);
  if (value?.trim() !== "" && Number.isFinite(minutes) && minutes >= 0 && minutes * 60_000 <= Number.MAX_SAFE_INTEGER) {
    return minutes * 60_000;
  }
  warn("[agent-daemon] invalid TOVU_AGENT_DAEMON_IDLE_MINUTES; using 15 minutes");
  return DEFAULT_IDLE_MINUTES * 60_000;
}

/** Only these GET routes are passive: replay/bind transport alone must not keep a process alive. */
export function isPassiveDaemonStream({ method, path }: { method: string; path: string }, _optional = {}): boolean {
  return method === "GET" && (path === "/api/frontend-sessions/stream" || /^\/api\/runs\/[^/]+\/events$/.test(path));
}

/** Attach Tovu's existing graceful exit to the generic monitor. Start only after boot is ready.
 * hold() covers runs, async preparation and cleanup independently of conversation identity.
 * HTTP holds cover delegated calls/uploads; passive sockets get a parked frame before EOF.
 * @example const idle = createAgentDaemonIdlePark({ isBusy, exit }); app.use(idle.middleware);
 * @complexity O(1) per activity; O(open passive streams) only at parking. No remote I/O.
 */
export function createAgentDaemonIdlePark({ isBusy, exit }: { isBusy: () => boolean; exit: (code: number) => void }, {
  env = process.env, clock = createSystemClock(), scheduler = createTimeoutScheduler({}), warn = console.warn,
}: { env?: NodeJS.ProcessEnv; clock?: Clock; scheduler?: SchedulerPort; warn?: (message: string) => void } = {}) {
  const idleMs = daemonIdleMs({ value: env.TOVU_AGENT_DAEMON_IDLE_MINUTES }, { warn });
  const passive = new Set<Response>();
  let monitor: IdleMonitor | undefined;
  let stopped = false;

  /** Monitor has fenced acquisition synchronously before this callback; no new request can enter.
   * O(open passive streams). A dead observer must not prevent graceful exit. */
  function park(): void {
    stopped = true;
    for (const res of passive) {
      try {
        if (res.headersSent) res.write('event: parked\ndata: {"type":"parked"}\n\n');
        res.end();
      } catch { /* A disconnected passive observer has no work to preserve. */ }
    }
    passive.clear();
    exit(AGENT_DAEMON_EXIT_CODE.IDLE_PARK);
  }

  const middleware: RequestHandler = (req, res, next) => {
    if (stopped) {
      res.setHeader("Connection", "close");
      res.setHeader("x-tovu-daemon-parked", "1");
      res.setHeader("x-tovu-daemon-pid", String(process.pid));
      res.status(503).json({ error: "the agent daemon is parked", code: "AGENT_DAEMON_PARKED" });
      return;
    }
    if (isPassiveDaemonStream({ method: req.method, path: req.path })) {
      passive.add(res);
      res.once("close", () => passive.delete(res));
    } else {
      const release = monitor?.acquire({}, {});
      // Both events can fire for one response. The shared monitor owns idempotent release.
      if (release) { res.once("finish", release); res.once("close", release); }
    }
    next();
  };

  return {
    middleware,
    start(_required: Record<string, never>, _optional = {}): void {
      if (monitor || stopped || idleMs === 0) return;
      monitor = createIdleMonitor({ isBusy, idleMs, clock, scheduler }, { onIdle: park });
    },
    stop(_required: Record<string, never>, _optional = {}): void { stopped = true; monitor?.stop(); },
    hold(_required: Record<string, never>, _optional = {}): () => void {
      const release = monitor?.acquire({}, {});
      // Intake is fenced in middleware. A signal-driven shutdown can still finish accepted
      // runs and cleanup; refusing their internal holds would skip that existing disposal.
      return release ?? (() => {});
    },
  };
}
