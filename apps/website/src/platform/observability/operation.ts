import { isNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";

import { reportErrorOnce } from "./report-error.js";

type Attributes = Readonly<Record<string, string | number>>;

/**
 * Runs `work` as one named operation on the observability port (provider wave 2 chokepoints:
 * publish/deploy, outbox delivery). The outcome label and failure come from the settled result; a
 * throw ends the operation as `error`, is reported (once, redacted: `report-error.ts`), and is
 * rethrown unchanged. Attributes are fixed labels and ids only — the port redacts and caps them,
 * but callers must not pass user text.
 * The noop port runs `work` directly: a default install pays no tracker and no wrapper frame.
 * @param required Port, operation name, the work, and how its result maps to an outcome.
 * @param optional Starting attributes.
 * @returns Whatever `work` resolves to. @throws Whatever `work` throws.
 * @complexity O(1) around `work`.
 */
export async function trackAsyncOperation<T>(
  required: { observability: ObservabilityPort | undefined; name: string; work: () => Promise<T>; outcomeOf: (result: T) => { outcome: string; failed: boolean } },
  optional: { attributes?: Attributes } = {},
): Promise<T> {
  const { observability, name, work, outcomeOf } = required;
  if (!observability || isNoopObservabilityPort(observability)) return work();
  const tracker = observability.trackOperation({ name, ...(optional.attributes ? { attributes: optional.attributes } : {}) });
  const run = tracker.run ? <R>(fn: () => R) => tracker.run!(fn) : <R>(fn: () => R) => fn();
  try {
    const result = await run(work);
    tracker.end(outcomeOf(result));
    return result;
  } catch (error) {
    run(() => reportErrorOnce({ observability, error, operation: name }));
    tracker.end({ outcome: "error", failed: true });
    throw error;
  }
}
