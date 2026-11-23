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
import { createNodeDispatcher, maxReserializedJsonBytes, nodeRequestHeaders, sendWebResponse } from "@jini-ai/http-kit/node-bridge";
import type { Express, RequestHandler } from "express";
import { requestFactsLocals } from "#src/server/inbound/shared/request-facts";
import { asyncRoute } from "#src/platform/express/async-route";

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

/**
 * Mounts ONE body-less Jini route as an ordinary Express route at its own path and method, where a
 * hand-written `app.get(path, asyncRoute(...))` stood. Unlike {@link mountJiniRoutes} (one `use`
 * layer per list), the route stays a `route` row in the app's stack: the registration table keeps
 * its shape, and Express's own match decides — the route answers wherever Express mounted its
 * handler, with Express's decoded params, as the hand-written handler did. The answer goes through
 * the bridge's response writer; a throw goes to `next(error)` (the host error handler), as before.
 * The web `Request` carries the method, path, query and headers; its origin is a fixed placeholder,
 * because Express trusts no Host for routing — a route that needs the public origin takes it as a dep.
 * @throws Error at mount time for a method that carries a body: this mount hands no body on.
 * @complexity O(1) setup; O(headers) per request plus the route.
 */
export function mountJiniRouteInPlace({ app, route }: { app: Pick<Express, "get" | "delete">; route: ServerRoute }, _optional: Record<string, never> = {}): void {
  if (route.method !== "GET" && route.method !== "DELETE") throw new Error(`mountJiniRouteInPlace: ${route.method} ${route.path} carries a body; mount it with mountJiniRoutes`);
  const verb = route.method === "GET" ? "get" : "delete";
  app[verb](route.path, asyncRoute({ handler: async (req, res) => {
    const url = new URL("http://localhost");
    const target = req.originalUrl.split("#")[0] ?? "";
    const queryAt = target.indexOf("?");
    url.pathname = queryAt === -1 ? target : target.slice(0, queryAt);
    url.search = queryAt === -1 ? "" : target.slice(queryAt);
    const request = new Request(url, { method: req.method, headers: nodeRequestHeaders({ incoming: req }) });
    const client = req.socket.remoteAddress ? { address: req.socket.remoteAddress } : undefined;
    const response = await route.handler({ request, params: { ...req.params }, ...(client ? { client } : {}), locals: requestFactsLocals({ req }, { base: res.locals }) });
    await sendWebResponse({ response, res }, { headOnly: req.method === "HEAD" });
  } }));
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
