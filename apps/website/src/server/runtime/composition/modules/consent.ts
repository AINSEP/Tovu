import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import {
  consentDryRunRoute, consentPreviewRoute, consentPublishRoute, consentReadinessRoute, consentSettingsGetRoute,
  consentSettingsPutRoute, type ConsentRouteDeps,
} from "@jini-ai/cms/admin-http/routes/consent/routes";
import type { SiteConsentService } from "@jini-ai/cookie-consent/site/service";
import { SiteConsentConflict } from "@jini-ai/cookie-consent/site/revisions";
import { consentRevisionToken, readConsentRequest } from "@jini-ai/cookie-consent/site/request";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The admin cookie-consent registrar: six Jini route specs mounted behind the admin ports.
 *
 * The registrar binds what the specs cannot import: the host's consent service, its closed request
 * contract (shared with the consent tool transport) and its revision-conflict class. Every route
 * answers an unexpected failure with the consent 503 guidance (published enforcement stays in place).
 */

/** The one failure every consent route answers for an unexpected error (the hand-written `sendAdminFailure` options). */
const CONSENT_FAILURE = { status: 503, operation: "consent-admin", code: "CONSENT_UNAVAILABLE", message: "Cookie consent settings are unavailable. Published enforcement remains in place." } as const;

/** Six HTTP endpoints, each behind the existing admin session gate and its service permission.
 * @example registerAdminConsentRoutes({ app, deps, service })
 * @complexity One service call per route; readiness renders at most one bounded local page. */
export function registerAdminConsentRoutes({ errors, app, deps, service }: { errors: RouteErrorPorts; app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize">; service: SiteConsentService }, _options = {}): void {
  const routeDeps: ConsentRouteDeps & { authorize: RouteDeps["authorize"] } = {
    workspaceId: deps.workspaceId,
    // Read per request, as the hand-written routes read `deps.authorize`.
    authorize: (params) => deps.authorize(params),
    consent: service,
    readConsentRequest: ({ body, fields }) => readConsentRequest({ body, fields }),
    consentRevisionToken: ({ input, key }) => consentRevisionToken({ input, key }),
    isConsentConflict: (error) => error instanceof SiteConsentConflict,
  };
  // Registration order is the hand-written order (route-table pin). All "guarded" (`authorizeOrRespond`).
  for (const spec of [consentSettingsGetRoute, consentReadinessRoute, consentDryRunRoute, consentPreviewRoute, consentSettingsPutRoute, consentPublishRoute]) {
    mountAdminJsonRoute({ errors, app, spec, deps: routeDeps }, { failure: CONSENT_FAILURE });
  }
}
