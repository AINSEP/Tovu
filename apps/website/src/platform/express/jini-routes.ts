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
import type { Express, Request as ExpressRequest, RequestHandler, Response as ExpressResponse } from "express";
import { requestFactsLocals } from "#src/platform/express/request-facts";
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

/** How an in-place mount writes a route's answer onto Express's response. */
export type InPlaceResponseWriter = (required: { readonly response: Response; readonly req: ExpressRequest; readonly res: ExpressResponse }) => Promise<void>;

/** The bridge's writer: the answer exactly as the route built it (streams pass through; Express adds no ETag and checks no freshness). */
const bridgeResponseWriter: InPlaceResponseWriter = ({ response, req, res }) => sendWebResponse({ response, res }, { headOnly: req.method === "HEAD" });

/**
 * Writes a FINISHED answer through Express `res.send`, for a route whose hand-written handler answered
 * with `res.send`: Express then states the length, adds the app's ETag (weak by default) and answers a
 * matching If-None-Match with 304 and a HEAD with no body, as that handler's answers did. The route's
 * own headers are set first (each `Set-Cookie` on its own line: cookie dates contain commas). The body
 * is read to its end before anything is written, so this is not for a streamed answer.
 * @complexity O(headers + body bytes).
 */
export const expressSendResponse: InPlaceResponseWriter = async ({ response, res }) => {
  const body = Buffer.from(await response.arrayBuffer());
  res.status(response.status);
  response.headers.forEach((value, name) => { if (name !== "set-cookie") res.set(name, value); });
  for (const cookie of response.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  res.send(body);
};

/** The web `Request` URL of an in-place mount: a fixed placeholder origin, with the path and query exactly as the client sent them (Express trusts no Host for routing). */
function inPlaceRequestUrl({ req }: { req: ExpressRequest }, _optional: Record<string, never> = {}): URL {
  const url = new URL("http://localhost");
  const target = req.originalUrl.split("#")[0] ?? "";
  const queryAt = target.indexOf("?");
  url.pathname = queryAt === -1 ? target : target.slice(0, queryAt);
  url.search = queryAt === -1 ? "" : target.slice(queryAt);
  return url;
}

/**
 * Mounts ONE body-less Jini route as an ordinary Express route at its own path and method, where a
 * hand-written `app.get(path, asyncRoute(...))` stood. Unlike {@link mountJiniRoutes} (one `use`
 * layer per list), the route stays a `route` row in the app's stack: the registration table keeps
 * its shape, and Express's own match decides — the route answers wherever Express mounted its
 * handler, with Express's decoded params, as the hand-written handler did. The answer goes through
 * `optional.writeResponse`; a throw goes to `next(error)` (the host error handler), as before.
 * The web `Request` carries the method, path, query and headers; its origin is a fixed placeholder,
 * because Express trusts no Host for routing — a route that needs the public origin takes it as a dep.
 * @param optional.anonymous - Register through an unnamed wrapper, for a route whose hand-written handler was an inline arrow.
 * @param optional.writeResponse - How the answer is written; the bridge's writer by default. Pass {@link expressSendResponse} where the hand-written handler answered with `res.send`, so its ETag and 304s stay.
 * @throws Error at mount time for a method that carries a body: this mount hands no body on.
 * @complexity O(1) setup; O(headers) per request plus the route.
 */
export function mountJiniRouteInPlace(
  { app, route }: { app: Pick<Express, "get" | "delete">; route: ServerRoute },
  { anonymous = false, writeResponse = bridgeResponseWriter }: { anonymous?: boolean; writeResponse?: InPlaceResponseWriter } = {},
): void {
  if (route.method !== "GET" && route.method !== "DELETE") throw new Error(`mountJiniRouteInPlace: ${route.method} ${route.path} carries a body; mount it with mountJiniRoutes`);
  const verb = route.method === "GET" ? "get" : "delete";
  const handler = asyncRoute({ handler: async (req, res) => {
    const request = new Request(inPlaceRequestUrl({ req }), { method: req.method, headers: nodeRequestHeaders({ incoming: req }) });
    const client = req.socket.remoteAddress ? { address: req.socket.remoteAddress } : undefined;
    const response = await route.handler({ request, params: { ...req.params }, ...(client ? { client } : {}), locals: requestFactsLocals({ req }, { base: res.locals }) });
    await writeResponse({ response, req, res });
  } });
  // The route table names each handler: a route that replaced a plain inline handler keeps its `<anonymous>` row.
  app[verb](route.path, anonymous ? (req, res, next) => handler(req, res, next) : handler);
}

/**
 * The web `Request` for a POST whose body Express's JSON parser (mounted above this route) already
 * consumed: the parsed body is re-serialized and the headers are corrected to describe it, as the
 * dispatcher does for a `use` layer. The signal aborts when the client leaves before the answer
 * finished, so a route that checks `request.signal` sees a gone caller.
 * @complexity O(body bytes + headers).
 */
function parsedBodyRequest({ req, res }: { req: ExpressRequest; res: ExpressResponse }, _optional: Record<string, never> = {}): Request {
  const headers = nodeRequestHeaders({ incoming: req });
  const controller = new AbortController();
  res.once("close", () => { if (!res.writableFinished) controller.abort(); });
  const init: RequestInit = { method: req.method, headers, signal: controller.signal };
  if (req.body !== undefined && req.body !== null) {
    const body = JSON.stringify(req.body);
    headers.set("content-length", String(Buffer.byteLength(body)));
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    init.body = body;
  }
  return new Request(inPlaceRequestUrl({ req }), init);
}

/**
 * Writes a route's answer the way a hand-written `res.status(n).json(body)` did: a JSON answer is
 * read to its end and sent through Express's buffered JSON writer, so Express states the length and
 * adds the weak ETag; the route's own other headers are copied first. An answer that is not JSON
 * (an NDJSON or other stream, or an empty body) keeps the bridge's streaming writer, which never
 * buffers it. Not the bridge's writer for JSON on purpose: that one adds no ETag.
 * @complexity O(headers + body bytes) for JSON; streamed otherwise.
 */
const expressJsonResponse: InPlaceResponseWriter = async ({ response, req, res }) => {
  const isJson = response.body !== null && /^application\/json\b/i.test(response.headers.get("content-type") ?? "");
  if (!isJson) return bridgeResponseWriter({ response, req, res });
  const body: unknown = await response.json();
  res.status(response.status);
  response.headers.forEach((value, name) => { if (name !== "set-cookie" && name !== "content-type" && name !== "content-length") res.set(name, value); });
  for (const cookie of response.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  res.json(body);
};

/**
 * Mounts Jini POST routes as ordinary method-scoped Express routes (`app.post(path, handler)`), each
 * where a hand-written `app.post` stood, in place of {@link mountJiniRoutes}'s `use` layer. Express's
 * own route match then decides: its table keeps a POST row per path, a request for another method
 * (OPTIONS included) is answered by Express itself rather than synthesized by a dispatcher, and a
 * route no one matched falls through. The body is the one the JSON parser above this call already
 * parsed; answers go through `optional.writeResponse` ({@link expressJsonResponse} by default, so a
 * JSON answer carries Express's Content-Length and weak ETag). A throw goes to `next(error)`.
 * @param optional.anonymous - Register through an unnamed wrapper, for a route whose hand-written handler was an inline arrow.
 * @throws Error at mount time for a route that is not POST.
 * @complexity O(routes) setup; O(body bytes + headers) per request plus the route.
 */
export function mountJiniPostRoutesInPlace(
  { app, routes }: { app: Pick<Express, "post">; routes: readonly ServerRoute[] },
  { anonymous = false, writeResponse = expressJsonResponse }: { anonymous?: boolean; writeResponse?: InPlaceResponseWriter } = {},
): void {
  for (const route of routes) {
    if (route.method !== "POST") throw new Error(`mountJiniPostRoutesInPlace: ${route.method} ${route.path} is not a POST route`);
    const handler = asyncRoute({ handler: async (req, res) => {
      const client = req.socket.remoteAddress ? { address: req.socket.remoteAddress } : undefined;
      const response = await route.handler({ request: parsedBodyRequest({ req, res }), params: { ...req.params }, ...(client ? { client } : {}), locals: requestFactsLocals({ req }, { base: res.locals }) });
      await writeResponse({ response, req, res });
    } });
    app.post(route.path, anonymous ? (req, res, next) => handler(req, res, next) : handler);
  }
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
