/**
 * @file P11 ST-7b.T (T4d) — the desktop idle trigger for stopped-site compaction.
 *
 * STAGED, NOT BOUND: `main/index.ts` does not construct this yet, and even when it does, the
 * factory returns `undefined` (no timer, no spawn) unless the bundled CLI's strict
 * `storage capabilities --json` lists `compact` (sheets-check T4d rule). Today the website CLI
 * binds `compactStoppedSite: undefined`, so `compact` is never listed and nothing ever runs.
 *
 * It never opens a database or takes a lease itself: it only spawns the SAME bundled CLI
 * (`storage compact <dir> --json`), whose own maintenance lease is the real admission. Every
 * precondition is re-read per tick and any unknown answer skips: AC power, ten minutes of system
 * idle, no open or transitioning window for the site, size ≤ 2 GiB, one child at a time, and a
 * 24-hour per-site cooldown.
 */
import type { StorageCapabilities } from "../../storage/storage-report-cli.ts";

export type Tri = boolean | "unknown";
export interface IdleCompactionRequired {
  readonly capabilities: StorageCapabilities;
  readonly onAcPower: () => Tri;
  readonly idleSeconds: () => number | "unknown";
  readonly trackedSites: () => Promise<readonly string[] | "unknown">;
  readonly windowOpenOrTransitioning: (required: { dir: string }) => Tri;
  readonly siteBytes: (required: { dir: string }) => Promise<number | null>;
  readonly spawnCompact: (required: { dir: string }) => Promise<void>;
  readonly lastAttempt: (required: { dir: string }) => number | undefined;
  readonly recordAttempt: (required: { dir: string; at: number }) => void;
  readonly now: () => number;
  readonly setInterval: (run: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}
export interface IdleCompactionOptional {
  readonly idleThresholdSeconds?: number;
  readonly maxBytes?: number;
  readonly cooldownMs?: number;
  readonly tickMs?: number;
}
export interface IdleCompactionTrigger { tick(): Promise<"ran" | "skipped">; dispose(): void }

const GiB = 2 ** 30;

async function pickSite(deps: IdleCompactionRequired, opts: Required<IdleCompactionOptional>): Promise<string | undefined> {
  const sites = await deps.trackedSites();
  if (sites === "unknown") return undefined;
  for (const dir of sites) {
    const last = deps.lastAttempt({ dir });
    if (last !== undefined && deps.now() - last < opts.cooldownMs) continue;
    if (deps.windowOpenOrTransitioning({ dir }) !== false) continue;
    const bytes = await deps.siteBytes({ dir });
    if (bytes === null || bytes > opts.maxBytes) continue;
    return dir;
  }
  return undefined;
}

/**
 * @returns `undefined` — and registers nothing — unless `compact` is a listed capability.
 * @complexity O(tracked sites) per tick.
 */
export function createStorageIdleCompaction(
  deps: IdleCompactionRequired,
  { idleThresholdSeconds = 600, maxBytes = 2 * GiB, cooldownMs = 24 * 3_600_000, tickMs = 60_000 }: IdleCompactionOptional = {},
): IdleCompactionTrigger | undefined {
  if (deps.capabilities.state !== "ok" || !deps.capabilities.operations.has("compact")) return undefined;
  const opts = { idleThresholdSeconds, maxBytes, cooldownMs, tickMs };
  let child = false;
  let disposed = false;
  const tick = async (): Promise<"ran" | "skipped"> => {
    if (disposed || child || deps.onAcPower() !== true) return "skipped";
    const idle = deps.idleSeconds();
    if (idle === "unknown" || idle < idleThresholdSeconds) return "skipped";
    const dir = await pickSite(deps, opts);
    if (!dir || disposed) return "skipped";
    child = true;
    deps.recordAttempt({ dir, at: deps.now() });
    try { await deps.spawnCompact({ dir }); } catch { /* the child reports its own refusal; the cooldown still applies */ } finally { child = false; }
    return "ran";
  };
  const handle = deps.setInterval(() => { void tick(); }, tickMs);
  return { tick, dispose: () => { disposed = true; deps.clearInterval(handle); } };
}
