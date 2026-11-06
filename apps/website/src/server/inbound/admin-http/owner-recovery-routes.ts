import { ownerMfaDepsFrom } from './owner-mfa-deps.js';
import { isLocalAdminRequest } from './local-admin-request.js';
import { resolveSiteConsentOrigin } from '../public-http/middleware/site-consent.js';
import type { Express, Request, Response } from 'express';
import { IdentityValidationError, OwnerRequiredError } from '@jini-ai/user-management';
import { issueRecoveryCodes, recoverOwner, resetOwnerPassword, type OwnerRecoveryDeps } from '@jini-ai/user-management/server';
import type { RouteDeps } from '../../routes/types.js';
import { identityServiceDepsFrom } from './routes/users/deps.js';
import { resolveClientIp, type RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';

type Admission = {
  app: Express;
  deps: RouteDeps;
  authenticate: (req: Request) => Promise<{ id: string } | null>;
  limiter: RateLimiter;
  desktopOwnerReset: boolean;
  acceptsDesktopCapability?: (input: { capability: string | undefined }) => boolean;
};
type Action = 'issue' | 'recover' | 'reset';

/** Reject cross-site submissions and require a JSON body before touching secrets.
 * @complexity O(1), bounded request headers; no I/O.
 */
function acceptsRecoveryRequest(req: Request): boolean {
  if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.get('origin');
  return !origin || origin === resolveSiteConsentOrigin({ request: req });
}

/** Map only known safe validation messages; raw exception details may contain SQL or credentials.
 * @complexity O(1), one response; never logs request input.
 */
function recoveryFailure({ res, error, action }: { res: Response; error: unknown; action: Action }): void {
  const expected = error instanceof IdentityValidationError || error instanceof OwnerRequiredError;
  res.status(error instanceof OwnerRequiredError ? 403 : expected ? 400 : 503).json({
    error: expected ? error.message : 'Owner recovery could not be saved. Retry once, then ask the host operator to check the identity database.',
    code: expected ? 'RECOVERY_REFUSED' : 'RECOVERY_UNAVAILABLE',
    details: { operation: `owner-recovery-${action}` },
  });
}

/** Bind server-selected scope to Jini; callers cannot choose another principal or workspace.
 * @complexity O(1) composition, waiting for existing identity bootstrap only.
 */
async function recoveryDeps({ deps }: Pick<Admission, 'deps'>): Promise<OwnerRecoveryDeps> {
  await deps.identityReady;
  if (!deps.recoveryCodes) throw new Error('Durable recovery storage is not configured');
  return { ...(deps.mfaStore ? { mfa: await ownerMfaDepsFrom({ deps }) } : {}), auth: identityServiceDepsFrom(deps), codes: deps.recoveryCodes, seededOwnerPrincipalId: await deps.ownerPrincipalId };
}

/** Reset requires this request's private launch proof as well as local transport and owner session.
 * No cookie alone proves possession of the launcher's capability. An enrolled owner can recover
 * with that private proof without first obtaining the MFA-gated normal session.
 * @complexity O(h) in request header names; no I/O.
 */
function acceptsDesktopReset({ req, admission }: { req: Request; admission: Admission }): boolean {
  return admission.desktopOwnerReset && isLocalAdminRequest({ req }) &&
    admission.acceptsDesktopCapability?.({ capability: req.get('x-tovu-desktop-owner-signin') }) === true;
}

/** Require an existing owner session for kit issuance and the desktop reset transition.
 * The launch-proof exchange remains the existing local-boot-session route, preserving staff sessions.
 * @complexity O(1), one session admission plus already-resolved owner identity.
 */
async function admitOwner({ req, action, admission, ownerId }: { req: Request; action: Action; admission: Admission; ownerId: string }): Promise<void> {
  if (action === 'recover' || (action === 'reset' && acceptsDesktopReset({ req, admission }))) return;
  const caller = await admission.authenticate(req);
  if (!caller || caller.id !== ownerId || (action === 'reset' && !acceptsDesktopReset({ req, admission }))) {
    throw new OwnerRequiredError({ message: 'Sign in as the site owner to use this recovery action. On desktop, reopen the site to restore your owner session.' });
  }
}

/** One explicit mutation per request; shares LOGIN_STRICT with password login to bound guessing.
 * @complexity O(s) for reset's existing session revocation, otherwise ten fixed hash rows.
 */
async function handleRecovery({ req, res, action, admission }: { req: Request; res: Response; action: Action; admission: Admission }): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!acceptsRecoveryRequest(req)) {
      res.status(403).json({ error: 'Recovery requires a same-origin JSON request. Open the site sign-in page and try again.', details: { operation: 'owner-recovery-origin' } });
      return;
    }
    const rate = await admission.limiter.check({ key: resolveClientIp(req) });
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ error: 'Too many recovery attempts. Wait a minute and try again.', details: { operation: 'owner-recovery-limit' } });
      return;
    }
    const deps = await recoveryDeps(admission);
    await admitOwner({ req, action, admission, ownerId: deps.seededOwnerPrincipalId });
    const field = (key: 'password' | 'code') => typeof req.body?.[key] === 'string' ? req.body[key] as string : '';
    const input = { workspaceId: admission.deps.workspaceId, principalId: deps.seededOwnerPrincipalId,
      password: field('password'), code: field('code') };
    if (action === 'issue') {
      res.json(await issueRecoveryCodes({ deps, input }, {}));
      return;
    }
    if (action === 'recover') await recoverOwner({ deps, input }, {});
    else await resetOwnerPassword({ deps, input }, {});
    res.status(204).send();
  } catch (error) { recoveryFailure({ res, error, action }); }
}

/** Register before the admin session gate so a code can recover a locked-out owner.
 * @complexity O(1) registration. Status reads no kit: only one authenticated owner comparison.
 */
export function registerOwnerRecoveryRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const [path, action] of [['recovery-codes', 'issue'], ['recover-owner', 'recover'], ['reset-owner', 'reset']] as const) {
    admission.app.post(`/api/admin/v1/auth/${path}`, (req, res) => handleRecovery({ req, res, action, admission }));
  }
  admission.app.get('/api/admin/v1/auth/owner-recovery', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const caller = await admission.authenticate(req);
      const isOwner = !!caller && caller.id === await admission.deps.ownerPrincipalId;
      res.json({ isOwner, available: isOwner && !!admission.deps.recoveryCodes, desktopOwnerReset: isOwner && admission.desktopOwnerReset });
    } catch (error) { recoveryFailure({ res, error, action: 'issue' }); }
  });
}
