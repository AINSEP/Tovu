import { bundleCreateRoute, type BundleCreateRouteDeps } from "@jini-ai/cms/admin-http/routes/publish-content/bundle-create";
import { capabilitiesRoute, type CapabilitiesRouteDeps } from "@jini-ai/cms/admin-http/routes/publish-content/capabilities";
import { PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES } from "@jini-ai/cms/publish/transfer";
import { readBackstopMetadata } from "#src/features/publish-content/backstop-service";
import { buildPublishContentCatalog, type PackedEntity } from "#src/features/publish-content/type-registry";
import { backstopGrantAllows, isBackstopEntityType } from "#src/features/publish-trust/grant";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminPublishTrustFor, adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { toPublishContentDeps, type PublishContentRouteRegistrar, type PublishContentRouteDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { buildPublishBackstopPorts } from "#src/server/runtime/composition/publish-backstop-ports";

import { cappedApp } from "./capped-route-app.js";

/**
 * @file K1 (w3, publish-content ingest half): the routes a publishing source calls on this
 * destination, as Jini route specs (`@jini-ai/cms/admin-http/routes/publish-content/*`) behind the
 * admin ports. `PublishContentRouteDeps` is read only here; each mount binds that route's small deps
 * (the content-type registry, the grant rules, the manual-send reader and audit probe) per request.
 */

/** The two port fields every mount passes; `authorize` read per request, as the hand-written routes did. */
function ingestPortDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The bundle staging spec's deps. The registry is read per request (contributors register at boot and in tests). */
function bundleCreateDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): BundleCreateRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...ingestPortDeps({ deps }),
    get bundleRepo() { return deps.publishContentBundleRepo; },
    get clock() { return deps.clock; },
    get idGen() { return deps.idGen; },
    schemaVersions: () => new Map(buildPublishContentCatalog(toPublishContentDeps(deps)).handlers.map((handler) => [handler.entityType, handler.schemaVersion])),
    // The ports hand the spec the session principal copy they authenticated; the facts are keyed on it.
    publishTrust: ({ context }) => adminRequestFactsFor({ context: context as OperatorPrincipalRecord | undefined }).publishTrust,
    isBackstopEntityType,
    backstopGrantAllows: ({ grant, entityType }) => backstopGrantAllows({ grant: grant as PublishTrustContext | null, entityType }),
    readBackstopMetadata: ({ entities }) => readBackstopMetadata({ entities: entities as unknown as PackedEntity[] }),
    backstopAuditReady: async () => Boolean(await buildPublishBackstopPorts(deps).audit?.ready()),
  };
}

/**
 * `POST .../publish-content/bundles` (Task 6): the Jini spec behind the admin ports (`"guarded"`, the
 * route's own 500 copy). The body cap stays this host's Express binding in the SAME route registration
 * (`cappedApp`): its 413 body `{ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" }`
 * predates the kit's envelope, it runs before the workspace 404 as before, and the route-table pin keeps
 * its two-handler row. The spec reads the request `Host` (the manual-send address check) through the
 * `requestFacts` opt-in and the publishing grant through `adminRequestFactsFor`.
 */
export const registerPublishContentBundleCreateRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES }) });
  mountAdminJsonRoute(
    { app: capped, spec: { ...bundleCreateRoute, requestFacts: true }, deps: bundleCreateDeps({ deps }) },
    { authorization: "guarded", failure: { operation: "routes/publish-content/bundle-create", code: "INTERNAL_ERROR" } },
  );
};

/** The capabilities spec's deps: the registry (read per request), the grant and the manual-send rules. */
function capabilitiesDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): CapabilitiesRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...ingestPortDeps({ deps }),
    handlers: () => buildPublishContentCatalog(toPublishContentDeps(deps)).handlers,
    // Grant-only read: this route never branches on the credential kind, so a request whose session
    // layer recorded no kind still answers from its grant (as the hand-written route did).
    publishTrust: ({ context }) => adminPublishTrustFor({ context: context as OperatorPrincipalRecord | undefined }),
    isBackstopEntityType,
    backstopGrantAllows: ({ grant, entityType }) => backstopGrantAllows({ grant: grant as PublishTrustContext | null, entityType }),
  };
}

/**
 * `GET .../publish-content/capabilities` (S-F1): the Jini spec behind the admin ports (`"guarded"`,
 * the route's own 500 copy). What this instance accepts, for the caller's grant; see the spec's header.
 */
export const registerPublishContentCapabilitiesRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: capabilitiesRoute, deps: capabilitiesDeps({ deps }) },
    { authorization: "guarded", failure: { operation: "routes/publish-content/capabilities", code: "INTERNAL_ERROR" } },
  );
};
