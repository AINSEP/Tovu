import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import type { Express, Request } from "express";

import { createAnalyticsForwardLimiter } from "@jini-ai/analytics";
import { analyticsIngestRoute, type AnalyticsIngestBeaconRouteDeps } from "@jini-ai/analytics/public-http/routes/analytics-ingest";
import type { AnalyticsIngestRouteDeps as IngestDeps } from "@jini-ai/analytics/site/jini-adapters";

import { mountPublicRawRoute } from "../../../admin-http/admin-raw-route-ports.js";

type AnalyticsIngestRouteDeps = IngestDeps<Request>;

/**
 * @file The host binding of Jini's `analyticsIngestRoute` (`POST /_analytics/e`, see its file doc for the
 * no-oracle 204 contract). This file owns what only this host and this request know: the consent-gated
 * forwarders and plugin-hook gate, the visitor pageview capture, the hostname and the client address,
 * each bound as a closure over THAT request by `requestDeps`.
 */

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/**
 * Registers the public analytics beacon route with host clock, configuration and sink ports.
 * The binding adapter supplies Jini's required policy/salt context and converts port/hook arguments.
 * createApp wires this public route separately from admin RouteDeps.
 */
export function registerAnalyticsIngestRoute({ app, deps }: { app: Express; deps: AnalyticsIngestRouteDeps }, _optional: Record<string, never> = {}): void {
  // One cap per route for every request's vendor calls: a beacon flood sheds vendor calls, never local hits.
  const mounted: AnalyticsIngestBeaconRouteDeps = {
    ingest: deps,
    limiter: createAnalyticsForwardLimiter(),
    browserAnalytics: deps.browserAnalytics,
    capturePageview: boundPerRequest,
    hostname: boundPerRequest,
    clientAddress: boundPerRequest,
  };
  mountPublicRawRoute({
    app,
    spec: analyticsIngestRoute,
    deps: mounted,
    // Unreachable in practice: the spec swallows every ingest-side failure and always answers 204.
    failure: { operation: "public:analytics-ingest", visitorError: "The analytics beacon couldn’t be recorded." },
  }, {
    requestDeps: ({ req, deps: base }) => ({
      ...base,
      ...(deps.forwarders ? { forwarders: () => deps.forwarders!({ request: req }) } : {}),
      ...(deps.vendorHooksAllowed ? { vendorHooksAllowed: () => deps.vendorHooksAllowed!({ request: req }) } : {}),
      capturePageview: ({ name, properties }) => { void captureVisitorEvent({ deps, request: req, name, properties }); },
      hostname: () => req.hostname,
      clientAddress: () => req.ip ?? req.socket.remoteAddress,
    }),
  });
}
