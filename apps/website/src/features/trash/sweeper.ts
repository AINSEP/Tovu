/**
 * @file The 60-day auto-purge backstop (design §5) — claim, compare, delete, in that order.
 *
 * Two halves on purpose, because they fail in completely different ways:
 *
 *  - {@link createTrashSweep} is the decision half. It has no clock, no timer and no randomness, so
 *    every branch below (the restore race, a stale version, a missing adapter) is a plain function
 *    call in a test rather than something you have to wait for.
 *  - {@link startTrashSweeper} is the effect half: an `unref`'d, non-overlapping timer loop copied
 *    beat for beat from `contracts/core/events/outbox-drainer.ts`, which is the one background loop
 *    in this process that has already been through a review.
 *
 * **A concurrent restore always wins.** That is the whole safety property, and it is bought twice
 * over, because either guard alone has a hole:
 *
 *  1. Inside the purge transaction the index row is re-read by id. A restore deletes that row in
 *     its own transaction, so a sweep whose claim is already in hand finds nothing and never calls
 *     `purge` at all. Version alone would not cover a domain whose `entity_version` is `null`
 *     (comments and redirects both are) — there is no version there to have changed.
 *  2. `adapter.purge` is still a compare-and-delete on the version captured at trash time, so a
 *     domain that does carry a version stands down even if the row somehow survived step 1.
 *
 * The lease is the third leg: a claimed row is invisible to other sweeps until `leaseUntil`, so two
 * processes serving the same file cannot both purge it, and a sweep that dies mid-batch releases
 * its rows by expiry rather than wedging them forever.
 */
import type {
  PurgeItemOutcome,
  TrashAdapter,
  TrashEntityType,
  TrashRepoPort,
  TransactionRunner,
} from "./ports.js";

/** Idle wait between sweeps. Retention is measured in days, so an hour of lateness costs nothing,
 *  and a desktop site that is only open for minutes still sweeps once at boot. */
export const DEFAULT_TRASH_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Rows claimed per sweep. Each one costs a transaction, so this bounds a single sweep's hold on
 *  the write lock; a full batch sweeps again immediately rather than waiting out the interval. */
export const DEFAULT_TRASH_SWEEP_BATCH_SIZE = 50;

/** How long a claim hides a row from other sweeps. Also the retry backoff for a row that stood
 *  down: nothing releases it early, so it is re-tried at most once per lease. */
export const DEFAULT_TRASH_SWEEP_LEASE_MS = 5 * 60 * 1000;

export interface TrashSweepDeps {
  repo: TrashRepoPort;
  /** The same call-time `Map` the write service resolves against — never a module-level registry. */
  adapters: ReadonlyMap<TrashEntityType, TrashAdapter>;
  /** Reentrant; see {@link TransactionRunner}. */
  transaction: TransactionRunner;
}

export interface TrashSweepReport {
  /** Rows this sweep leased. `claimed === limit` means there is probably more due right now. */
  claimed: number;
  purged: number;
  results: { id: string; outcome: PurgeItemOutcome }[];
}

/**
 * One pass of the backstop. Time, identity and batch size are arguments rather than dependencies so
 * the decision logic stays deterministic.
 */
export type TrashSweepOnce = (required: {
  now: string;
  leaseOwner: string;
  leaseUntil: string;
  limit: number;
}) => Promise<TrashSweepReport>;

export interface TrashSweeper {
  /** Stops scheduling sweeps, then resolves once a sweep already running has settled. Idempotent. */
  stop(): Promise<void>;
}

/**
 * Builds the sweep pass.
 *
 * @param deps the trash repo, the call-time adapter map and a reentrant transaction runner.
 * @returns a {@link TrashSweepOnce}. It never throws for a single bad row — one missing adapter or
 *          one stale version is recorded as that row's outcome and the rest of the batch continues.
 *          A repo-level failure (a locked database) does propagate; the caller's `onError` owns it.
 * @complexity O(limit) transactions per pass, each O(1); one indexed claim query.
 */
export function createTrashSweep(deps: TrashSweepDeps): TrashSweepOnce {
  return async function sweepTrashOnce(required): Promise<TrashSweepReport> {
    const claims = await deps.repo.claimDue(required);
    const results: { id: string; outcome: PurgeItemOutcome }[] = [];

    for (const claim of claims) {
      const adapter = deps.adapters.get(claim.entityType);
      if (!adapter) {
        // The plugin owning this domain is uninstalled. The row keeps its lease rather than being
        // released: re-claiming it every tick would starve the rest of the batch, and it is still
        // listed and still purgeable by hand from the Trash screen once the plugin is back.
        results.push({ id: claim.id, outcome: "adapter-unavailable" });
        continue;
      }

      const outcome = await deps.transaction(async (): Promise<PurgeItemOutcome> => {
        // Guard 1 — see this file's header. A restore between the claim and here has already
        // removed the index row, and removing it is what a restore IS.
        const [row] = await deps.repo.findByIds({ workspaceId: claim.workspaceId, ids: [claim.id] });
        if (!row) return "not-found";

        // Guard 2 — compare-and-delete on the version captured at trash time.
        const result = await adapter.purge({
          workspaceId: row.workspaceId,
          entityId: row.entityId,
          expectedVersion: row.entityVersion,
        });
        if (result === "purged" || result === "already-gone") {
          await deps.repo.deleteById({ workspaceId: row.workspaceId, id: row.id });
        }
        return result;
      });
      results.push({ id: claim.id, outcome });
    }

    return {
      claimed: claims.length,
      purged: results.filter((r) => r.outcome === "purged").length,
      results,
    };
  };
}

/**
 * Starts the backstop in the background. The first sweep runs on the next timer turn.
 *
 * @param required.sweep the pass built by {@link createTrashSweep}, pre-bound at the composition root.
 * @param required.clock supplies `now`; the lease window is derived from it, never from `Date.now()`.
 * @param optional.intervalMs idle wait between sweeps (default {@link DEFAULT_TRASH_SWEEP_INTERVAL_MS}).
 * @param optional.batchSize rows per sweep (default {@link DEFAULT_TRASH_SWEEP_BATCH_SIZE}).
 * @param optional.leaseMs how long a claim holds a row (default {@link DEFAULT_TRASH_SWEEP_LEASE_MS}).
 * @param optional.leaseOwner identifies this process in `purge_lease_owner`; defaults to a fresh id.
 * @param optional.onError receives any error a sweep throws (default: `console.error`). If it throws
 *   itself that is swallowed, so a broken reporter can never end the loop.
 * @returns a handle whose `stop()` ends the loop.
 * @complexity O(batchSize) transactions per sweep; O(1) state between sweeps.
 */
export function startTrashSweeper(
  required: { sweep: TrashSweepOnce; clock: { nowIso(): string } },
  optional: {
    intervalMs?: number;
    batchSize?: number;
    leaseMs?: number;
    leaseOwner?: string;
    onError?: (error: unknown) => void;
  } = {}
): TrashSweeper {
  const {
    intervalMs = DEFAULT_TRASH_SWEEP_INTERVAL_MS,
    batchSize = DEFAULT_TRASH_SWEEP_BATCH_SIZE,
    leaseMs = DEFAULT_TRASH_SWEEP_LEASE_MS,
    leaseOwner = `trash-sweeper-${Math.random().toString(36).slice(2, 10)}`,
    onError = logSweepError,
  } = optional;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = sweep();
    }, delayMs);
    timer.unref();
  };

  const sweep = async (): Promise<void> => {
    const claimed = await sweepOnce(required, { batchSize, leaseMs, leaseOwner, onError });
    schedule(claimed >= batchSize ? 0 : intervalMs);
  };

  schedule(0);

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await inFlight;
    },
  };
}

/** One pass that never rejects: an error is reported and counts as zero rows claimed. */
async function sweepOnce(
  required: { sweep: TrashSweepOnce; clock: { nowIso(): string } },
  optional: { batchSize: number; leaseMs: number; leaseOwner: string; onError: (error: unknown) => void }
): Promise<number> {
  try {
    const now = required.clock.nowIso();
    const report = await required.sweep({
      now,
      leaseOwner: optional.leaseOwner,
      leaseUntil: new Date(new Date(now).getTime() + optional.leaseMs).toISOString(),
      limit: optional.batchSize,
    });
    return report.claimed;
  } catch (error) {
    try {
      optional.onError(error);
    } catch {
      // The loop must outlive a reporter that throws; the sweep error itself is already lost to it.
    }
    return 0;
  }
}

function logSweepError(error: unknown): void {
  // eslint-disable-next-line no-console
  console.error("[trash-sweeper] sweep failed; retrying after the idle interval", error);
}
