/**
 * @file One teardown hook per test context, shared by every helper that owns a resource.
 *
 * Why: node:test stops running a context's `after` hooks at the first one that throws (runHook
 * rethrows inside its loop), so a failed rmSync or db close in one helper skipped a later helper's
 * server close and the whole file hung (open-bugs 10-31). Helpers queue steps here instead of
 * calling `t.after` directly: every step runs, last-registered first (dependency order), and the
 * failures are rethrown together once all of them have been tried.
 */

type TeardownStep = () => unknown;
interface AfterHost { after(fn: () => unknown): void }

const queues = new WeakMap<AfterHost, TeardownStep[]>();

/** Runs every step even when some throw; one failure is rethrown as is, several as an AggregateError. */
export async function runTeardownSteps({ steps }: { steps: readonly TeardownStep[] }, _options = {}): Promise<void> {
  const failures: unknown[] = [];
  for (const step of [...steps].reverse()) {
    try { await step(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "test teardown failed", { cause: failures[0] });
}

/** Queues `step` on `t`'s single shared teardown hook (registered on the first call per context). */
export function onTeardown({ t, step }: { t: AfterHost; step: TeardownStep }, _options = {}): void {
  const queued = queues.get(t);
  if (queued) {
    queued.push(step);
    return;
  }
  const steps = [step];
  queues.set(t, steps);
  t.after(() => runTeardownSteps({ steps }));
}
