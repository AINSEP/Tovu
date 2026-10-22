/**
 * @file A short-TTL, single-flight cache for the mail status report (email phase 2, 2026-10-22).
 * Building the report can call the provider (domain status) and decrypt keys, which took 4–9 s per
 * admin page load; within the TTL every reader shares one result. `refresh` forces a fresh build,
 * `invalidate` drops the cached one (a provider switch or a key save). A failed build is never
 * cached, and a build that started before an invalidation is not stored over it.
 */

/** Default freshness window for mail status. */
export const MAIL_STATUS_TTL_MS = 30_000;

export interface TtlCache<T> {
  get(optional?: { refresh?: boolean }): Promise<T>;
  invalidate(): void;
}

/**
 * @param required.load - Builds a fresh value; its rejection reaches every concurrent caller.
 * @param required.ttlMs - How long a built value is served.
 * @param required.nowMs - Injected clock.
 * @complexity O(1) per call; at most one `load` in flight.
 */
export function createTtlCache<T>(required: { load: () => Promise<T>; ttlMs: number; nowMs: () => number }, _optional: Record<string, never> = {}): TtlCache<T> {
  let cached: { value: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;
  let generation = 0;

  const start = (): Promise<T> => {
    const startedIn = generation;
    const started = required.load().then((value) => {
      if (startedIn === generation) cached = { value, expiresAt: required.nowMs() + required.ttlMs };
      return value;
    }).finally(() => { if (inFlight === started) inFlight = undefined; });
    inFlight = started;
    return started;
  };

  return {
    get: async (optional = {}) => {
      if (optional.refresh) {
        generation += 1;
        return start();
      }
      if (cached && required.nowMs() < cached.expiresAt) return cached.value;
      return inFlight ?? start();
    },
    invalidate: () => {
      generation += 1;
      cached = undefined;
      inFlight = undefined;
    },
  };
}
