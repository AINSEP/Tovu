import { blobGetRoute, type BlobGetRouteDeps } from "@jini-ai/cms/admin-http/routes/publish-content/blob-get";
import { blobPutRoute, type BlobPutRouteDeps } from "@jini-ai/cms/admin-http/routes/publish-content/blob-put";
import { exportRoute, type ExportRouteDeps } from "@jini-ai/cms/admin-http/routes/publish-content/export";
import { createCompositePeerBlobSource } from "#src/features/publish-content/composite-blob-source";
import { packAuthorizedEntities } from "#src/features/publish-content/export-bundle";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { adminPublishTrustFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/publish-content/deps";

/**
 * @file The publish-content export stream and the blob channel (GET/PUT `blobs/:sha`): the host
 * registrars for the `@jini-ai/cms` specs. `RouteDeps` is read only here; each spec gets the small
 * deps it names. All three asked `authorizeOrRespond` (guarded); the two blob routes refused a
 * malformed `:sha` before reading the session, so their mounts opt into `deferMissingPrincipal`.
 */

/** Workspace + a lazily-read authorizer (tests reassign `deps.authorize` after registration). */
function blobPortDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** `GET …/publish-content/export` — the streamed bundle, a raw route (the body is piped, one entity at a time). */
export const registerPublishContentExportRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const routeDeps: ExportRouteDeps & AdminJsonRoutePortDeps = {
    ...blobPortDeps({ deps }),
    workspaceRepo: { findById: (input) => deps.workspaceRepo.findById(input) },
    isPublishingCredential: ({ context }) => Boolean(adminPublishTrustFor({ context: context as OperatorPrincipalRecord | undefined })),
    packEntities: ({ principalId }) => packAuthorizedEntities({ workspaceId: deps.workspaceId, principalId, authorize: deps.authorize, publishContentDeps: toPublishContentDeps(deps) }),
  };
  mountAdminRawRoute({ app, spec: exportRoute, deps: routeDeps }, { authorization: "guarded", failure: { operation: "routes/publish-content/export", code: "INTERNAL_ERROR" } });
};

/** `PUT …/publish-content/blobs/:sha` — one blob upload, refused unless the bytes hash to the claimed sha. */
export const registerPublishContentBlobPutRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const routeDeps: BlobPutRouteDeps & AdminJsonRoutePortDeps = {
    ...blobPortDeps({ deps }),
    blobStore: { putIfAbsent: (input) => deps.blobStore.putIfAbsent(input) },
  };
  mountAdminJsonRoute(
    { app, spec: blobPutRoute, deps: routeDeps },
    { authorization: "guarded", deferMissingPrincipal: true, failure: { operation: "routes/publish-content/blob-put", code: "INTERNAL_ERROR" } },
  );
};

/** `GET …/publish-content/blobs/:sha` — one blob download through the composite (blob store, then file-blob index) source. */
export const registerPublishContentBlobGetRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const routeDeps: BlobGetRouteDeps & AdminJsonRoutePortDeps = {
    ...blobPortDeps({ deps }),
    mediaRepo: deps.mediaRepo,
    assetBlobRepo: deps.assetBlobRepo,
    blobSource: () => createCompositePeerBlobSource({ blobStore: deps.blobStore, fileBlobIndex: deps.fileBlobIndex }),
  };
  mountAdminJsonRoute(
    { app, spec: blobGetRoute, deps: routeDeps },
    { authorization: "guarded", deferMissingPrincipal: true, failure: { operation: "routes/publish-content/blob-get", code: "INTERNAL_ERROR" } },
  );
};
