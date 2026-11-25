/**
 * @file The desktop's next-start partition pass (P11 ST-2c.T, ALGO §24): once per profile boot,
 * after the orphan reap and the nested-sites-home migration and before any boot mode opens a site,
 * Jini's `runPartitionPass` restores uncommitted asides, removes proven-retired sign-in partitions
 * whole and clears only the cache folders of ambiguous ones — all under the profile's partition
 * writer fence. Owner rule (a): a login is never erased for a live site or another site; any unknown
 * (tracked list, catalog, holders, a sibling instance, a session root outside this profile) keeps
 * every partition and skips the pass.
 */
import fsModule from "node:fs";
import type {
  PartitionMaintenance, PartitionPassFsPort, PartitionPassInterlock, PartitionPassLedger, PartitionPassOptional,
  PartitionPassOutcome, PartitionPassReport, PartitionPassRequired, PartitionPassRoot,
} from "@jini-ai/desktop-host/electron/partitions";
import { nodePartitionFs } from "../../desktop-partition-lock.ts";

export type DesktopPartitionPassLogEvent = { event: "pass-skipped" | "pass-failed" | "pass-done" | "pass-continuing"; detail?: string };

export interface DesktopPartitionPassRequired {
  /** Jini's `runPartitionPass`. */
  partitionPass: (required: PartitionPassRequired, optional?: PartitionPassOptional) => Promise<PartitionPassOutcome>;
  /** The desktop binding's writer fence and holder reads; `automaticMaintenance` is false for a foreign session root. */
  claims: PartitionPassInterlock & { automaticMaintenance: boolean };
  ledger: PartitionPassLedger;
  fs: PartitionPassFsPort;
  root: PartitionPassRoot;
  /**
   * The boot cache hooks, run in order for each unheld partition under the writer fence. Required and
   * explicit: an empty list is the deliberate "no cache work yet", never a silently defaulted hook.
   */
  maintenance: readonly PartitionMaintenance[];
  log: (event: DesktopPartitionPassLogEvent) => void;
  mono: () => number;
  scheduler: PartitionPassRequired["scheduler"];
  /** Hex tokens: Jini recognises an aside folder by `<partition>.<hex>`. */
  newToken: () => string;
}

export interface DesktopPartitionPassRun {
  /** How the boot's wait ended: the pass finished, or the UI moved on while the pass continues. */
  wait: "finished" | "continuing";
  waitedMs: number;
  /** The pass's own report once the writer has released; never rejects. */
  settled: Promise<PartitionPassReport>;
  /** The last pass report of this profile boot, for desktop Storage; `null` while the pass is still running. */
  lastReport(): PartitionPassReport | null;
}

/** Node `fs` as the pass's port: `rm` is recursive and never forced, `mkdir` tolerates the existing aside folder. @complexity O(1) per call. */
export function nodePartitionPassFs({ fs }: { fs: typeof fsModule }, _optional: Record<string, never> = {}): PartitionPassFsPort {
  const base = nodePartitionFs({ fs });
  return {
    readdir: base.readdir, realpath: base.realpath, rename: base.rename,
    lstat: ({ path: target }) => fs.promises.lstat(target),
    mkdir: async ({ path: dir }) => { await fs.promises.mkdir(dir, { recursive: true }); },
    rm: ({ path: target }) => fs.promises.rm(target, { recursive: true, force: false }),
  };
}

const describe = (error: unknown) => String((error as NodeJS.ErrnoException)?.code ?? (error as Error)?.message ?? error);
const endedReport = (result: "skipped" | "failed", reason: string): PartitionPassReport =>
  ({ result, reason, removed: [], cacheCleared: [], restored: [], kept: [], skipped: [] });

/** The hook list as Jini's single hook; a throw stops this partition's remaining hooks and is reported by the pass. */
function composeMaintenance(hooks: readonly PartitionMaintenance[]): PartitionMaintenance {
  return async (input) => { for (const hook of hooks) await hook(input); };
}

/** Retains the report and logs it exactly once per pass, however many paths reach it. @complexity O(1). */
function reportSink(log: DesktopPartitionPassRequired["log"]) {
  let last: PartitionPassReport | null = null;
  return {
    last: () => last,
    retain: (report: PartitionPassReport) => {
      if (last) return;
      last = report;
      if (report.result === "done") log({ event: "pass-done", detail: `removed ${report.removed.length}, cache cleared ${report.cacheCleared.length}, restored ${report.restored.length}` });
      else log({ event: report.result === "skipped" ? "pass-skipped" : "pass-failed", detail: report.reason });
    },
  };
}

/**
 * Run the profile's partition pass for this boot. Resolves by `bootWaitMs` at the latest so the UI
 * is never held hostage; the pass itself keeps the writer until its work settles.
 * @complexity O(candidates + asides) fs operations, in the background past `bootWaitMs`.
 */
export async function runDesktopPartitionPass(
  required: DesktopPartitionPassRequired,
  { bootWaitMs = 3000 }: { bootWaitMs?: number } = {},
): Promise<DesktopPartitionPassRun> {
  const { partitionPass, claims, ledger, fs, root, maintenance, log, mono, scheduler, newToken } = required;
  const sink = reportSink(log), started = mono();
  // A session root outside this profile may be another profile's, which never sees this interlock.
  if (!claims.automaticMaintenance) {
    const report = endedReport("skipped", "foreign-session-root");
    sink.retain(report);
    return { wait: "finished", waitedMs: 0, settled: Promise.resolve(report), lastReport: sink.last };
  }
  let outcome: PartitionPassOutcome;
  try {
    outcome = await partitionPass({
      interlock: claims, ledger, fs, root, maintenance: composeMaintenance(maintenance),
      report: ({ report }) => sink.retain(report), scheduler, newToken,
    }, { budgetMs: bootWaitMs });
  } catch (error) {
    outcome = { state: "finished", report: endedReport("failed", describe(error)) };
  }
  if (outcome.state === "finished") {
    sink.retain(outcome.report);
    return { wait: "finished", waitedMs: mono() - started, settled: Promise.resolve(outcome.report), lastReport: sink.last };
  }
  // Why the UI timeout cannot release an outstanding writer: past the budget the pass may hold a
  // partition renamed aside whose removal is not yet committed (or a cache folder mid-rename).
  // Dropping the fence there would let an open re-create that partition empty, or let the commit
  // land after a site claimed it again — a lost login. So the boot only stops WAITING; `done` keeps
  // the writer until the pass settles, and any open queued behind it waits for the release.
  log({ event: "pass-continuing", detail: `after ${bootWaitMs} ms` });
  const settled = outcome.done.then(
    (report) => { sink.retain(report); return report; },
    (error: unknown) => { const report = endedReport("failed", describe(error)); sink.retain(report); return report; },
  );
  return { wait: "continuing", waitedMs: mono() - started, settled, lastReport: sink.last };
}
