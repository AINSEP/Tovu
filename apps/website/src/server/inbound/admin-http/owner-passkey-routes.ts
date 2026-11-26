import { bindOwnerPasskeyRoutes } from '@jini-ai/user-management/admin-http/owner/passkey-routes';
import { resolveOwnerPasskeyRouteDeps, answerOwnerPasskeyFailure } from '@jini-ai/user-management/admin-http/owner/passkey-route-deps';
import { failureReporterOf, sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from 'express';
import { beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin, completeOwnerPasskeyLogin,
  removeOwnerPasskey, createSimpleWebAuthnPasskeys } from '@jini-ai/user-management/server';
import type { RouteDeps } from '../../routes/types.js';
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { ownerMfaDepsFrom } from '#src/server/runtime/composition/modules/owner-auth';

type Admission = { app: Express; deps: RouteDeps; limiter: RateLimiter;
  authenticate: ({ req }: { req: Request }, _optional?: Record<string, never>) => Promise<{ principal: { id: string }; kind: string } | null>;
  signedIn: (req: Request, res: Response, result: Awaited<ReturnType<typeof completeOwnerPasskeyLogin>>) => Promise<void> };
export const registerOwnerPasskeyRoutes = bindOwnerPasskeyRoutes<Request, Response, Admission>({
  resolveOwnerPasskeyRouteDeps, answerOwnerPasskeyFailure,
  root: '/api/admin/v1/auth/passkeys',
  mount: ({ host, method, path, handle }) => { host.app[method](path, handle); },
  workspaceId: ({ host }) => host.deps.workspaceId,
  store: ({ host }) => host.deps.passkeyStore,
  mfa: ({ host }) => ownerMfaDepsFrom(host),
  webauthn: () => createSimpleWebAuthnPasskeys({}, {}),
  site: ({ host, req }) => ({ deps: host.deps, localPort: req.socket.localPort, name: 'Tovu', copy: {
    unavailable: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.',
    insecure: 'Passkeys require HTTPS or localhost in a supported browser. Use your authenticator app or recovery code here.',
  } }),
  unavailableMessage: 'Passkeys are unavailable in this host. Use your authenticator app or recovery code.',
  authenticate: ({ host, req }) => host.authenticate({ req }),
  ownerPrincipalId: ({ host }) => host.deps.ownerPrincipalId,
  isJson: ({ req }) => Boolean(req.is('application/json')),
  header: ({ req, name }) => req.get(name),
  body: ({ req }) => req.body,
  byteCount: ({ req }) => Buffer.byteLength(JSON.stringify(req.body)),
  rate: ({ host, req }) => host.limiter.check({ key: resolveClientIp(req) }),
  noStore: ({ res }) => { res.setHeader('Cache-Control', 'no-store'); },
  retryAfter: ({ res, value }) => { res.setHeader('Retry-After', value); },
  json: ({ res, value, status }) => { if (status !== undefined) res.status(status); res.json(value); },
  empty: ({ res }) => { res.status(204).send(); },
  incident: ({ res, error, options }) => { sendAdminFailure({ res, error, reporter: failureReporterOf({ res }) }, options); },
  signedIn: ({ host, req, res, result }) => host.signedIn(req, res, result),
  services: { beginOwnerPasskeyEnrollment, confirmOwnerPasskeyEnrollment, beginOwnerPasskeyLogin,
    completeOwnerPasskeyLogin: required => completeOwnerPasskeyLogin(required, { sessionTtlMs: 30 * 24 * 60 * 60 * 1000 }), removeOwnerPasskey },
  copy: {
    ownerRequired: 'Sign in as the site owner to manage passkeys.',
    origin: 'Open this site in your browser and start the passkey action there.',
    tooLarge: 'This passkey response is too large. Try another passkey or your authenticator app.',
    rate: 'Too many passkey attempts. Wait a minute and try again.',
  },
  operation: 'owner-passkey',
  incidentOptions: { operation: 'owner-passkey', code: 'PASSKEY_UNAVAILABLE',
    message: 'Passkey action could not finish.', failure: { step: 'owner-passkey',
      action: 'Try a new attempt, or use your authenticator app or recovery code to sign in. Copy the error ID if it continues.' } },
});
