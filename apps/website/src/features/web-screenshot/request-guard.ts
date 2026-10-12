/** Product HTTP signature adapter; Jini owns pinned request routing and redirect/budget rules.
 * Security rationale and why Chromium never receives redirects live in Jini's request-guard.ts. */
import { createRequestRouter as createJiniRequestRouter } from "@jini-ai/diagnostics/web-evidence/playwright";
import type { HttpClientPort } from "#src/platform/http/index";
import type { OwnSiteFetch, RequestRouterOptions } from "@jini-ai/diagnostics/web-evidence/playwright";
export { decideRequest, fetchOwnSiteResource, MAX_REDIRECT_HOPS } from "@jini-ai/diagnostics/web-evidence/playwright";
export type { OwnSiteFetch, RequestRouter, RequestRouterOptions, RouteLike, RoutedRequest, FetchedResource, AbortReason, RequestDecision, RequestRouterReport } from "@jini-ai/diagnostics/web-evidence/playwright";

/** Adapt the host signature without opening any raw public transport. */
export function createRequestRouter(
  { httpClient, ...required }: { httpClient: HttpClientPort; ownSiteFetch: OwnSiteFetch; allowedOrigins: readonly string[]; signal: AbortSignal },
  options: RequestRouterOptions = {},
) {
  return createJiniRequestRouter({ ...required, httpClient: { send: ({ request }) => httpClient.send(request) } }, options);
}
