/**
 * @file Where this site's Express app meets route lists from Jini. A Jini route group returns its
 * routes as data and never sees the app; the daemon scope mounts each list here, and builds here
 * the one host object every group is given. Nothing in this file decides policy: the gates, the
 * parsers and the same-origin rule stay where the scope mounts them.
 */
import { timingSafeEqual } from "node:crypto";
import type { SecretRedactionPattern, TimingSafeByteComparison } from "@jini-ai/core";
import type { RouteHostContext, ServerRoute, SseSchedulerPort } from "@jini-ai/core/contracts/server";
import type { DaemonRouteHost, FrontendSessionTimer } from "@jini-ai/daemon/http";
import { reportRouteInternalError } from "@jini-ai/http-kit";
import { createNodeDispatcher, maxReserializedJsonBytes } from "@jini-ai/http-kit/node-bridge";
import type { RequestHandler } from "express";
import { requestFactsLocals } from "#src/server/inbound/shared/request-facts";

/**
 * Mounts `routes` as one layer at this position in `app`.
 *
 * Mount rule: call this ON THE LINE where the group's former `register*Routes({ app })` call
 * stood, so every Express gate and parser above that line still runs first, and a request the
 * list does not own (another path, or another method of a path it owns) falls through to the
 * routes below it.
 * Every dispatch gets the request facts (client address, serving protocol, `secure`, query) in `locals`, computed here per request because they follow the trust-proxy setting of the app whose layer is running.
 * @param optional.rawBody - The routes read the request body as raw bytes (uploads). The body a parser above may have produced is then NOT handed on: a route sees the untouched stream, or no body at all when a parser above consumed it. Without this an upload sent as JSON would be stored as re-serialized text.
 * @param optional.redactionPatterns - Extra secret shapes to remove from the log line written when a route throws; the bridge's own patterns always apply.
 * @complexity O(routes) once; one route-table lookup per request.
 */
export function mountJiniRoutes(
  { app, routes }: { app: { use: (handler: RequestHandler) => unknown }; routes: readonly ServerRoute[] },
  { rawBody = false, redactionPatterns = [] }: { rawBody?: boolean; redactionPatterns?: readonly SecretRedactionPattern[] } = {},
): void {
  // Express answered these routes before they were lists. Callers (and the admin proxy, which forwards a path as the client spelled it) kept their spellings: the answers stay.
  const dispatcher = createNodeDispatcher({}, { redactionPatterns, expressCompatible: true });
  for (const route of routes) dispatcher.server.route(route);
  app.use((req, res, next) => {
    // A route that throws is answered by the dispatcher itself, so this promise always settles.
    void dispatcher.handle({ incoming: req, out: res }, { next, locals: requestFactsLocals({ req }, { base: res.locals }), ...(rawBody ? {} : { parsedBody: req.body as unknown }) });
  });
}

/** Keepalive timers on Node's clock. Unref'd, as the stream helpers they replace were: an idle stream must not keep the process alive. */
export const nodeIntervalScheduler: SseSchedulerPort = {
  every: ({ callback, intervalMs }) => { const timer = setInterval(callback, intervalMs); timer.unref(); return timer; },
  cancel: ({ handle }) => { clearInterval(handle as NodeJS.Timeout); },
};

/** A one-shot timer on Node's clock for a frontend session's expiry. Unref'd: a pending expiry must not keep the process alive. */
export const nodeSessionTimer: FrontendSessionTimer = ({ callback, delayMs }) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return { cancel: () => { clearTimeout(timer); } };
};

/** The constant-time compare itself. Routes reach it only through Jini's `timingSafeTokenMatch`, which compares lengths first. */
export const nodeTimingSafeEqual: TimingSafeByteComparison = ({ left, right }) => timingSafeEqual(left, right);

/**
 * The host object for every Jini route group of one daemon scope. Build it once per scope.
 * @param required.context - The same-origin policy and incident sink the scope already builds for its routes.
 * @param required.parserLimitBytes - The byte limit of the JSON parser the scope mounts above the routes. A route re-reads the body that parser produced, and re-serialized JSON can be up to 5.25 times longer (a number such as `1e20` prints as 21 digits), so the routes' own limit is derived from it; the parser's limit stays the effective one.
 */
export function daemonRouteHost(required: { context: RouteHostContext; parserLimitBytes: number }, _optional: Record<string, never> = {}): DaemonRouteHost {
  return {
    context: required.context,
    reportInternalError: reportRouteInternalError,
    scheduler: nodeIntervalScheduler,
    timingSafeEqual: nodeTimingSafeEqual,
    jsonBodyMaxBytes: maxReserializedJsonBytes({ parserLimitBytes: required.parserLimitBytes }),
  } satisfies DaemonRouteHost;
}
