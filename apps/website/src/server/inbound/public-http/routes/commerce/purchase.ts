/** Member HTTP boundary only: identity and scope come from the host; Jini owns orders and money. */
import type { Express, IRouter, Request, Response } from "express";
import type { CommerceOrderView } from "@jini-ai/commerce";
import { createOrderRoute, payOrderRoute, readOrderRoute, commerceReturnRoute, commerceCancelRoute } from "@jini-ai/commerce/http/purchase";
import { mountJsonRoute } from "@jini-ai/http-kit";
import { escapeHtml } from "@jini-ai/core/text";
import { activeMemberFromSession } from "@jini-ai/user-management/members/access-resolver";
import { createRateLimiter, OUTBOUND_CALL_PER_IP, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { RouteDeps } from "#src/server/routes/types";
import { uniqueMemberCookie } from "../members/oidc-deps.js";
import { isSameOriginCommentPost } from "../site/comments-submit.js";
import { resolveProtocol } from "../../../../../platform/express/public-origin.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";

/** Narrow structural port; no credential, provider or ledger mutation capability crosses HTTP. */
export interface CommerceHttpPort {
  forRequest?(): CommerceHttpPort;
  status(): Promise<{ active: boolean; ready: boolean; reason: string | null }>;
  activate(): Promise<{ active: boolean; ready: boolean; reason: string | null }>;
  checkoutOrigin(): Promise<string | null>;
  createOrder(input: { memberId: string; priceId: string; quantity?: number }): Promise<unknown>;
  pay(input: { memberId: string; orderId: string }): Promise<unknown>;
  readOrder(input: { memberId: string; orderId: string }): Promise<unknown>;
}
export type CommerceHttpDeps = Pick<RouteDeps, "workspaceId" | "clock" | "memberRepo" | "memberSessionRepo"> & {
  commerce?: CommerceHttpPort;
  renderCommercePage?: (required: { req: Request; res: Response; title: string; body: string }) => Promise<string>;
};

type RequestContext = { req: Request; res: Response; deps: CommerceHttpDeps; limiter: RateLimiter };

const buyer = ({ req, deps }: Pick<RequestContext, "req" | "deps">): Promise<string | null> => activeMemberFromSession({ deps: {
  get memberSessionRepo() { return deps.memberSessionRepo; },
  get memberRepo() { return deps.memberRepo; },
  get workspaceId() { return deps.workspaceId; },
  sessionToken: () => uniqueMemberCookie({ req, name: "tovu_member_session" }),
  nowIso: () => deps.clock.nowIso(),
} });

/** A mutation shares one host configuration snapshot; read-only ledger reads need none. O(1). */
function requestCommerce({ req, res, deps, limiter }: RequestContext) {
  let commerce: CommerceHttpPort | undefined;
  return {
    get workspaceId() { return deps.workspaceId; },
    markNoStore: () => { res.set("Cache-Control", "no-store"); },
    resolveCommerce: () => Boolean(commerce = req.method === "POST" ? (deps.commerce?.forRequest?.() ?? deps.commerce) : deps.commerce),
    checkLimit: () => limiter.check({ key: resolveClientIp(req) }),
    setRetryAfter: ({ seconds }: { seconds: number }) => { res.set("Retry-After", String(seconds)); },
    buyer: () => buyer({ req, deps }),
    sameOrigin: () => isSameOriginCommentPost({ request: req }),
    checkoutOrigin: () => commerce!.checkoutOrigin(),
    requestOrigin: () => req.get("origin") ?? `${resolveProtocol(req)}://${req.get("host")}`,
    activate: () => commerce!.activate(),
    createOrder: (input: Parameters<CommerceHttpPort["createOrder"]>[0]) => commerce!.createOrder(input),
    pay: (input: Parameters<CommerceHttpPort["pay"]>[0]) => commerce!.pay(input) as Promise<CommerceOrderView>,
    readOrder: (input: Parameters<CommerceHttpPort["readOrder"]>[0]) => commerce!.readOrder(input) as Promise<CommerceOrderView>,
    renderBuyerPage: (input: Parameters<typeof buyerPage>[1]) => buyerPage({ req, res, deps }, input),
  };
}

/** A host theme wraps escaped buyer content; minimal hosts still receive a complete HTML page. O(n) body bytes. */
async function buyerPage({ req, res, deps }: Pick<RequestContext, "req" | "res" | "deps">,
  { title, message, order }: { status: number; title: string; message: string; order?: { id: string; status: string } }): Promise<string> {
  const orderMarkup = order ? `<p>Order <span>${escapeHtml({ text: order.id })}</span></p>` : "";
  const state = order ? ` data-order-status="${escapeHtml({ text: order.status })}"` : "";
  const body = `<section class="wrap commerce-order"${state}><h1>${escapeHtml({ text: title })}</h1><p role="status">${escapeHtml({ text: message })}</p>${orderMarkup}<p><a class="button" href="/products">Back to shop</a></p></section>`;
  const html = deps.renderCommercePage ? await deps.renderCommercePage({ req, res, title, body })
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml({ text: title })}</title></head><body><main>${body}</main></body></html>`;
  return html;
}

/** Commerce defines its routes with core's `defineJsonRoute`, whose optional `ports` contract (authenticate gets
 *  `request`/`locals`) differs from http-kit's (authenticate gets `res`). These specs declare no ports, so the
 *  slot is dropped before mounting rather than claiming one contract satisfies the other. */
function withoutCorePorts<TSpec extends { ports?: unknown }>({ spec }: { spec: TSpec }, _optional = {}): Omit<TSpec, "ports"> {
  const { ports: _ports, ...portless } = spec;
  return portless;
}

/** Purchase/resume and read-only return routes. One limiter per mounted app, never per request.
 * @complexity O(1) setup and bounded point I/O per request; domain effects are delegated to Jini.
 */
export function registerCommerceRoutes({ app, deps }: { app: IRouter; deps: CommerceHttpDeps }, _optional = {}): void {
  const limiter = createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock: deps.clock });
  mountJsonRoute({ app: app as Express, spec: withoutCorePorts({ spec: createOrderRoute }), deps: {} as ReturnType<typeof requestCommerce> }, {
    requestDeps: ({ req, res }) => requestCommerce({ req, res, deps, limiter }),
  });
  mountJsonRoute({ app: app as Express, spec: withoutCorePorts({ spec: payOrderRoute }), deps: {} as ReturnType<typeof requestCommerce> }, {
    requestDeps: ({ req, res }) => requestCommerce({ req, res, deps, limiter }),
  });
  mountJsonRoute({ app: app as Express, spec: withoutCorePorts({ spec: readOrderRoute }), deps: {} as ReturnType<typeof requestCommerce> }, {
    requestDeps: ({ req, res }) => requestCommerce({ req, res, deps, limiter }),
  });
  app.get(commerceReturnRoute.path, asyncRoute({ handler: (req, res) => commerceReturnRoute.handle({ query: req.query, deps: requestCommerce({ req, res, deps, limiter }) })
    .then(reply => res.status(reply.status).set("Cache-Control", "no-store").type("html").send(reply.html)) }));
  app.get(commerceCancelRoute.path, asyncRoute({ handler: (req, res) => commerceCancelRoute.handle({ query: req.query, deps: requestCommerce({ req, res, deps, limiter }) })
    .then(reply => res.status(reply.status).set("Cache-Control", "no-store").type("html").send(reply.html)) }));
}
