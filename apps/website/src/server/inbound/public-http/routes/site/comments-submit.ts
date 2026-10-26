import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { VisitorAnalyticsDeps } from "../../visitor-analytics.js";
import { urlencoded, type Express, type RequestHandler } from "express";
import type { CommentsProviderRegistry } from '@jini-ai/capability-providers/comments';
import type { CommentIngressPolicy } from "@jini-ai/cms/comments";
import { createCommentSubmitHandler } from "@jini-ai/cms/comments/express";
import { resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveProtocol, resolvePublicOrigin } from "../oauth/public-origin.js";

/**
 * @file ADR-031 §4 (SPEC-033) — the public, unauthenticated comment submission route. The ONLY
 * route a hostile visitor can reach into the Comments plugin; everything downstream of this file
 * is `CommentIngressPolicy` (rate-limit, honeypot, sanitize, spam-classify — see `Jini/packages/cms/src/comments/ingress.ts`).
 *
 * `authorIpHash` is computed HERE, at the HTTP boundary, from the raw request IP — the raw IP
 * itself is never passed into `ingressContext` or stored (mirrors `analytics/ingest.ts`'s
 * discard-raw-IP-at-the-boundary discipline).
 *
 * The salt is resolved once by the composition root (`resolveCommentsIpHashSalt`,
 * `features/comments/ip-hash-salt.ts`) and injected here. This route used to read
 * `COMMENTS_IP_SALT` itself and fall back to a public `"dev-only-insecure-salt"` constant —
 * see that resolver's header for why the fallback is now derived from the site key instead.
 */
export interface CommentsSubmitDeps extends VisitorAnalyticsDeps {
  ingressPolicy: CommentIngressPolicy;
  workspaceId: string;
  /** A separate HTTP budget; the ingress policy retains its own submission limiter. */
  rateLimiter: Pick<RateLimiter, "check">;
  /** The composition root's resolved IP-hash salt. A promise because the site-key derivation is
   *  async while route registration is not; requests wait for it (it settles during boot). */
  ipHashSalt: Promise<string>;
  providers?: CommentsProviderRegistry;
}

/** Only local paths can be used for the no-JS PRG response; never trust a Referer redirect. */
export function commentFormReturnTo({ value }: { value: unknown }, _options = {}): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const url = new URL(value, 'https://comments.invalid');
  return url.origin === 'https://comments.invalid' ? url.pathname + url.search : '/';
}

/** Dispatches a public submission to the site's ACTIVE stored provider. No provider, or an embedded
 * one (the vendor owns its own form), is the same generic refusal as any other ingress rejection.
 * @complexity O(1) plus the provider's ingress work. */
function providerIngress({ providers, siteId }: { providers: CommentsProviderRegistry; siteId: string }, _options = {}): CommentIngressPolicyLike {
  return { submit: async submission => {
    const { adapter } = await providers.active({ siteId });
    if (!adapter || adapter.kind !== 'stored') return { ok: false, reason: 'comments-disabled' };
    const result = await adapter.submission.submit({ siteId, entryId: submission.entryId, parentId: submission.parentId,
      authorName: submission.authorName, authorEmail: submission.authorEmail, authorUrl: submission.authorUrl, bodyRaw: submission.bodyRaw,
      authorIpHash: String(submission.ingressContext.authorIpHash), honeypotValue: String(submission.ingressContext.honeypotValue) });
    return result.ok ? { ok: true, comment: { id: result.id, status: result.status } } : result;
  } };
}
type CommentIngressPolicyLike = Parameters<typeof createCommentSubmitHandler>[0]['ingressPolicy'];

/** CSRF gate. A browser always sends `Origin` on a POST, so a cross-site page (including a no-JS form
 * on another origin, or an opaque `null` origin) is refused. A missing `Origin` is allowed ONLY for a
 * JSON body: a cross-site page cannot send `application/json` without a CORS preflight this route never
 * answers, so that request is a non-browser client, which no Origin check could stop anyway (the
 * honeypot, spam check and both rate limits are what bound those). The scheme honors
 * `X-Forwarded-Proto` like the OAuth callback origin does: an attacker cannot set that header on a
 * victim's browser request, and without it every HTTPS visitor behind a TLS-terminating proxy that
 * lacks a `trust proxy` hop count would be refused. A misconfigured TOVU_PUBLIC_URL throws (a 500), loudly.
 * @complexity O(1). */
export function isSameOriginCommentPost({ request }: { request: Parameters<RequestHandler>[0] }, _options = {}): boolean {
  const origin = request.get('origin');
  if (origin === undefined) return request.is('application/json') === 'application/json';
  // The configured public origin (TOVU_PUBLIC_URL) also counts, for proxies that rewrite Host.
  return origin === `${resolveProtocol(request)}://${request.get('host')}` || origin === resolvePublicOrigin(request);
}

/** Mounts Jini's handler with the site's ingress, request budget, salt and proxy policy.
 * @throws TypeError at registration when `deps.ipHashSalt` is missing; any other missing/invalid
 *   handler dependency (Jini's TypeError) surfaces as a 500 through `next(error)` on the first
 *   request, once the salt promise has settled.
 * @complexity O(1) route setup; request work belongs to the Jini handler.
 */
export function registerCommentsSubmitRoute(app: Express, deps: CommentsSubmitDeps): void {
  // Named refusal rather than "Cannot read properties of undefined (reading 'then')", which is
  // what a caller missing this dependency produced on 2026-10-08.
  if (typeof deps.ipHashSalt?.then !== "function") {
    throw new TypeError("registerCommentsSubmitRoute requires deps.ipHashSalt (a Promise<string> from resolveCommentsIpHashSalt at the composition root)");
  }
  const handler = deps.ipHashSalt.then((ipHashSalt) => createCommentSubmitHandler({
    ingressPolicy: { submit: async submission => {
      const owner = deps.providers ? providerIngress({ providers: deps.providers, siteId: deps.workspaceId }) : deps.ingressPolicy;
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
  handler.catch(() => undefined);
  const submit: RequestHandler = async (request, response, next) => {
    if (!isSameOriginCommentPost({ request })) {
      response.status(403).json({ error: 'A same-origin comment submission is required' });
      return;
    }
    let built: RequestHandler;
    try {
      built = await handler;
    } catch (error) {
      next(error);
      return;
    }
    return built(request, response, next);
  };
  app.post("/api/site/comments", urlencoded({ extended: false, limit: '32kb', parameterLimit: 16 }), submit);
}
