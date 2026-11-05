/** Member HTTP boundary only: identity and scope come from the host; Jini owns orders and money. */
import type { Express, Request, Response } from "express";
import { CommerceCheckoutValidationError, CommerceOrderNotFoundError, CommercePriceNotFoundError,
  CommerceProductNotFoundError } from "@jini-ai/commerce";
import { resolveMemberSession } from "#src/features/members/access-resolver";
import { MemberLoginError } from "#src/features/member-login/index";
import { createRateLimiter, OUTBOUND_CALL_PER_IP, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { RouteDeps } from "#src/server/routes/types";
import { uniqueMemberCookie } from "../members/oidc-deps.js";
import { isSameOriginCommentPost } from "../site/comments-submit.js";

/** Narrow structural port; no credential, provider or ledger mutation capability crosses HTTP. */
export interface CommerceHttpPort {
  status(): Promise<{ active: boolean; ready: boolean; reason: string | null }>;
  createOrder(input: { memberId: string; priceId: string; quantity?: number }): Promise<unknown>;
  pay(input: { memberId: string; orderId: string }): Promise<unknown>;
  readOrder(input: { memberId: string; orderId: string }): Promise<unknown>;
}
export type CommerceHttpDeps = Pick<RouteDeps, "workspaceId" | "clock" | "memberRepo" | "memberSessionRepo"> & {
  commerce?: CommerceHttpPort;
};

const ORDERS = "/api/commerce/v1/workspaces/:workspaceId/orders";
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
type RequestContext = { req: Request; res: Response; deps: CommerceHttpDeps; limiter: RateLimiter };

/** Resolve only the member cookie, including revocation; operator cookies cannot purchase. O(1) reads. */
async function buyer({ req, deps }: Pick<RequestContext, "req" | "deps">): Promise<string | null> {
  let sessionToken: string | undefined;
  try { sessionToken = uniqueMemberCookie({ req, name: "tovu_member_session" }); }
  catch (error) { if (error instanceof MemberLoginError) return null; throw error; }
  const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
    sessionToken, nowIso: deps.clock.nowIso() });
  if (!session) return null;
  const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: session.memberId });
  if (!member || member.status !== "active") return null;
  if (member.credentialsRevokedAt && session.createdAt < member.credentialsRevokedAt) return null;
  return member.id;
}

/** Deny before effects on foreign scope, off/unavailable commerce, failed auth or rate budget. O(1) I/O. */
async function admit(context: RequestContext): Promise<{ memberId: string; commerce: CommerceHttpPort } | null> {
  const { req, res, deps, limiter } = context;
  res.set("Cache-Control", "no-store");
  if (req.params.workspaceId && req.params.workspaceId !== deps.workspaceId) {
    res.status(404).json({ error: "This shop was not found.", code: "SHOP_NOT_FOUND" }); return null;
  }
  const commerce = deps.commerce;
  if (!commerce) { unavailable(res); return null; }
  const status = await commerce.status();
  if (!status.ready && req.method === "POST") { unavailable(res, status.reason ?? undefined); return null; }
  if (req.method === "POST" && !isSameOriginCommentPost({ request: req })) {
    res.status(403).json({ error: "Open this shop to complete your purchase.", code: "SAME_ORIGIN_REQUIRED" }); return null;
  }
  const limit = await limiter.check({ key: resolveClientIp(req) });
  if (!limit.allowed) {
    res.set("Retry-After", String(limit.retryAfterSeconds)).status(429).json({ error: "Too many checkout requests. Please wait a minute and try again.", code: "RATE_LIMIT_EXCEEDED" }); return null;
  }
  const memberId = await buyer(context);
  if (!memberId) { res.status(401).json({ error: "Sign in as a shop member to view or pay for your order.", code: "MEMBER_SIGN_IN_REQUIRED" }); return null; }
  return { memberId, commerce };
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
  if (typeof value.quantity !== "number" || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 100) return null;
  return { priceId: value.priceId, quantity: value.quantity };
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
export function registerCommerceRoutes({ app, deps }: { app: Express; deps: CommerceHttpDeps }, _optional = {}): void {
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
      if (!identifier(req.params.orderId) || !req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length !== 0) {
        res.status(400).json({ error: "Pay an existing order with an empty request body.", code: "CHECKOUT_INVALID" }); return;
      }
      const admitted = await admit({ req, res, deps, limiter }); if (!admitted) return;
      res.json(await admitted.commerce.pay({ memberId: admitted.memberId, orderId: req.params.orderId }));
    } catch (error) { failure({ res, error }); }
  });
  const read = async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.orderId ?? req.query.orderId;
      if (!identifier(orderId)) { res.status(400).json({ error: "Open your saved order link to check its payment status.", code: "ORDER_ID_REQUIRED" }); return; }
      const admitted = await admit({ req, res, deps, limiter }); if (!admitted) return;
      res.json(await admitted.commerce.readOrder({ memberId: admitted.memberId, orderId }));
    } catch (error) { failure({ res, error }); }
  };
  app.get(`${ORDERS}/:orderId`, read);
  app.get("/commerce/return", read);
  app.get("/commerce/cancel", read);
}
