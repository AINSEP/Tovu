import { ownerMfaDepsFrom } from '#src/server/runtime/composition/modules/owner-auth';
import { sendAdminFailure } from '#src/server/inbound/shared/admin-failure';
import { isLocalAdminRequest } from './local-admin-request.js';
import { resolveSiteConsentOrigin } from '../public-http/middleware/site-consent.js';
import type { Express, Request, Response } from 'express';
import { issueRecoveryCodes, recoverOwner, resetOwnerPassword, type OwnerRecoveryDeps } from '@jini-ai/user-management/server';
import { createOwnerRecoveryRoutes, type OwnerRecoveryRouteDeps } from '@jini-ai/user-management/admin-http/owner/recovery-routes';
import type { RouteDeps } from '../../routes/types.js';
import { identityServiceDepsFrom } from './routes/users/deps.js';
import { resolveClientIp, type RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import { mountPublicRawRoute } from './admin-raw-route-ports.js';

type Admission = {
  app: Express;
  deps: RouteDeps;
  authenticate: ({ req }: { req: Request }, _optional?: Record<string, never>) => Promise<{ id: string } | null>;
  limiter: RateLimiter;
  desktopOwnerReset: boolean;
  acceptsDesktopCapability?: (input: { capability: string | undefined }) => boolean;
};

const services = { issueRecoveryCodes, recoverOwner, resetOwnerPassword };
/** The desktop launcher's private launch-proof header (a host literal; Jini only reads it). */
const routes = createOwnerRecoveryRoutes({ desktopCapabilityHeader: 'x-tovu-desktop-owner-signin' });

/** Bind server-selected scope to Jini; callers cannot choose another principal or workspace.
 * @complexity O(1) composition, waiting for existing identity bootstrap only.
 */
async function recoveryDeps({ deps }: Pick<Admission, 'deps'>): Promise<OwnerRecoveryDeps> {
  await deps.identityReady;
  if (!deps.recoveryCodes) throw new Error('Durable recovery storage is not configured');
  return { ...(deps.mfaStore ? { mfa: await ownerMfaDepsFrom({ deps }) } : {}), auth: identityServiceDepsFrom(deps), codes: deps.recoveryCodes, seededOwnerPrincipalId: await deps.ownerPrincipalId };
}

/** Jini answers every failure inside the spec (its redacted 503); this writer only covers a failure
 * outside it, with the redacted admin failure so storage exceptions never disclose secrets.
 * @complexity O(1), one response, no request input logged.
 */
function failure({ res, error }: { res: Response; error: unknown }): void {
  sendAdminFailure({ res, error }, { operation: 'owner-recovery', code: 'RECOVERY_UNAVAILABLE',
    message: 'Owner recovery could not be saved.', failure: { step: 'owner-recovery',
      action: 'Retry once, then ask the host operator to check the identity database.' } });
}

/** This request's ports over the host bag; every field is read at use (late-bound storage and owner).
 * @complexity O(1) binding; the ports run only when the spec calls them.
 */
function requestDepsFor({ req, admission }: { req: Request; admission: Admission }, _optional: Record<string, never> = {}): OwnerRecoveryRouteDeps {
  const { deps } = admission;
  return {
    get workspaceId() { return deps.workspaceId; },
    get ownerPrincipalId() { return deps.ownerPrincipalId; },
    get recoveryAvailable() { return !!deps.recoveryCodes; },
    desktopOwnerReset: admission.desktopOwnerReset,
    authenticate: () => admission.authenticate({ req }),
    isJsonRequest: () => !!req.is('application/json'),
    siteOrigin: () => resolveSiteConsentOrigin({ request: req }),
    checkRateLimit: () => admission.limiter.check({ key: resolveClientIp(req) }),
    isLocalRequest: () => isLocalAdminRequest({ req }),
    ...(admission.acceptsDesktopCapability ? { acceptsDesktopCapability: admission.acceptsDesktopCapability } : {}),
    recoveryDeps: () => recoveryDeps(admission),
    services,
  };
}

/** Register before the admin session gate so a code can recover a locked-out owner.
 * @complexity O(1) registration. Status reads no kit: only one authenticated owner comparison.
 */
export function registerOwnerRecoveryRoutes(admission: Admission, _options: Record<string, never> = {}): void {
  for (const spec of routes) {
    // The mounted bag is never read: `requestDeps` binds this request's ports before every gate.
    mountPublicRawRoute<OwnerRecoveryRouteDeps>({ app: admission.app, spec, deps: requestDepsFor({ req: undefined as never, admission }), failure },
      { requestDeps: ({ req }) => requestDepsFor({ req, admission }) });
  }
}
