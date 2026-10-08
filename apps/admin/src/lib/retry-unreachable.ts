// Retry/abort rationale: Jini/packages/ui/src/features/panel-kit/helpers/retry-unreachable.ts.
import { isAbortError as isPackageAbortError, retryWhileUnreachable as retryPackageRequest } from "@jini-ai/ui/panel-kit";
import { API_UNREACHABLE_CODE, ApiError } from "./api";

export { UNREACHABLE_RETRY_DELAYS_MS } from "@jini-ai/ui/panel-kit";

/** Preserve the host's positional abort classifier. */
export function isAbortError(error: unknown): boolean {
  return isPackageAbortError({ error });
}

/** Retry only Tovu's transport-unreachable error; auth and application failures propagate.
 * @param input.load - The request to rerun; called at most `delaysMs.length + 1` times.
 * @param input.signal - Aborting stops retries and rejects a pending wait with AbortError;
 *   callers still guard state writes because an in-flight request is not cancelled here.
 * @param options.delaysMs - Defaults to {@link UNREACHABLE_RETRY_DELAYS_MS}.
 * @returns The first successful result.
 * @throws The first application error unchanged, the last unreachable error after the delays
 *   are exhausted, or AbortError when the signal aborts between attempts.
 * @complexity O(delaysMs.length) attempts; O(1) space.
 */
// A once-mounted AssistantDock otherwise stays degraded until reload after a brief API restart.
// API_UNREACHABLE means no application answered (rejected fetch or an unparseable proxy 5xx).
// Real application 4xx/5xx and REQUEST_TIMEOUT (already a 60-second wait) are not retried.
export function retryWhileUnreachable<T>(
  { load, signal }: { load: () => Promise<T>; signal: AbortSignal },
  options: { delaysMs?: readonly number[] } = {},
): Promise<T> {
  return retryPackageRequest({
    load, signal,
    isUnreachable: (error) => error instanceof ApiError && error.code === API_UNREACHABLE_CODE,
  }, options);
}
