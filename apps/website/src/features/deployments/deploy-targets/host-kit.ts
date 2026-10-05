import { createNodeReachabilityPorts } from "@jini-ai/devops/deploy/node";
import type { lookup } from "node:dns";
import { AwsClient } from "aws4fetch";

import {
  DeployError as DevopsDeployError,
  assertNotRedirected,
  checkDeploymentUrl,
  normalizeDeploymentUrl,
  redirectGuardInit,
  safeDnsLabel,
  safeProjectLabel,
  waitForReachableDeploymentUrl,
} from "@jini-ai/devops/deploy";

import { trackFetch, type ObservabilityPort } from "#src/platform/observability/index";

import type { DeployFetchTimeouts, DeployHostKit, SigV4Client } from "./types.js";

/**
 * @file Builds the {@link DeployHostKit} this app injects into every plugin deploy module. Generic:
 * devops' vendor-neutral helpers (reachability, naming, redirect guard), a timeout-bounded `fetch`,
 * and a SigV4 request signer (the protocol S3-compatible stores share), nothing host-specific.
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
async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, options: { readonly timeoutMs: number }): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await fetchFn(url, { ...init, signal });
  } catch (error) {
    if (timeoutSignal.aborted && !init.signal?.aborted) throw new Error(`fetch timed out after ${options.timeoutMs}ms: ${url}`);
    throw error;
  }
}

function traced<F extends typeof fetch>(fetchFn: F, { observability }: { readonly observability?: ObservabilityPort }): F {
  return observability ? trackFetch({ fetch: fetchFn, observability }) : fetchFn;
}

/** The SigV4 client sends through the global `fetch` itself (with its own 5xx retries), so its
 *  `fetch` is traced as one call; `sign` makes no request. */
function tracedSigV4Client(client: SigV4Client, { observability }: { readonly observability?: ObservabilityPort }): SigV4Client {
  if (!observability) return client;
  return { fetch: trackFetch({ fetch: (input: string, init?: RequestInit) => client.fetch(input, init), observability }), sign: (input, init) => client.sign(input, init) };
}

/** Preserve the installed plugin constructor ABI, including status/details and instanceof. */
class PluginDeployError extends DevopsDeployError {
  // Shared helpers throw the library class; plugins must recognize those refusals too.
  static [Symbol.hasInstance](value: unknown): boolean { return value instanceof DevopsDeployError; }
  constructor(message: string, status = 400, details?: DevopsDeployError["details"]) {
    super({ message }, { status, details });
  }
}

/** A plugin's response detector is positional; the Jini response port is an object. */
function reachabilityOptions(options: NonNullable<Parameters<DeployHostKit["waitForReachableDeploymentUrl"]>[1]> = {}) {
  const { detectProtected, ...rest } = options;
  return { ...rest, ...(detectProtected ? { detectProtected: ({ resp, body }: { resp: Response; body: string }) => detectProtected(resp, body) } : {}) };
}

/**
 * The kit handed to a deploy module.
 *
 * @param options.fetchFn - What `kit.fetch` sends through (default: global `fetch`); tests inject one.
 * @param options.timeouts - Overrides the timeout classes, e.g. a shorter `QUICK` while a person waits.
 * @param options.observability - Records every kit egress (`fetch`, reachability probes, the SigV4
 *   client) as one outbound span; host/status only. Omitted or no-op: nothing is wrapped.
 * @complexity O(1).
 */
export function createDeployHostKit(options: { readonly fetchFn?: typeof fetch; readonly timeouts?: DeployFetchTimeouts; readonly lookupImpl?: typeof lookup; readonly observability?: ObservabilityPort } = {}): DeployHostKit {
  // The global is read per call, not captured here, so a test that swaps `globalThis.fetch` after
  // building a kit is still the one called.
  const fetchFn: typeof fetch = traced(options.fetchFn ?? ((input, init) => fetch(input, init)), options);
  const reachability = createNodeReachabilityPorts({}, { fetch: fetchFn, lookupImpl: options.lookupImpl });
  return {
    fetch: (url, init, fetchOptions) => fetchWithTimeout(fetchFn, url, init, fetchOptions),
    timeouts: options.timeouts ?? DEPLOY_FETCH_TIMEOUTS,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    // Standalone installed plugins keep their ABI. Every shared helper receives
    // object args and explicit host ports, including native fetch and polling time.
    checkDeploymentUrl: (url, options) => checkDeploymentUrl({ url, ...reachability }, reachabilityOptions(options)),
    waitForReachableDeploymentUrl: (urls, options) => waitForReachableDeploymentUrl({
      urls, ...reachability, now: () => Date.now(),
      sleep: ({ ms }) => new Promise(resolve => setTimeout(resolve, ms)),
    }, reachabilityOptions(options)),
    normalizeDeploymentUrl: (url) => normalizeDeploymentUrl({ url }),
    safeDnsLabel: (raw) => safeDnsLabel({ raw }),
    safeProjectLabel: (raw, maxLength) => safeProjectLabel({ raw, maxLength }),
    redirectGuardInit: (init) => redirectGuardInit({ init }),
    assertNotRedirected: (resp, providerLabel) => assertNotRedirected({ resp, providerLabel }),
    createSigV4Client: (clientOptions) => tracedSigV4Client(new AwsClient(clientOptions), options),
    DeployError: PluginDeployError,
  };
}
