import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from 'express';
import { beginOwnerEnrollment, confirmOwnerEnrollment, removeOwnerFactor } from '@jini-ai/user-management/server';
import {
  ownerMfaConfirmRoute, ownerMfaEnrollRoute, ownerMfaRemoveRoute, ownerMfaStatusRoute, type OwnerMfaRouteDeps,
} from '@jini-ai/user-management/admin-http/owner/mfa-routes';
import type { RouteDeps } from '../../routes/types.js';
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { resolveSiteConsentOrigin } from '../public-http/middleware/site-consent.js';
import { ownerMfaDepsFrom } from '#src/server/runtime/composition/modules/owner-auth';
import { mountPublicRawRoute } from './admin-raw-route-ports.js';

type Admission = { errors: RouteErrorPorts; app: Express; deps: RouteDeps; limiter: RateLimiter;
  authenticate: ({ req }: { req: Request }, _optional?: Record<string, never>) => Promise<{ principal: { id: string }; kind: string } | null> };

const services = { beginOwnerEnrollment, confirmOwnerEnrollment, removeOwnerFactor };

/** Unexpected failures only (Jini answers known domain refusals itself): the redacted admin failure,
 * so storage exceptions never disclose secrets.
 * @complexity O(1), one response, no request input logged.
 */
function failure({ res, error, errors }: { res: Response; error: unknown; errors: RouteErrorPorts }): void {
  sendAdminFailure({ res, error, reporter: errors.reporter }, { operation: 'owner-authenticator', code: 'MFA_UNAVAILABLE',
    message: 'Authenticator action could not finish.', failure: { step: 'owner-authenticator',
      action: 'Try a new attempt, or use your authenticator app or recovery code to sign in. Copy the error ID if it continues.' } });
}

/** This request's ports over the host bag; every field is read at use (late-bound storage and owner).
 * @complexity O(1) binding; the ports run only when the spec calls them.
 */
function requestDepsFor({ req, admission }: { req: Request; admission: Admission }, _optional: Record<string, never> = {}): OwnerMfaRouteDeps {
  const { deps } = admission;
  return {
    get workspaceId() { return deps.workspaceId; },
    get ownerPrincipalId() { return deps.ownerPrincipalId; },
    get mfaStore() { return deps.mfaStore; },
    issuer: 'Tovu',
    authenticate: () => admission.authenticate({ req }),
    isJsonRequest: () => !!req.is('application/json'),
    siteOrigin: () => resolveSiteConsentOrigin({ request: req }),
    checkRateLimit: () => admission.limiter.check({ key: resolveClientIp(req) }),
    ownerMfaDeps: () => ownerMfaDepsFrom(admission),
    findUserByPrincipalId: (input) => deps.userRepo.findByPrincipalId(input),
    services,
  };
}

/** Routes precede the admin session gate; each management action admits its own owner session.
 * Status is explicit, not polled. No secret or pending proof is returned by status.
 * @complexity O(1) registration; status performs one indexed factor lookup on explicit load.
 */
export function registerOwnerMfaRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const spec of [ownerMfaEnrollRoute, ownerMfaConfirmRoute, ownerMfaRemoveRoute, ownerMfaStatusRoute]) {
    // The mounted bag is never read: `requestDeps` binds this request's ports before every gate.
    mountPublicRawRoute<OwnerMfaRouteDeps>({ errors: admission.errors, app: admission.app, spec, deps: requestDepsFor({ req: undefined as never, admission }), failure: ({ res, error }) => failure({ res, error, errors: admission.errors }) },
      { requestDeps: ({ req }) => requestDepsFor({ req, admission }) });
  }
}
