import type { Express } from "express";
import type { CommentIngressPolicy } from "@jini-ai/cms/comments";
import { createCommentSubmitHandler } from "@jini-ai/cms/comments/express";
import { resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

/**
 * @file ADR-031 §4 (SPEC-033) — the public, unauthenticated comment submission route. The ONLY
 * route a hostile visitor can reach into the Comments plugin; everything downstream of this file
 * is `CommentIngressPolicy` (rate-limit, honeypot, sanitize, spam-classify — see `Jini/packages/cms/src/comments/ingress.ts`).
 *
 * `authorIpHash` is computed HERE, at the HTTP boundary, from the raw request IP — the raw IP
 * itself is never passed into `ingressContext` or stored (mirrors `analytics/ingest.ts`'s
 * discard-raw-IP-at-the-boundary discipline). `ANALYTICS_ROOT_KEY_SEED`-style dev-only-insecure
 * fallback salt, same disclosed pattern as `registerAnalyticsIngestRoute`'s wiring.
 */
export interface CommentsSubmitDeps {
  ingressPolicy: CommentIngressPolicy;
  workspaceId: string;
  /** A separate HTTP budget; the ingress policy retains its own submission limiter. */
  rateLimiter: Pick<RateLimiter, "check">;
}

/** Mounts Jini's handler with the site's ingress, request budget, salt and proxy policy.
 * @throws TypeError if a required handler dependency is missing.
 * @complexity O(1) route setup; request work belongs to the Jini handler.
 */
export function registerCommentsSubmitRoute(app: Express, deps: CommentsSubmitDeps): void {
  const ipHashSalt = process.env.COMMENTS_IP_SALT ?? "dev-only-insecure-salt";
  app.post("/api/site/comments", createCommentSubmitHandler({
    ingressPolicy: deps.ingressPolicy,
    workspaceId: deps.workspaceId,
    ipHashSalt,
    rateLimiter: deps.rateLimiter,
    clientIp: ({ request }) => resolveClientIp(request),
  }, {}));
}
