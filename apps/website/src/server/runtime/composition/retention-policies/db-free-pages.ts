/**
 * @file The serving-time free-page reclaim policy (p11 T5, needs-opus §3): bounded
 * `incremental_vacuum` steps on a running site's SQLite files, each inside an idle turn of the SERVING
 * kernel, on that kernel's own raw handle. Staged and disabled until compaction clears G1–G3: nothing
 * schedules it yet, and it never opens a second connection (a second writer handle on the same file is
 * exactly the hazard `withIdleTurn` exists to close).
 */
import type { KyselyKernel, withIdleTurn as WithIdleTurn } from "@jini-ai/db/kernel";
import type { incrementalVacuumStep as IncrementalVacuumStep } from "@jini-ai/db/sqlite";
import type { SqliteCompactionFs, SqliteCompactionMarkerStore, SqliteDb, SqliteVacuumStepOutcome } from "@jini-ai/core/contracts/storage";

/** One sweepable database: the SERVING kernel and its own raw handle. Never a second handle. */
export interface SweepableDatabase {
  readonly name: "content" | "chat";
  readonly filePath: string;
  readonly kernel: KyselyKernel<unknown>;
  /** `sqliteConnectionOf({ kernel })`: the same connection the kernel serves on. */
  readonly handle: SqliteDb;
  readonly marker: SqliteCompactionMarkerStore;
}

export interface DbFreePagesRequired {
  /** Empty for non-SQLite, memory, missing, unknown-identity or stopped stores. */
  readonly databases: () => readonly SweepableDatabase[];
  readonly withIdleTurn: typeof WithIdleTurn;
  readonly incrementalVacuumStep: typeof IncrementalVacuumStep;
  readonly fs: SqliteCompactionFs;
  readonly mono: () => number;
  /** A `setImmediate` wrapper: serving work runs between steps. */
  readonly yieldTurn: () => Promise<void>;
  readonly signal: AbortSignal;
}
export interface DbFreePagesOptions { maxStepsPerPass?: number; budgetMs?: number; maxPages?: number; busyTimeoutMs?: number }

export type FreePagesStep =
  | { readonly database: string; readonly outcome: SqliteVacuumStepOutcome }
  | { readonly database: string; readonly outcome: { readonly status: "skipped"; readonly reason: "busy" | "in-scope" | "transaction-open" | "unsupported" } };

type PassState = { readonly steps: FreePagesStep[]; readonly started: number };

/**
 * Build the policy. `run` performs one bounded pass; `drain` awaits the step in flight, and the
 * retention handle calls it BEFORE closing the store, so no pragma runs on a closing connection.
 * @complexity O(maxStepsPerPass × maxPages) page moves per pass.
 */
export function createDbFreePagesPolicy(
  required: DbFreePagesRequired,
  { maxStepsPerPass = 8, budgetMs = 2_000, maxPages = 2_048, busyTimeoutMs = 250 }: DbFreePagesOptions = {},
): { readonly run: () => Promise<readonly FreePagesStep[]>; readonly drain: () => Promise<void> } {
  let inFlight: Promise<unknown> = Promise.resolve();
  const limits = { maxStepsPerPass, budgetMs, maxPages, busyTimeoutMs };
  const step = (db: SweepableDatabase, state: PassState): Promise<FreePagesStep> => {
    const running = oneStep({ required, db, limits, remainingMs: budgetMs - (required.mono() - state.started) });
    inFlight = running.catch(() => undefined);
    return running;
  };
  return {
    run: async () => {
      const state: PassState = { steps: [], started: required.mono() };
      for (const db of required.databases()) await sweepDatabase({ required, db, state, limits, step });
      return state.steps;
    },
    drain: async () => { await inFlight; },
  };
}

/** Steps on one database until it has nothing to reclaim, refuses, or a pass limit is reached. */
async function sweepDatabase({ required, db, state, limits, step }: {
  required: DbFreePagesRequired; db: SweepableDatabase; state: PassState; limits: Required<DbFreePagesOptions>;
  step: (db: SweepableDatabase, state: PassState) => Promise<FreePagesStep>;
}): Promise<void> {
  while (mayStartStep({ required, state, limits })) {
    const result = await step(db, state);
    state.steps.push(result);
    if (result.outcome.status !== "reclaimed") return;
    await required.yieldTurn();
  }
}

function mayStartStep({ required, state, limits }: { required: DbFreePagesRequired; state: PassState; limits: Required<DbFreePagesOptions> }): boolean {
  if (required.signal.aborted || state.steps.length >= limits.maxStepsPerPass) return false;
  return required.mono() - state.started < limits.budgetMs;
}

/** The one rule: every step is `incrementalVacuumStep` inside an idle turn of the serving kernel. */
async function oneStep({ required, db, limits, remainingMs }: { required: DbFreePagesRequired; db: SweepableDatabase; limits: Required<DbFreePagesOptions>; remainingMs: number }): Promise<FreePagesStep> {
  const { fs, mono } = required;
  const turn = await required.withIdleTurn({ kernel: db.kernel, body: () => required.incrementalVacuumStep(
    { db: db.handle, filePath: db.filePath, marker: db.marker, fs, mono },
    { maxPages: limits.maxPages, busyTimeoutMs: Math.max(0, Math.min(limits.busyTimeoutMs, remainingMs)) },
  ) });
  if (!turn.ran) return { database: db.name, outcome: { status: "skipped", reason: turn.reason } };
  return { database: db.name, outcome: turn.value };
}
