import { urlencoded, type Express, type RequestHandler } from "express";
import type { CommentsProviderRegistry } from '@jini-ai/capability-providers/comments';
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
 * discard-raw-IP-at-the-boundary discipline).
 *
 * The salt is resolved once by the composition root (`resolveCommentsIpHashSalt`,
 * `features/comments/ip-hash-salt.ts`) and injected here. This route used to read
 * `COMMENTS_IP_SALT` itself and fall back to a public `"dev-only-insecure-salt"` constant —
 * see that resolver's header for why the fallback is now derived from the site key instead.
 */
export interface CommentsSubmitDeps {
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
    ingressPolicy: deps.providers ? { submit: async submission => {
      const { adapter } = await deps.providers!.active({ siteId: deps.workspaceId });
      if (!adapter || adapter.kind !== 'stored') return { ok: false, reason: 'comments-disabled' };
      const result = await adapter.submission.submit({ siteId: deps.workspaceId, entryId: submission.entryId, parentId: submission.parentId,
        authorName: submission.authorName, authorEmail: submission.authorEmail, authorUrl: submission.authorUrl, bodyRaw: submission.bodyRaw,
        authorIpHash: String(submission.ingressContext.authorIpHash), honeypotValue: String(submission.ingressContext.honeypotValue) });
      return result.ok ? { ok: true, comment: { id: result.id, status: result.status } } : result;
    } } : deps.ingressPolicy,
    workspaceId: deps.workspaceId,
    ipHashSalt,
    rateLimiter: deps.rateLimiter,
    clientIp: ({ request }) => resolveClientIp(request),
  }, { formRedirect: ({ request }) => request.is('application/x-www-form-urlencoded')
    ? commentFormReturnTo({ value: request.body?.returnTo }) : undefined }));
  // Observed here so a construction failure is not an unhandled rejection at boot; each request
  // below re-awaits the same promise and hands that failure to Express's error path instead.
  handler.catch(() => undefined);
  const submit: RequestHandler = async (request, response, next) => {
    // Host and protocol come from Express's configured trust-proxy policy, never raw forwarded headers.
    if (request.get('origin') !== `${request.protocol}://${request.get('host')}`) {
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
