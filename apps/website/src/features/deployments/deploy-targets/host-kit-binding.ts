import { setTimeout as sleep } from "node:timers/promises";
import { createNodeReachabilityPorts } from "@jini-ai/devops/deploy/node";
import { assertSafePublicUrl, createValidatingLookup } from "@jini-ai/platform";
import type { lookup } from "node:dns";
import { AwsClient } from "aws4fetch";

import { createDeployHostKit as createJiniDeployHostKit } from "@jini-ai/devops/deploy/site/deploy-targets/host-kit";
import { trackFetch } from "@jini-ai/diagnostics/observability";
import { type ObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { DeployFetchTimeouts, SigV4Client } from "@jini-ai/devops/deploy/site/deploy-targets/types";
import type { PluginDeployHostKit as DeployHostKit } from "@jini-ai/devops/deploy";

function traced<F extends typeof fetch>(fetchFn: F, { observability }: { readonly observability?: ObservabilityPort }): F {
  return observability ? trackFetch({ fetch: fetchFn, observability }) : fetchFn;
}

/** The SigV4 client sends through the global `fetch` itself (with its own 5xx retries), so its
 *  `fetch` is traced as one call; `sign` makes no request. */
function tracedSigV4Client(client: SigV4Client, { observability }: { readonly observability?: ObservabilityPort }): SigV4Client {
  if (!observability) return client;
  return { fetch: trackFetch({ fetch: (input: string, init?: RequestInit) => client.fetch(input, init), observability }), sign: (input, init) => client.sign(input, init) };
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
  return createJiniDeployHostKit({
    fetchFn,
    createReachability: () => createNodeReachabilityPorts({ assertSafeUrl: assertSafePublicUrl, createValidatingLookup }, { fetch: fetchFn, lookupImpl: options.lookupImpl }),
    now: () => Date.now(),
    sleep: ({ ms }) => sleep(ms),
    createSigV4Client: ({ options: clientOptions }) => tracedSigV4Client(new AwsClient(clientOptions), options),
  }, options.timeouts === undefined ? {} : { timeouts: options.timeouts });
}
