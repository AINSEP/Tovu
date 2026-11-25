/**
 * @file The request's answer to "did this request's tracker already admit THIS failure?".
 *
 * Jini's request scope (`ErrorReportScope`) records each admitted error object in one `WeakSet` per
 * tracker port, keyed by a port object the tracker keeps private. A plain `WeakMap` cannot be asked
 * which errors it holds without that key, so the scope the request opens carries this map instead: it
 * keeps a handle on every set Jini stores in it and can answer for one error object. The flag
 * `scope.reported` is not enough: it turns true when ANY work in the request reported, and an
 * unrelated earlier report must not silence this failure's own tracker report.
 */
import type { ObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { ErrorReportScope } from "@jini-ai/diagnostics/observability/node";

/** A per-request `WeakMap` that also remembers the admission sets handed to it (one per port). */
class AdmissionLedger extends WeakMap<ObservabilityPort, WeakSet<object>> {
  // Held only for the request's lifetime; the scope object, and with it this ledger, dies with the request.
  readonly #sets = new Set<WeakSet<object>>();

  override set(port: ObservabilityPort, admitted: WeakSet<object>): this {
    this.#sets.add(admitted);
    return super.set(port, admitted);
  }

  admitted({ error }: { error: object }): boolean {
    for (const set of this.#sets) if (set.has(error)) return true;
    return false;
  }
}

/**
 * A fresh request scope whose admissions can be queried per error object.
 * @complexity O(1).
 */
export function createRequestReportScope(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ErrorReportScope {
  return { reported: false, errors: new AdmissionLedger() };
}

/**
 * True only when this exact error object was admitted to a tracker inside the request's scope.
 * A scope built elsewhere (no ledger), a missing scope or a primitive throw answers false, so the
 * caller reports rather than silently skipping.
 * @complexity O(trackers in the request), normally one.
 */
export function wasAdmittedInRequest({ scope, error }: { scope: ErrorReportScope | undefined; error: unknown }, _optional: Record<string, never> = {}): boolean {
  if (typeof error !== "object" || error === null) return false;
  return scope?.errors instanceof AdmissionLedger && scope.errors.admitted({ error });
}
