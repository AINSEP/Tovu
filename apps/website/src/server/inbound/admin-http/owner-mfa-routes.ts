import type { Express, Request, Response } from 'express';
import { IdentityValidationError, OwnerRequiredError } from '@jini-ai/user-management';
import { beginOwnerEnrollment, confirmOwnerEnrollment, removeOwnerFactor } from '@jini-ai/user-management/server';
import type { RouteDeps } from '../../routes/types.js';
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveSiteConsentOrigin } from '../public-http/middleware/site-consent.js';
import { ownerMfaDepsFrom } from './owner-mfa-deps.js';

type Admission = { app: Express; deps: RouteDeps; limiter: RateLimiter;
  authenticate: (req: Request) => Promise<{ principal: { id: string }; kind: string } | null> };
type Action = 'enroll' | 'confirm' | 'remove';

/** Only known domain refusals reach the browser; storage exceptions never disclose secrets.
 * @complexity O(1), one response, no request input logged.
 */
function failure(res: Response, error: unknown): void {
  const expected = error instanceof IdentityValidationError || error instanceof OwnerRequiredError;
  res.status(error instanceof OwnerRequiredError ? 403 : expected ? 400 : 503).json({
    error: expected ? error.message : 'Authenticator settings could not be saved. Try again, then copy the problem details if it continues.',
    code: expected ? 'MFA_REFUSED' : 'MFA_UNAVAILABLE', details: { operation: 'owner-authenticator' },
  });
}

/** Explicit owner action only; Jini owns password/factor proof and atomic state changes.
 * @complexity O(1) admission and bounded factor I/O, plus existing owner session revocation.
 */
async function handle({ req, res, action, admission }: { req: Request; res: Response; action: Action; admission: Admission }): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site' ||
      (req.get('origin') && req.get('origin') !== resolveSiteConsentOrigin({ request: req }))) {
      res.status(403).json({ error: 'Open this site’s security settings and submit the authenticator action there.', code: 'MFA_ORIGIN_REFUSED' });
      return;
    }
    const caller = await admission.authenticate(req);
    const ownerId = await admission.deps.ownerPrincipalId;
    if (caller?.kind !== 'session' || caller.principal.id !== ownerId) {
      throw new OwnerRequiredError({ message: 'Sign in as the site owner to change this authenticator.' });
    }
    const rate = await admission.limiter.check({ key: resolveClientIp(req) });
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ error: 'Too many authenticator attempts. Wait a minute and try again.', code: 'RATE_LIMIT_EXCEEDED' });
      return;
    }
    const deps = await ownerMfaDepsFrom(admission);
    const input = { workspaceId: admission.deps.workspaceId, principalId: ownerId,
      password: typeof req.body?.password === 'string' ? req.body.password : '',
      code: typeof req.body?.code === 'string' ? req.body.code : '' };
    if (action === 'enroll') {
      const user = await admission.deps.userRepo.findByPrincipalId(input);
      res.json(await beginOwnerEnrollment({ deps, input: { ...input, label: user?.username ?? 'Owner', issuer: 'Tovu' } }, {}));
      return;
    }
    if (action === 'confirm') await confirmOwnerEnrollment({ deps, input: { ...input,
      pendingToken: typeof req.body?.pendingToken === 'string' ? req.body.pendingToken : '' } }, {});
    else await removeOwnerFactor({ deps, input }, {});
    res.status(204).send();
  } catch (error) { failure(res, error); }
}

/** Routes precede the admin session gate; each management action admits its own owner session.
 * Status is explicit, not polled. No secret or pending proof is returned by status.
 * @complexity O(1) registration; status performs one indexed factor lookup on explicit load.
 */
export function registerOwnerMfaRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const action of ['enroll', 'confirm', 'remove'] as const) {
    admission.app.post(`/api/admin/v1/auth/mfa/${action}`, (req, res) => handle({ req, res, action, admission }));
  }
  admission.app.get('/api/admin/v1/auth/mfa', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const caller = await admission.authenticate(req);
      const isOwner = caller?.kind === 'session' && caller.principal.id === await admission.deps.ownerPrincipalId;
      const factor = isOwner ? await admission.deps.mfaStore?.factor({ workspaceId: admission.deps.workspaceId,
        principalId: caller.principal.id }) : null;
      res.json({ isOwner, available: isOwner && !!admission.deps.mfaStore, enrolled: !!factor });
    } catch (error) { failure(res, error); }
  });
}
