/**
 * @file ADR-046 Phase 2 (SPEC-030) — the typed boot/readiness lifecycle convention.
 *
 * Purpose:
 * Replaces fire-and-forget boot initialization with an explicit two-stage `prepare`/`start`
 * contract, aggregated typed lifecycle results, and rollback-on-critical-failure. This is a
 * generic convention with its first four consumers wired in `index.ts` (the one real top-level
 * boot path) — `deps.ts`/`app.ts` stay synchronous and untouched (INV-06).
 *
 * `prepare()` may acquire only reversible resources and must not start external work (workers,
 * subscriptions, listeners) — `start()` is for that. If a module's own `prepare()` or `start()`
 * throws, THAT MODULE is responsible for releasing whatever it already acquired before
 * rethrowing; the orchestrator's rollback loop only calls `stop()` on OTHER modules that already
 * fully completed a stage — never on the module that is itself the failure point (ADR-046 Phase
 * 2's round-2 partial-boot-rollback correction).
 */

export type ModuleLifecycleStatus =
  | { status: "ready" }
  | { status: "disabled"; reasonCode: string; remediationHint: string }
  | { status: "failed"; reasonCode: string; remediationHint: string };

export type BootCriticality = "critical" | "optional";

export interface BootModule {
  name: string;
  owner: string;
  criticality: BootCriticality;
  /** Acquire reversible resources only. Must not start workers/subscriptions/listeners. */
  prepare: () => Promise<void>;
  /** Start external work. Only called for modules whose `prepare()` succeeded. */
  start: () => Promise<void>;
  /** Idempotent. Releases whatever `prepare`/`start` acquired. Never called for the module currently failing — see file header. */
  stop: () => Promise<void>;
}

export interface BootModuleResult {
  name: string;
  owner: string;
  criticality: BootCriticality;
  lifecycle: ModuleLifecycleStatus;
}

export interface BootResult {
  /** True iff every CRITICAL module resolved to `ready`. Optional-module failures never flip this. */
  ok: boolean;
  /** Only modules actually attempted before a critical failure (if any) aborted the lifecycle. */
  modules: BootModuleResult[];
}

function toFailed(module: BootModule, err: unknown): BootModuleResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    name: module.name,
    owner: module.owner,
    criticality: module.criticality,
    lifecycle: {
      status: "failed",
      reasonCode: message,
      remediationHint: "check the boot log for the underlying error and retry after fixing it",
    },
  };
}

function toReady(module: BootModule): BootModuleResult {
  return { name: module.name, owner: module.owner, criticality: module.criticality, lifecycle: { status: "ready" } };
}

/** Reverse-order idempotent stop, best-effort — a stop() failure must not mask the original boot failure. */
async function stopInReverse(modules: readonly BootModule[]): Promise<void> {
  for (let i = modules.length - 1; i >= 0; i -= 1) {
    try {
      await modules[i].stop();
    } catch {
      // best-effort: continue unwinding the rest regardless
    }
  }
}

function finalize(modules: readonly BootModule[], results: Map<string, BootModuleResult>): BootResult {
  const ordered = modules.map((m) => results.get(m.name)).filter((r): r is BootModuleResult => r !== undefined);
  const ok = ordered.every((r) => r.criticality !== "critical" || r.lifecycle.status === "ready");
  return { ok, modules: ordered };
}

/**
 * Runs every module's `prepare()` in array order. A CRITICAL module's failure aborts the stage:
 * every OTHER module that already completed `prepare()` is `stop()`-ped, in REVERSE array order —
 * never the currently-failing module itself. An OPTIONAL module's `prepare()` failure is recorded
 * and the loop continues (that module is simply excluded from `prepared`, so `start()` never sees it).
 */
async function runPrepareStage(
  modules: readonly BootModule[],
  results: Map<string, BootModuleResult>
): Promise<{ prepared: BootModule[]; aborted: boolean }> {
  const prepared: BootModule[] = [];

  for (const module of modules) {
    try {
      await module.prepare();
      prepared.push(module);
    } catch (err) {
      results.set(module.name, toFailed(module, err));
      if (module.criticality === "critical") {
        await stopInReverse(prepared);
        return { prepared, aborted: true };
      }
    }
  }

  return { prepared, aborted: false };
}

/**
 * Runs `start()` for every module that finished `prepare()`, in array order. Same critical/optional
 * abort behavior as {@link runPrepareStage}, scoped to modules that have actually `start()`-ed.
 */
async function runStartStage(
  prepared: readonly BootModule[],
  results: Map<string, BootModuleResult>
): Promise<{ aborted: boolean }> {
  const ready: BootModule[] = [];

  for (const module of prepared) {
    try {
      await module.start();
      results.set(module.name, toReady(module));
      ready.push(module);
    } catch (err) {
      results.set(module.name, toFailed(module, err));
      if (module.criticality === "critical") {
        await stopInReverse(ready);
        return { aborted: true };
      }
    }
  }

  return { aborted: false };
}

/**
 * Runs every module's `prepare()` in array order, then every successfully-prepared module's
 * `start()` in array order. A CRITICAL module's failure aborts the lifecycle: every OTHER module
 * that already fully completed a stage is `stop()`-ped, in REVERSE array order — never the
 * currently-failing module itself. An OPTIONAL module's failure is recorded and the lifecycle
 * continues (that module is simply excluded from the `start` stage if `prepare` failed).
 */
export async function runBootLifecycle(modules: readonly BootModule[]): Promise<BootResult> {
  const results = new Map<string, BootModuleResult>();

  const prepareOutcome = await runPrepareStage(modules, results);
  if (prepareOutcome.aborted) return finalize(modules, results);

  const startOutcome = await runStartStage(prepareOutcome.prepared, results);
  if (startOutcome.aborted) return finalize(modules, results);

  return finalize(modules, results);
}
