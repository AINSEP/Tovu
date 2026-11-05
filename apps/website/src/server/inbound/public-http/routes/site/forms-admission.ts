import type { RequestHandler } from 'express';
import type { Clock } from '@jini-ai/core/primitives';
import { admitFormRequest } from '@jini-ai/cms/forms';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';

/** Host policy: 5 attempts/minute/source across forms and 30 multipart requests/minute/site, before parsing up to
 * 12 MiB. This bounds admitted multipart input to 360 MiB/minute/process even with rotating IPs.
 * @returns Middleware with isolated injected-clock counters; parsing runs only after admission.
 * @complexity O(1) counters per request, bounded by the site budget; no added database I/O. */
export function createFormsAdmissionMiddleware({ workspaceId, clock }: { workspaceId: string; clock: Clock }, _optional = {}): RequestHandler {
  const site = createRateLimiter({ profile: { windowSeconds: 60, max: 30, burst: 0 }, clock });
  const source = createRateLimiter({ profile: { windowSeconds: 60, max: 5, burst: 0 }, clock });
  return async (request, response, next) => {
    try {
      const result = await admitFormRequest({ workspaceId, sourceIp: resolveClientIp(request), site, source }, { multipart: /^\s*multipart\/form-data\s*(?:;|$)/i.test(request.headers['content-type'] ?? '') });
      if (result.allowed) { next(); return; }
      response.set('Retry-After', String(result.retryAfterSeconds)).status(429).json({ code: 'FORMS_RATE_LIMIT_EXCEEDED', error: `Too many form requests. Wait ${result.retryAfterSeconds} seconds, then send the form again.` });
    } catch (error) { next(error); }
  };
}
