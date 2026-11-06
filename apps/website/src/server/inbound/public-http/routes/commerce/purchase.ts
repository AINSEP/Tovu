/** Member HTTP boundary only: identity and scope come from the host; Jini owns orders and money. */
import type { IRouter, Request, Response } from "express";
import { CommerceCheckoutValidationError, CommerceOrderNotFoundError, CommercePriceNotFoundError,
  CommerceProductNotFoundError, commerceBuyerStatus, toCommerceBuyerOrder, type CommerceOrderView } from "@jini-ai/commerce";
import { escapeHtml } from "#src/platform/html/escape";
import { resolveMemberSession } from "#src/features/members/access-resolver";
import { MemberLoginError } from "#src/features/member-login/index";
import { createRateLimiter, OUTBOUND_CALL_PER_IP, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { RouteDeps } from "#src/server/routes/types";
import { uniqueMemberCookie } from "../members/oidc-deps.js";
import { isSameOriginCommentPost } from "../site/comments-submit.js";
import { resolveProtocol } from "../oauth/public-origin.js";

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

const ORDERS = "/api/commerce/v1/workspaces/:workspaceId/orders";
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
type RequestContext = { req: Request; res: Response; deps: CommerceHttpDeps; limiter: RateLimiter; page?: boolean };

/** Resolve only the member cookie, including revocation; operator cookies cannot purchase. O(1) reads. */
async function buyer({ req, deps }: Pick<RequestContext, "req" | "deps">): Promise<string | null> {
  let sessionToken: string | undefined;
  try { sessionToken = uniqueMemberCookie({ req, name: "tovu_member_session" }); }
  catch (error) {
    if (error instanceof MemberLoginError) return null;
    throw error;
  }
  const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
    sessionToken, nowIso: deps.clock.nowIso() });
  if (!session) return null;
  const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: session.memberId });
  if (!member || member.status !== "active") return null;
  if (member.credentialsRevokedAt && session.createdAt < member.credentialsRevokedAt) return null;
  return member.id;
}

/** A mutation shares one host configuration snapshot; read-only ledger reads need none. O(1). */
function requestCommerce({ req, deps }: Pick<RequestContext, "req" | "deps">): CommerceHttpPort | undefined {
  return req.method === "POST" ? (deps.commerce?.forRequest?.() ?? deps.commerce) : deps.commerce;
}

/** Deny before effects on foreign scope, off/unavailable commerce, failed auth or rate budget. O(1) I/O. */
async function admit(context: RequestContext): Promise<{ memberId: string; commerce: CommerceHttpPort } | null> {
  const { req, res, deps, limiter } = context;
  res.set("Cache-Control", "no-store");
  if (req.params.workspaceId && req.params.workspaceId !== deps.workspaceId) {
    await reject(context, 404, "This shop was not found.", "SHOP_NOT_FOUND"); return null;
  }
  const commerce = requestCommerce({ req, deps });
  if (!commerce) { await reject(context, 503, "Checkout is not enabled for this shop.", "COMMERCE_UNAVAILABLE"); return null; }
  const limit = await limiter.check({ key: resolveClientIp(req) });
  if (!limit.allowed) {
    res.set("Retry-After", String(limit.retryAfterSeconds));
    await reject(context, 429, "Too many checkout requests. Please wait a minute and try again.", "RATE_LIMIT_EXCEEDED"); return null;
  }
  const memberId = await buyer(context);
  if (!memberId) { await reject(context, 401, "Sign in as a shop member to view or pay for your order.", "MEMBER_SIGN_IN_REQUIRED"); return null; }
  if (req.method === "POST" && !await admitWrite({ req, res, commerce })) return null;
  return { memberId, commerce };
}

/** A host theme wraps escaped buyer content; minimal hosts still receive a complete HTML page. O(n) body bytes. */
async function buyerPage({ req, res, deps }: Pick<RequestContext, "req" | "res" | "deps">,
  { status, title, message, order }: { status: number; title: string; message: string; order?: { id: string; status: string } }): Promise<void> {
  const orderMarkup = order ? `<p>Order <span>${escapeHtml(order.id)}</span></p>` : "";
  const state = order ? ` data-order-status="${escapeHtml(order.status)}"` : "";
  const body = `<section class="wrap commerce-order"${state}><h1>${escapeHtml(title)}</h1><p role="status">${escapeHtml(message)}</p>${orderMarkup}<p><a class="button" href="/products">Back to shop</a></p></section>`;
  const html = deps.renderCommercePage ? await deps.renderCommercePage({ req, res, title, body })
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main>${body}</main></body></html>`;
  res.status(status).set("Cache-Control", "no-store").type("html").send(html);
}

async function reject(context: RequestContext, status: number, error: string, code: string): Promise<void> {
  if (context.page) { await buyerPage(context, { status, title: "Check your order", message: error }); return; }
  context.res.status(status).json({ error, code });
}

/** Only ready checkout accepts mutations, with the existing site origin policy. O(1). */
async function admitWrite({ req, res, commerce }: { req: Request; res: Response; commerce: CommerceHttpPort }): Promise<boolean> {
  if (!isSameOriginCommentPost({ request: req })) {
    res.status(403).json({ error: "Open this shop to complete your purchase.", code: "SAME_ORIGIN_REQUIRED" }); return false;
  }
  const origin = await commerce.checkoutOrigin();
  if (!origin) { unavailable(res); return false; }
  const requestOrigin = req.get("origin") ?? `${resolveProtocol(req)}://${req.get("host")}`;
  if (requestOrigin !== origin) {
    res.status(403).json({ error: "Open the deployed shop to complete your purchase. The desktop app manages the catalog.",
      code: "DEPLOYED_SHOP_REQUIRED", checkoutOrigin: origin }); return false;
  }
  const status = await commerce.activate();
  if (status.ready) return true;
  unavailable(res, status.reason ?? undefined);
  return false;
}

function unavailable(res: Response, reason = "Checkout is not enabled for this shop."): void {
  res.status(503).json({ error: reason, code: "COMMERCE_UNAVAILABLE" });
}

/** Allow only catalog choice and bounded quantity; prices/account/mode/identity are server-owned. O(k) keys. */
function orderInput(body: unknown): { priceId: string; quantity?: number } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (!Object.keys(value).every(key => key === "priceId" || key === "quantity") || !identifier(value.priceId)) return null;
  if (value.quantity === undefined) return { priceId: value.priceId };
  if (!validQuantity(value.quantity)) return null;
  return { priceId: value.priceId, quantity: value.quantity };
}

function validQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

function emptyObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** Known domain refusals are actionable; infrastructure failures never expose exception text. O(1). */
function failure({ res, error }: { res: Response; error: unknown }): void {
  if (error instanceof CommerceOrderNotFoundError || error instanceof CommercePriceNotFoundError || error instanceof CommerceProductNotFoundError) {
    res.status(404).json({ error: "This order or catalog item is unavailable for your account.", code: "COMMERCE_NOT_FOUND" }); return;
  }
  if (error instanceof CommerceCheckoutValidationError) {
    res.status(400).json({ error: error.message, code: "CHECKOUT_INVALID" }); return;
  }
  if (error instanceof Error && "code" in error && error.code === "COMMERCE_UNAVAILABLE") { unavailable(res, error.message); return; }
  res.status(503).json({ error: "The shop could not check your order. Retry this same order shortly; its payment status may still be updating.", code: "CHECKOUT_RETRY" });
}

/** Purchase/resume and read-only return routes. One limiter per mounted app, never per request.
 * @complexity O(1) setup and bounded point I/O per request; domain effects are delegated to Jini.
 */
export function registerCommerceRoutes({ app, deps }: { app: IRouter; deps: CommerceHttpDeps }, _optional = {}): void {
  const limiter = createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock: deps.clock });
  app.post(ORDERS, async (req, res) => {
    try {
      const input = orderInput(req.body);
      if (!input) { res.status(400).json({ error: "Choose a price and a whole quantity from 1 to 100.", code: "CHECKOUT_INVALID" }); return; }
      const admitted = await admit({ req, res, deps, limiter }); if (!admitted) return;
      res.status(201).json(await admitted.commerce.createOrder({ memberId: admitted.memberId, ...input }));
    } catch (error) { failure({ res, error }); }
  });
  app.post(`${ORDERS}/:orderId/pay`, async (req, res) => {
    try {
      if (!identifier(req.params.orderId) || !emptyObject(req.body)) {
        res.status(400).json({ error: "Pay an existing order with an empty request body.", code: "CHECKOUT_INVALID" }); return;
      }
      const admitted = await admit({ req, res, deps, limiter }); if (!admitted) return;
      const view = await admitted.commerce.pay({ memberId: admitted.memberId, orderId: req.params.orderId }) as CommerceOrderView;
      const buyerView = toCommerceBuyerOrder({ view });
      res.json({ ...buyerView, payment: buyerView.payment ? { ...buyerView.payment, next: view.payment?.next } : null,
        intent: view.intent ? { ok: view.intent.ok, ...("error" in view.intent ? { error: view.intent.error } : {}) } : null });
    } catch (error) { failure({ res, error }); }
  });
  const read = async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.orderId ?? req.query.orderId;
      if (!identifier(orderId)) { res.status(400).json({ error: "Open your saved order link to check its payment status.", code: "ORDER_ID_REQUIRED" }); return; }
      const admitted = await admit({ req, res, deps, limiter }); if (!admitted) return;
      res.json(toCommerceBuyerOrder({ view: await admitted.commerce.readOrder({ memberId: admitted.memberId, orderId }) as CommerceOrderView }));
    } catch (error) { failure({ res, error }); }
  };
  app.get(`${ORDERS}/:orderId`, read);
  const page = async (req: Request, res: Response): Promise<void> => {
    const context = { req, res, deps, limiter, page: true };
    try {
      const orderId = req.query.orderId;
      if (!identifier(orderId)) { await reject(context, 400, "Open your saved order link to check its payment status.", "ORDER_ID_REQUIRED"); return; }
      const admitted = await admit(context); if (!admitted) return;
      const view = toCommerceBuyerOrder({ view: await admitted.commerce.readOrder({ memberId: admitted.memberId, orderId }) as CommerceOrderView });
      await buyerPage(context, { status: 200, ...commerceBuyerStatus({ view }), order: view.order });
    } catch (error) {
      const missing = error instanceof CommerceOrderNotFoundError;
      await reject(context, missing ? 404 : 503, missing ? "This order is unavailable for your account." : "The shop could not check your order. Retry this same order shortly; its payment status may still be updating.", missing ? "COMMERCE_NOT_FOUND" : "CHECKOUT_RETRY");
    }
  };
  app.get("/commerce/return", page);
  app.get("/commerce/cancel", page);
}
