import { assertNotRedirected, DeployError, redirectGuardInit } from "@jini-ai/devops/deploy";

import { describeErrorForLog } from "../../contracts/core/model-facing-tool-errors.js";
import { EgressRefusedError, type HttpClientPort } from "../../platform/http/index.js";
import type { SourceControlProviderKit } from "./provider-module.js";

/**
 * @file Builds the {@link SourceControlProviderKit} core hands a git-host provider module
 * (`provider-module.ts`). The kit is the module's only way to reach anything but Node builtins.
 */

/** Stands in when a caller has no guarded HTTP client (the admin credential form only probes an
 *  account name, through `fetch`). A call through it fails as a transport error, never silently. */
const NO_HTTP_CLIENT: HttpClientPort = {
  send: () => Promise.reject(new Error("no outbound HTTP client is wired for this call")),
};

/**
 * @param options.httpClient - The guarded client for credentialed custom-credential calls.
 * @param options.fetchFn - Replaces global `fetch` (tests); otherwise `fetch` is looked up per call.
 * @complexity O(1).
 */
export function createSourceControlProviderKit(options: { readonly httpClient?: HttpClientPort; readonly fetchFn?: typeof fetch } = {}): SourceControlProviderKit {
  return {
    fetch: (url, init) => (options.fetchFn ?? fetch)(url, init),
    redirectGuardInit: (init) => redirectGuardInit(init),
    assertNotRedirected: (response, hostName) => assertNotRedirected(response, hostName),
    isRedirectRefusal: (error) => error instanceof DeployError,
    httpClient: options.httpClient ?? NO_HTTP_CLIENT,
    describeTransportError: (error) => ({
      refusal: error instanceof EgressRefusedError ? error.callerSafeMessage : undefined,
      logDetail: error instanceof EgressRefusedError ? error.message : describeErrorForLog(error),
    }),
  };
}
