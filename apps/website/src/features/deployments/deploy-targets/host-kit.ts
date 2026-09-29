import {
  DeployError,
  checkDeploymentUrl,
  normalizeDeploymentUrl,
  safeDnsLabel,
  safeProjectLabel,
  waitForReachableDeploymentUrl,
} from "@jini-ai/devops/deploy";

import type { DeployFetchTimeouts, DeployHostKit } from "./types.js";

/**
 * @file Builds the {@link DeployHostKit} this app injects into every plugin deploy module. Generic:
 * devops' vendor-neutral helpers plus a timeout-bounded `fetch`, nothing host-specific.
 */

/** Same classes and values as `@jini-ai/platform`'s `FETCH_TIMEOUT_MS` (QUICK/DEPLOY/UPLOAD), which
 *  the ported vendor code was written against. Declared here because this app does not depend on
 *  `@jini-ai/platform` directly. */
export const DEPLOY_FETCH_TIMEOUTS: DeployFetchTimeouts = Object.freeze({ QUICK: 15_000, DEPLOY: 30_000, UPLOAD: 120_000 });

/**
 * `fetch`, aborted after `timeoutMs`. A caller's own `init.signal` still works: the request aborts on
 * whichever fires first, and only OUR timeout is reported as a timeout.
 *
 * @throws {Error} `fetch timed out after <ms>ms: <url>` when the timeout fired; otherwise whatever
 * `fetch` rejected with (the caller's abort reason, a network error).
 * @complexity One request.
 */
async function fetchWithTimeout(url: string, init: RequestInit, options: { readonly timeoutMs: number }): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (timeoutSignal.aborted && !init.signal?.aborted) throw new Error(`fetch timed out after ${options.timeoutMs}ms: ${url}`);
    throw error;
  }
}

/** The kit handed to `DeployTargetModule.create`. @complexity O(1). */
export function createDeployHostKit(): DeployHostKit {
  return {
    fetch: fetchWithTimeout,
    timeouts: DEPLOY_FETCH_TIMEOUTS,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    checkDeploymentUrl,
    waitForReachableDeploymentUrl,
    normalizeDeploymentUrl,
    safeDnsLabel,
    safeProjectLabel,
    DeployError,
  };
}
