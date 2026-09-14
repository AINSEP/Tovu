import { API_UNREACHABLE_CODE, ApiError } from "./api";

/**
 * @file Bounded retry for a load that must survive the API briefly going away — for a long-lived
 * mount (the `AssistantDock`, mounted once per session) whose one load would otherwise leave it
 * degraded until a full page reload.
 *
 * Only `API_UNREACHABLE` is retried: `request()` synthesizes that code solely for "no Tovu application
 * answered" (a rejected fetch while the page is alive, or a proxy's unparseable 5xx). A dev-API restart
 * (`tsx watch` reloading on a save) produces exactly that for ~6-11s (o12 health poll, 2026-09-13).
 * Every other failure — a real 4xx/5xx the API composed, `REQUEST_TIMEOUT` (already 60s long) — is
 * rethrown on the first attempt, unchanged.
 */

/** Waits between attempts: ~60s in total, enough to span a dev restart or a short production
 *  redeploy, short enough that an API that is really down is still reported within a minute. */
export const UNREACHABLE_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * Whether `error` is a cancellation — a caller's abort, a retry wait cut short by
 * {@link retryWhileUnreachable}'s `signal`, or `request()`'s page-unload rejection. Duck-typed on
 * `name` because a `DOMException`'s `instanceof Error` result is realm-dependent (see `api.ts`'s
 * `errorName`).
 *
 * @complexity O(1).
 */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.code === API_UNREACHABLE_CODE;
}

/** Resolves after `ms`, or rejects with an `AbortError` as soon as `signal` aborts (immediately, if it
 *  already has) — clearing its timer either way so an unmounted caller leaves nothing scheduled. */
function waitUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("retry cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Runs `load`, retrying after each of `delaysMs` while it fails with `API_UNREACHABLE`.
 *
 * @param input.load - The request to (re)run. Called at most `delaysMs.length + 1` times.
 * @param input.signal - Aborting it stops further attempts; the pending wait rejects with an
 *   `AbortError` (check with {@link isAbortError}). An attempt already in flight is not cancelled —
 *   callers still guard their own state writes on `signal.aborted`.
 * @param options.delaysMs - Defaults to {@link UNREACHABLE_RETRY_DELAYS_MS}.
 * @returns `load`'s first successful result.
 * @throws The first non-`API_UNREACHABLE` error unchanged; the last `API_UNREACHABLE` error once the
 *   delays are exhausted; an `AbortError` once `signal` aborts between attempts.
 * @complexity O(delaysMs.length) attempts; O(1) space.
 */
export async function retryWhileUnreachable<T>(
  { load, signal }: { load: () => Promise<T>; signal: AbortSignal },
  { delaysMs = UNREACHABLE_RETRY_DELAYS_MS }: { delaysMs?: readonly number[] } = {},
): Promise<T> {
  for (const delayMs of delaysMs) {
    try {
      return await load();
    } catch (error) {
      if (!isUnreachable(error)) throw error;
    }
    await waitUnlessAborted(delayMs, signal);
  }
  return load();
}
