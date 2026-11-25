import type { Request } from "express";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { VisitorAnalyticsDeps } from "@jini-ai/analytics/site/contracts";
import { urlencoded, type Express, type RequestHandler } from "express";
import type { CommentsProviderRegistry } from '@jini-ai/core/contracts/site/comments-providers';
import type { CommentIngressPolicy } from "@jini-ai/cms/comments";
import { createCommentSubmitHandler } from "@jini-ai/cms/comments/express";
import { commentFormReturnTo, commentProviderIngress, isSameOriginCommentPost as isSameOriginPost } from "@jini-ai/cms/public-http/routes/site/comments-submit";
import { resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveProtocol, resolvePublicOrigin } from "../../../../../platform/express/public-origin.js";

/**
 * @file ADR-031 §4 (SPEC-033) — the public, unauthenticated comment submission route. The ONLY
 * route a hostile visitor can reach into the Comments plugin; everything downstream of this file
 * is `CommentIngressPolicy` (rate-limit, honeypot, sanitize, spam-classify — see `Jini/packages/cms/src/comments/ingress.ts`).
 *
 * `authorIpHash` is computed HERE, at the HTTP boundary, from the raw request IP — the raw IP
 * itself is never passed into `ingressContext` or stored (mirrors `Jini packages/analytics/src/ingest.ts`'s
 * discard-raw-IP-at-the-boundary discipline).
 *
 * The salt is resolved once by the composition root (`resolveCommentsIpHashSalt`,
 * `features/comments/ip-hash-salt.ts`) and injected here. This route used to read
 * `COMMENTS_IP_SALT` itself and fall back to a public `"dev-only-insecure-salt"` constant —
 * see that resolver's header for why the fallback is now derived from the site key instead.
 */
export interface CommentsSubmitDeps extends VisitorAnalyticsDeps<Request> {
  ingressPolicy: CommentIngressPolicy;
  workspaceId: string;
  /** A separate HTTP budget; the ingress policy retains its own submission limiter. */
  rateLimiter: Pick<RateLimiter, "check">;
  /** The composition root's resolved IP-hash salt. A promise because the site-key derivation is
   *  async while route registration is not; requests wait for it (it settles during boot). */
  ipHashSalt: Promise<string>;
  providers?: CommentsProviderRegistry;
}

/** CSRF gate bound to this host's origin and proxy policy: a configured TOVU_PUBLIC_URL also counts, for
 * proxies that rewrite Host, and the scheme honors `X-Forwarded-Proto` like the OAuth callback origin does.
 * Each read is a lazy callback so only the branch the decision consults runs (a misconfigured
 * TOVU_PUBLIC_URL still throws a 500, loudly). The admission rules live in `@jini-ai/cms`.
 * @complexity O(1). */
export function isSameOriginCommentPost({ request }: { request: Parameters<RequestHandler>[0] }, _optional = {}): boolean {
  return isSameOriginPost({
    origin: request.get('origin'),
    isJson: () => request.is('application/json') === 'application/json',
    servingOrigin: () => `${resolveProtocol(request)}://${request.get('host')}`,
    configuredOrigin: () => resolvePublicOrigin(request),
  });
}

/** Mounts Jini's handler with the site's ingress, request budget, salt and proxy policy.
 * @throws TypeError at registration when `deps.ipHashSalt` is missing; any other missing/invalid
 *   handler dependency (Jini's TypeError) surfaces as a 500 through `next(error)` on the first
 *   request, once the salt promise has settled.
 * @complexity O(1) route setup; request work belongs to the Jini handler.
 */
export function registerCommentsSubmitRoute({ app, deps }: { app: Express; deps: CommentsSubmitDeps }, _optional: Record<string, never> = {}): void {
  // Named refusal rather than "Cannot read properties of undefined (reading 'then')", which is
  // what a caller missing this dependency produced on 2026-10-08.
  if (typeof deps.ipHashSalt?.then !== "function") {
    throw new TypeError("registerCommentsSubmitRoute requires deps.ipHashSalt (a Promise<string> from resolveCommentsIpHashSalt at the composition root)");
  }
  const handler = deps.ipHashSalt.then((ipHashSalt) => createCommentSubmitHandler({
    ingressPolicy: { submit: async submission => {
      const owner = deps.providers ? commentProviderIngress({ providers: deps.providers, siteId: deps.workspaceId }) : deps.ingressPolicy;
      return owner.submit(submission);
    } },
    workspaceId: deps.workspaceId,
    ipHashSalt,
    rateLimiter: deps.rateLimiter,
    clientIp: ({ request }) => resolveClientIp(request),
  }, { onAccepted: ({ request, submission, comment }) => captureVisitorEvent({ deps, request, name: "comment_submitted", properties: {
    entryId: submission.entryId, moderationState: ["pending", "approved", "spam"].includes(comment.status) ? comment.status : "other",
  } }), formRedirect: ({ request }) => request.is('application/x-www-form-urlencoded')
    ? commentFormReturnTo({ value: request.body?.returnTo }) : undefined }));
  // Observed here so a construction failure is not an unhandled rejection at boot; each request
  // below re-awaits the same promise and hands that failure to Express's error path instead.
  handler.catch((error: unknown) => {
    console.error("[comments] Could not prepare the comment submission handler:",
      describeErrorForLog({ err: error }));
  });
  const submit: RequestHandler = async (request, response, next) => {
    if (!isSameOriginCommentPost({ request })) {
      response.status(403).json({ error: 'A same-origin comment submission is required' });
      return undefined;
    }
    let built: RequestHandler;
    try {
      built = await handler;
    } catch (error) {
      next(error);
      return undefined;
    }
    return built(request, response, next);
  };
  app.post("/api/site/comments", urlencoded({ extended: false, limit: '32kb', parameterLimit: 16 }), submit);
}
