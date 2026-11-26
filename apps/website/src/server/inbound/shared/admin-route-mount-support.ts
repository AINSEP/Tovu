import type { registerExternalMcpOAuthConnectRoutes } from "@jini-ai/cms/admin-http/routes/external-mcp/oauth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import type { Express, RequestHandler } from "express";
import type { JsonRouteSpec } from "@jini-ai/http-kit";
import { isSameOriginBrowserWrite, type OriginContext, type RouteErrorPorts, type RouteHostContext } from "@jini-ai/core/contracts/server";
import { asyncRoute, type AsyncRouteHandler } from "#src/platform/express/async-route";

/** Header-only reads, because http-kit hands the policy the raw Node request (no Express `req.get`). */
function headerText({ req, name }: { req: { headers?: Record<string, unknown> }; name: string }, _optional: Record<string, never> = {}): string | undefined {
  const value = req.headers?.[name];
  return typeof value === "string" ? value : undefined;
}

/** The admin's own same-origin rule for a guarded JSON write: the exact browser-write check the
 *  hand-written saved-keys write applies (`isSameOriginBrowserWrite` — an `Origin` naming this host, and
 *  `sec-fetch-site`, when sent, `same-origin`). A JSON admin route only ever serves the admin's own pages,
 *  so this is the mount's default; without one http-kit throws and a cross-origin write became a 500. */
export const adminBrowserWriteOrigin: OriginContext = {
  originPolicy: {
    isSameOrigin: ({ req }) => isSameOriginBrowserWrite({
      origin: headerText({ req, name: "origin" }), host: headerText({ req, name: "host" }), fetchSite: headerText({ req, name: "sec-fetch-site" }),
    }),
  },
};

/**
 * The admin same-origin write policy: a browser write whose `Origin` is exactly this server's host
 * (and whose fetch metadata, when sent, agrees) — the rule `site-share-password.ts` applies by hand.
 * A request without `Origin` is refused, so a cross-site form or script can never reach the handler.
 */
export const adminSameOriginWrites: OriginContext = {
  originPolicy: {
    isSameOrigin: ({ req }) => {
      const headers = req.headers ?? {};
      const text = (value: unknown): string | undefined => (typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined);
      return isSameOriginBrowserWrite({ origin: text(headers.origin), host: text(headers.host), fetchSite: text(headers["sec-fetch-site"]) });
    },
  },
};

/** The one-method app `mountJsonRoute` registers on, wrapping its handler in `asyncRoute`.
 *  `mountJsonRoute` only calls `app[spec.method](path, handler)`; a new use of `app` there fails
 *  loudly here (not a silent bypass), and `admin-json-route-ports.test.ts` pins the wrapped name.
 * @complexity O(1). */
export function registeringThroughAsyncRoute(
  { app, method }: { app: Express; method: JsonRouteSpec<unknown, unknown, unknown>["method"] },
  _optional: Record<string, never> = {},
): Express {
  // Any `bodyParsers` stay ahead of the handler, in the same registration; only the handler is wrapped.
  const register = (path: string, ...handlers: RequestHandler[]) => {
    const handler = handlers.pop() as unknown as AsyncRouteHandler;
    return (app as unknown as Record<string, (path: string, ...registered: RequestHandler[]) => unknown>)[method](path, ...handlers, asyncRoute({ handler }));
  };
  return { [method]: register } as unknown as Express;
}

/** The origin policy of a bound mount whose spec never consults one: refuses every request, so a
 *  later `requireSameOrigin` flag without the host's policy fails closed instead of open. */
const denyUnboundOrigin: OriginContext = { originPolicy: { isSameOrigin: () => false } };

/** Refuse, at registration, a wrapper mount without the site's route error reporter (T-GATE). The
 *  type already requires `errors`; this guards an untyped caller (JS, `as never`) before Express is
 *  touched, so an unbound mount can never fall back to the kit's own reporterless incident path.
 * @throws Error naming the path when `errors` is absent.
 * @complexity O(1). */
export function requireRouteErrors(
  { path, errors }: { path: string; errors: RouteErrorPorts | undefined },
  _optional: Record<string, never> = {},
): RouteErrorPorts {
  if (!errors) throw new Error(`route ${path}: mount needs the site's route error reporter — pass \`errors\` (RouteErrorPorts) to the mount`);
  return errors;
}

/** The kit adapter for a bound wrapper mount: the site's error ports, plus the given origin policy
 *  or the fail-closed {@link denyUnboundOrigin}.
 * @complexity O(1). */
export function routeAdapterFor(
  { origin, errors }: { origin: OriginContext | undefined; errors: RouteErrorPorts },
  _optional: Record<string, never> = {},
): { adapter: RouteHostContext & { errors: RouteErrorPorts } } {
  return { adapter: { ...(origin ?? denyUnboundOrigin), errors } };
}

export function registeringWithOAuthAdmission(
  { app, method, limiter, before }: { app: Express; method: JsonRouteSpec<unknown, unknown, unknown>["method"]; limiter: RateLimiter; before?: Parameters<Parameters<typeof registerExternalMcpOAuthConnectRoutes>[0]["mountRaw"]>[0]["before"] },
  _optional = {},
): Express {
  if (!before) return app;
  const register = (path: string, handler: RequestHandler) => app[method](path, asyncRoute({ handler: async (req, res, next) => {
    await before({
      rate: {
        check: () => limiter.check({ key: resolveClientIp(req) }),
        retryAfter: value => { res.setHeader("Retry-After", value); },
        json: (body, status) => { res.status(status).json(body); },
        message: "too many OAuth attempts",
      },
      noStore: headers => { res.set(headers); },
      requireSession: required => rejectUnlessSessionCredential({ res, ...required }),
    }, async () => { await handler(req, res, next); });
  } }));
  return { [method]: register } as unknown as Express;
}
