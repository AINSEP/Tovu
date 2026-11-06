import { sendAdminFailure } from './routes/system/site-share-errors.js';
import type { Express, Request, Response } from 'express';
import { IdentityValidationError, OwnerRequiredError } from '@jini-ai/user-management';
import { beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin, completeOwnerPasskeyLogin,
  removeOwnerPasskey, createSimpleWebAuthnPasskeys, type OwnerPasskeyDeps } from '@jini-ai/user-management/server';
import type { RouteDeps } from '../../routes/types.js';
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { ownerMfaDepsFrom } from './owner-mfa-deps.js';

type Admission = { app: Express; deps: RouteDeps; limiter: RateLimiter;
  authenticate: (req: Request) => Promise<{ principal: { id: string }; kind: string } | null>;
  signedIn: (req: Request, res: Response, result: Awaited<ReturnType<typeof completeOwnerPasskeyLogin>>) => Promise<void> };
type Action = 'enroll' | 'confirm' | 'begin-login' | 'login' | 'remove';

/** Trusted composition origin includes the public port; localhost uses the actual listener port.
 * Request Host, Origin and forwarding headers never select the RP or expected origin. O(1).
 */
export function ownerPasskeySite({ deps, localPort }: { deps: Pick<RouteDeps, 'passkeyOrigin' | 'derivedPublicOrigin'>; localPort?: number }, _options: Record<string, never> = {}) {
  const configured = deps.passkeyOrigin ?? deps.derivedPublicOrigin;
  if (!configured) throw new IdentityValidationError({ message: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.' });
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new IdentityValidationError({ message: 'Passkeys require HTTPS or localhost in a supported browser. Use your authenticator app or recovery code here.' });
  }
  if (!deps.passkeyOrigin && url.hostname === 'localhost' && localPort) url.port = String(localPort);
  return { origin: url.origin, rpId: url.hostname, name: 'Tovu' };
}

/** Compose Jini from the serving site's trusted scope and credential adapter; O(1), no poll. */
async function passkeyDeps(admission: Admission, req: Request): Promise<OwnerPasskeyDeps> {
  if (!admission.deps.passkeyStore) throw new IdentityValidationError({ message: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.' });
  return { mfa: await ownerMfaDepsFrom(admission), credentials: admission.deps.passkeyStore,
    webauthn: createSimpleWebAuthnPasskeys({}, {}), site: ownerPasskeySite({ deps: admission.deps, localPort: req.socket.localPort }) };
}

/** Admission failures reveal no credentials; protocol proofs are never logged. O(1). */
function failure(res: Response, error: unknown): void {
  const expected = error instanceof IdentityValidationError || error instanceof OwnerRequiredError;
  if (!expected) {
    sendAdminFailure({ res, error }, { operation: 'owner-passkey', code: 'PASSKEY_UNAVAILABLE',
      message: 'Passkey action could not finish.', failure: { step: 'owner-passkey',
        action: 'Try a new attempt, or use your authenticator app or recovery code to sign in. Copy the error ID if it continues.' } });
    return;
  }
  res.status(error instanceof OwnerRequiredError ? 403 : 400).json({
    error: error.message,
    code: 'PASSKEY_REFUSED', details: { operation: 'owner-passkey' },
  });
}

/** Authenticate management calls separately; login calls require the password-created pending proof. */
async function admit(admission: Admission, req: Request, action: Action, deps: OwnerPasskeyDeps) {
  if (action === 'begin-login' || action === 'login') return;
  const caller = await admission.authenticate(req);
  if (caller?.kind !== 'session' || caller.principal.id !== deps.mfa.seededOwnerPrincipalId) {
    throw new OwnerRequiredError({ message: 'Sign in as the site owner to manage passkeys.' });
  }
}

/** One single-send ceremony action; cap encoded registration/assertion input before verification.
 * @complexity O(b+n), b <= 16 KiB request bytes and n <= 5 credentials; no polling.
 */
async function handle(admission: Admission, req: Request, res: Response, action: Action): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const deps = await passkeyDeps(admission, req);
    if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site' || req.get('origin') !== deps.site.origin) {
      res.status(403).json({ error: 'Open this site in your browser and start the passkey action there.', code: 'PASSKEY_ORIGIN_REFUSED' }); return;
    }
    if (Buffer.byteLength(JSON.stringify(req.body)) > (action === 'confirm' ? 16384 : 8192)) {
      res.status(413).json({ error: 'This passkey response is too large. Try another passkey or your authenticator app.', code: 'PASSKEY_TOO_LARGE' }); return;
    }
    const rate = await admission.limiter.check({ key: resolveClientIp(req) });
    if (!rate.allowed) { res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ error: 'Too many passkey attempts. Wait a minute and try again.', code: 'RATE_LIMIT_EXCEEDED' }); return; }
    await admit(admission, req, action, deps);
    await execute(admission, req, res, action, deps);
  } catch (error) { failure(res, error); }
}

/** Transport-only dispatch; scope never comes from the request body. */
async function execute(admission: Admission, req: Request, res: Response, action: Action, deps: OwnerPasskeyDeps) {
  const value = (key: string) => typeof req.body?.[key] === 'string' ? req.body[key] as string : '';
  const input = { workspaceId: admission.deps.workspaceId, principalId: deps.mfa.seededOwnerPrincipalId,
    password: value('password'), code: value('code'), pendingToken: value('pendingToken'), response: req.body?.response, id: value('id') };
  switch (action) {
    case 'enroll': res.json(await beginOwnerPasskeyEnrollment({ deps, input })); return;
    case 'confirm': await confirmOwnerPasskeyEnrollment({ deps, input }); break;
    case 'begin-login': res.json(await beginOwnerPasskeyLogin({ deps, input })); return;
    case 'login': await admission.signedIn(req, res, await completeOwnerPasskeyLogin({ deps, input }, { sessionTtlMs: 30 * 24 * 60 * 60 * 1000 })); return;
    case 'remove': await removeOwnerPasskey({ deps, input }); break;
  }
  res.status(204).send();
}

/** Status reads only public credential identifiers for the signed-in owner, once per settings load. */
export function registerOwnerPasskeyRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const action of ['enroll', 'confirm', 'begin-login', 'login', 'remove'] as const) {
    admission.app.post(`/api/admin/v1/auth/passkeys/${action}`, (req, res) => handle(admission, req, res, action));
  }
  admission.app.get('/api/admin/v1/auth/passkeys', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const caller = await admission.authenticate(req);
      const isOwner = caller?.kind === 'session' && caller.principal.id === await admission.deps.ownerPrincipalId;
      if (!isOwner) { res.json({ isOwner: false, credentials: [] }); return; }
      const deps = await passkeyDeps(admission, req);
      const credentials = await deps.credentials.list({ workspaceId: admission.deps.workspaceId, principalId: deps.mfa.seededOwnerPrincipalId });
      res.json({ isOwner: true, credentials: credentials.map(c => ({ id: c.id })) });
    } catch (error) { failure(res, error); }
  });
}
