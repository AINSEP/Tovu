/**
 * @file Stop a site that another process serves — the card's Stop for a site this app only attached
 * to through the shared running-site lease (owner 2026-10-13).
 *
 * The case it exists for is `npm run dev`: `development/scripts/dev.mjs` runs `tsx watch
 * apps/website/src/index.ts`, and the server that `tsx watch` spawns is what claims the lease, so
 * the lease's pid is that server — four processes below the terminal's `npm run dev`:
 *
 *     npm run dev → node dev.mjs → npm exec tsx watch → node tsx watch → node index.ts (lease pid)
 *
 * **It signals the LAUNCHER, never the lease pid, when there is one.** SIGTERM to the server alone
 * leaves `tsx watch` alive and waiting for a file change, which then starts a second server that
 * fights the one Start launches in this app; and admin Vite keeps running. dev.mjs's own
 * SIGTERM handler is the clean exit — the same `shutdown(0)` as Ctrl-C in its terminal: it
 * SIGTERMs every child's process group, then SIGKILLs what is left after 1.5 s and exits. With no
 * dev.mjs above the server (a bare `tovu serve`, a sibling desktop instance's child) the lease pid
 * itself is signalled, and its own BR-07 shutdown drains it.
 *
 * **Identity before every signal.** The lease records only `{pid, started, token}`, and the OS may
 * hand a dead server's pid to anything. `site-process-registry.ts`'s `isLiveServeRow` proves
 * identity by `--port`/site dir in argv, which an `npm run dev` server does not carry (its site
 * comes from env), so the proof here is start time instead: the process must have existed BEFORE
 * the lease was claimed. A recycled pid started later and fails it; so does a launcher that was not
 * this server's. Re-proved immediately before SIGTERM, against the same lease token. Anything that
 * cannot be proved (no `ps`, win32, a vanished parent) fails closed: no Stop is offered, and a
 * stop already asked for refuses instead of signalling.
 *
 * Never escalates to SIGKILL itself: a stack that does not exit inside the timeout is reported,
 * and left for the operator, rather than killed on a guess.
 */
import { execFileSync } from "node:child_process";
import { readProcessCommand, readProcessParentPid } from "./site-process-registry.ts";

/** Who started an externally served site, as far as the card's confirm needs to say. */
export type ExternalLauncher = "npm-run-dev" | "other";

/** The lease fields this module reads — a structural subset of Jini's `DirectoryRunningRecord`. */
export interface ExternalLease {
  pid: number;
  token: string;
  started: string;
}

/** OS reads and effects, injected so tests never touch a real process. */
export interface ExternalStopPorts {
  readCommand: (pid: number) => string | null;
  readParentPid: (pid: number) => number | null;
  /** Process start time in epoch ms, or `null` when the pid is gone or cannot be read. */
  readStartMs: (pid: number) => number | null;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
}

/** What to signal for one lease. */
export interface ExternalStopTarget {
  pid: number;
  launcher: ExternalLauncher;
  /** The argv read when the target was resolved; re-read and compared before signalling. */
  command: string;
}

export const EXTERNAL_STOP_UNCONFIRMED = "Could not confirm which process runs this site, so nothing was stopped. Stop it where it was started.";

/** dev.mjs's own argv, however it was launched (`node development/scripts/dev.mjs`, or absolute). */
const DEV_LAUNCHER = /(?:^|[\s/])development\/scripts\/dev\.mjs(?:\s|$)/;
/** Lease pid → dev.mjs is 3 hops today; a cap keeps a cycle in `ps` output from looping. */
const MAX_ANCESTORS = 6;
const STOP_TIMEOUT_MS = 15_000;
const STOP_POLL_MS = 200;

/**
 * Whether `pid` is a live process that existed before `lease` was claimed — the PID-reuse proof.
 * `ps`'s start time is whole seconds, truncated, so a genuine process can only read earlier, never later.
 * @complexity O(1) beyond one `ps` call.
 */
function predatesLease(pid: number, lease: ExternalLease, ports: Pick<ExternalStopPorts, "readStartMs">): boolean {
  const startMs = ports.readStartMs(pid);
  const claimedMs = Date.parse(lease.started);
  return startMs !== null && Number.isFinite(claimedMs) && startMs <= claimedMs;
}

/**
 * The process a Stop should SIGTERM for `lease`: the dev.mjs ancestor of the lease pid when there is
 * one, else the lease pid itself — or `null` when identity cannot be proved.
 * @returns `null` when the lease pid fails {@link predatesLease}, its argv is unreadable, or a dev.mjs
 *   ancestor fails {@link predatesLease}.
 * @complexity O(MAX_ANCESTORS) `ps` calls.
 */
export function resolveExternalStopTarget(
  { lease }: { lease: ExternalLease },
  { ports }: { ports: Pick<ExternalStopPorts, "readCommand" | "readParentPid" | "readStartMs"> },
): ExternalStopTarget | null {
  const serverCommand = ports.readCommand(lease.pid);
  if (serverCommand === null || !predatesLease(lease.pid, lease, ports)) return null;
  let pid = ports.readParentPid(lease.pid);
  for (let depth = 0; pid !== null && pid > 1 && depth < MAX_ANCESTORS; depth++) {
    const command = ports.readCommand(pid);
    if (command !== null && DEV_LAUNCHER.test(command)) {
      return predatesLease(pid, lease, ports) ? { pid, launcher: "npm-run-dev", command } : null;
    }
    pid = ports.readParentPid(pid);
  }
  return { pid: lease.pid, launcher: "other", command: serverCommand };
}

/**
 * SIGTERM the process behind `lease` and wait until both the lease is released and that process is gone.
 *
 * Waits on the target's exit as well as the lease because, for dev.mjs, the server (and its lease)
 * goes first while admin Vite may still hold its port; a Start that raced that would probe a dying
 * Vite. A lease that changed hands before the signal (already stopped, or dev.mjs restarted its API
 * child) is a no-op: the caller's fresh record then says what is actually running.
 *
 * @throws {Error} {@link EXTERNAL_STOP_UNCONFIRMED} when identity fails, or a timeout message.
 * @complexity O(timeoutMs / pollMs) polls, each one lease read plus one `ps` call.
 */
export async function stopExternalSite(
  { lease, readLease }: { lease: ExternalLease; readLease: () => Pick<ExternalLease, "token"> | null | undefined },
  { ports, timeoutMs = STOP_TIMEOUT_MS, pollMs = STOP_POLL_MS }: { ports: ExternalStopPorts; timeoutMs?: number; pollMs?: number },
): Promise<void> {
  const target = resolveExternalStopTarget({ lease }, { ports });
  if (target === null) throw new Error(EXTERNAL_STOP_UNCONFIRMED);
  if (readLease()?.token !== lease.token) return;
  if (ports.readCommand(target.pid) !== target.command || !predatesLease(target.pid, lease, ports)) throw new Error(EXTERNAL_STOP_UNCONFIRMED);
  ports.kill(target.pid, "SIGTERM");
  await waitForExternalSiteStop({ lease, target, readLease, ports }, { timeoutMs, pollMs });
}

/** Wait for both the lease and launcher to drain; the launcher may outlive the server's lease.
 * @returns When neither still belongs to this stop request.
 * @throws The existing timeout refusal; never escalates to SIGKILL.
 * @complexity O(timeoutMs / pollMs) lease/process probes.
 */
export async function waitForExternalSiteStop(
  { lease, target, readLease, ports }: { lease: ExternalLease; target: ExternalStopTarget; readLease: () => Pick<ExternalLease, "token"> | null | undefined; ports: ExternalStopPorts },
  { timeoutMs = STOP_TIMEOUT_MS, pollMs = STOP_POLL_MS }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const deadline = ports.nowMs() + timeoutMs;
  while (readLease()?.token === lease.token || predatesLease(target.pid, lease, ports)) {
    if (ports.nowMs() >= deadline) throw new Error(`The site did not stop within ${Math.round(timeoutMs / 1000)} s. Stop it where it was started.`);
    await ports.sleep(pollMs);
  }
}

/** `ps` with `args`, in the C locale so its dates parse; throws when `ps` exits non-zero (a gone pid). */
function runPsInCLocale(args: string[]): string {
  return execFileSync("ps", args, { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
}

/**
 * Process start time via `ps -o lstart=` (argv-free, like `readProcessCommand`), in the C locale so
 * the date parses. `null` on win32, for a gone pid, or for output that does not parse.
 * @param options.runPs runs `ps` and returns its stdout (test seam); defaults to the real `ps`.
 * @complexity O(1); one subprocess call.
 */
export function readProcessStartMs(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  { runPs = runPsInCLocale }: { runPs?: (args: string[]) => string } = {},
): number | null {
  if (platform === "win32") return null;
  try {
    const parsed = Date.parse(runPs(["-o", "lstart=", "-p", String(pid)]).trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const NODE_PORTS: ExternalStopPorts = {
  readCommand: (pid) => readProcessCommand(pid),
  readParentPid: (pid) => readProcessParentPid(pid),
  readStartMs: (pid) => readProcessStartMs(pid),
  kill: (pid, signal) => { process.kill(pid, signal); },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs: () => Date.now(),
};

/** Leases remembered by {@link createExternalSiteStopper}; one per externally served site in practice. */
const LAUNCHER_CACHE_LIMIT = 64;

/**
 * The `ProjectIpcDeps.externalSites` port: `launcherOf` for the card record (polled every 4 s, so
 * cached per lease token — a lease's launcher cannot change), `stop` for the card's Stop. Only proved
 * answers are cached, so a transient `ps` failure hides Stop for one poll, not for the lease's life.
 * @complexity `launcherOf` O(1) on a cache hit, else {@link resolveExternalStopTarget}'s cost.
 */
export function createExternalSiteStopper(_required: Record<string, never> = {}, { ports = NODE_PORTS }: { ports?: ExternalStopPorts } = {}) {
  const launchers = new Map<string, ExternalLauncher>();
  return {
    launcherOf({ lease }: { lease: ExternalLease }, _options = {}): ExternalLauncher | null {
      const cached = launchers.get(lease.token);
      if (cached !== undefined) return cached;
      const launcher = resolveExternalStopTarget({ lease }, { ports })?.launcher ?? null;
      if (launcher === null) return null;
      if (launchers.size >= LAUNCHER_CACHE_LIMIT) launchers.delete(launchers.keys().next().value!);
      launchers.set(lease.token, launcher);
      return launcher;
    },
    stop: ({ lease, readLease }: { lease: ExternalLease; readLease: () => Pick<ExternalLease, "token"> | null | undefined }, _options = {}) =>
      stopExternalSite({ lease, readLease }, { ports }),
  };
}
export type ExternalSiteStopper = ReturnType<typeof createExternalSiteStopper>;
