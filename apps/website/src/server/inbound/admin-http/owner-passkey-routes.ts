import { ownerPasskeySite, ownerPasskeyActionRoute, ownerPasskeyStatusRoute } from '@jini-ai/user-management/admin-http/owner/passkey-routes';
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from 'express';
import { IdentityValidationError, OwnerRequiredError } from '@jini-ai/user-management';
import { beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin, completeOwnerPasskeyLogin,
  removeOwnerPasskey, createSimpleWebAuthnPasskeys, type OwnerPasskeyDeps } from '@jini-ai/user-management/server';
import type { RouteDeps } from '../../routes/types.js';
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { ownerMfaDepsFrom } from '#src/server/runtime/composition/modules/owner-auth';

type Admission = { app: Express; deps: RouteDeps; limiter: RateLimiter;
  authenticate: ({ req }: { req: Request }, _optional?: Record<string, never>) => Promise<{ principal: { id: string }; kind: string } | null>;
  signedIn: (req: Request, res: Response, result: Awaited<ReturnType<typeof completeOwnerPasskeyLogin>>) => Promise<void> };
type Action = 'enroll' | 'confirm' | 'begin-login' | 'login' | 'remove';

/** Compose Jini from the serving site's trusted scope and credential adapter; O(1), no poll. */
async function passkeyDeps(admission: Admission, req: Request): Promise<OwnerPasskeyDeps> {
  if (!admission.deps.passkeyStore) throw new IdentityValidationError({ message: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.' });
  return { mfa: await ownerMfaDepsFrom(admission), credentials: admission.deps.passkeyStore,
    webauthn: createSimpleWebAuthnPasskeys({}, {}), site: ownerPasskeySite({ deps: admission.deps, localPort: req.socket.localPort, name: 'Tovu', copy: {
      unavailable: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.',
      insecure: 'Passkeys require HTTPS or localhost in a supported browser. Use your authenticator app or recovery code here.',
    } }) };
}

/** Admission failures reveal no credentials; protocol proofs are never logged. O(1). */
function failure({ res, error }: { res: Response; error: unknown }, _optional = {}): void {
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

async function handle(admission: Admission, req: Request, res: Response, action: Action): Promise<void> {
  return ownerPasskeyActionRoute({ action, admission: {
    workspaceId: admission.deps.workspaceId,
    passkeyDeps: () => passkeyDeps(admission, req),
    authenticate: () => admission.authenticate({ req }),
    ownerPrincipalId: () => admission.deps.ownerPrincipalId,
    isJson: () => Boolean(req.is('application/json')),
    fetchSite: () => req.get('sec-fetch-site'),
    origin: () => req.get('origin'),
    body: () => req.body,
    byteCount: () => Buffer.byteLength(JSON.stringify(req.body)),
    rate: () => admission.limiter.check({ key: resolveClientIp(req) }),
    noStore: () => { res.setHeader('Cache-Control', 'no-store'); },
    retryAfter: value => { res.setHeader('Retry-After', value); },
    json: (value, status) => { if (status !== undefined) res.status(status); res.json(value); },
    empty: () => { res.status(204).send(); },
    failure: error => failure({ res, error }),
    signedIn: result => admission.signedIn(req, res, result),
    services: { beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin,
      completeOwnerPasskeyLogin: required => completeOwnerPasskeyLogin(required, { sessionTtlMs: 30 * 24 * 60 * 60 * 1000 }), removeOwnerPasskey },
    copy: {
      ownerRequired: 'Sign in as the site owner to manage passkeys.',
      origin: 'Open this site in your browser and start the passkey action there.',
      tooLarge: 'This passkey response is too large. Try another passkey or your authenticator app.',
      rate: 'Too many passkey attempts. Wait a minute and try again.',
    },
  } });
}

/** Status reads only public credential identifiers for the signed-in owner, once per settings load. */
export function registerOwnerPasskeyRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const action of ['enroll', 'confirm', 'begin-login', 'login', 'remove'] as const) {
    admission.app.post(`/api/admin/v1/auth/passkeys/${action}`, (req, res) => handle(admission, req, res, action));
  }
  admission.app.get('/api/admin/v1/auth/passkeys', async (req, res) => {
    await ownerPasskeyStatusRoute({ admission: {
      workspaceId: admission.deps.workspaceId,
      noStore: () => { res.setHeader('Cache-Control', 'no-store'); },
      authenticate: () => admission.authenticate({ req }),
      ownerPrincipalId: () => admission.deps.ownerPrincipalId,
      passkeyDeps: () => passkeyDeps(admission, req),
      json: value => { res.json(value); },
      failure: error => failure({ res, error }),
    } });
  });
}
