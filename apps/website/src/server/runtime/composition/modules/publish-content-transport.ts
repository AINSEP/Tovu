import type { Express } from "express";

import {
  destinationConnectRoute, destinationDisconnectRoute, destinationReadRoute,
} from "@jini-ai/cms/admin-http/routes/publish-content/destination";
import {
  peerCreateRoute, peerDeleteRoute, peerListRoute, peerUpdateRoute, type PublishPeerErrorClasses,
} from "@jini-ai/cms/admin-http/routes/publish-content/peers";
import { peerPullRoute } from "@jini-ai/cms/admin-http/routes/publish-content/peer-transport";
import { connectAndRecordDestination, disconnectAndForgetDestination } from "@jini-ai/cms/publish/content/connect-destination";
import { createPublishContentPeer, deletePublishContentPeer, listPublishContentPeers, selectConnectedDestination, updatePublishContentPeer } from "@jini-ai/cms/publish/content/peer-registry";
import { PublishContentPeerDuplicateLabelError, PublishContentPeerNotFoundError, PublishContentPeerSecretStoreUnconfiguredError, PublishContentPeerValidationError } from "@jini-ai/cms/publish/content/peers";
import { pullAndStageFromPeer } from "#src/features/publish-content/pull";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import { connectDestination, disconnectDestination, PublishTrustConnectError } from "@jini-ai/cms/publish/trust/connect";
import { nowIso } from "@jini-ai/core/primitives";
import { PUBLISH_TRUST_WIRE } from "#src/contracts/core/publish-trust-wire";
import { PublishTrustHandshakeError } from "@jini-ai/cms/publish/trust/handshake-client";
import type { PublishTrustProvisioningPort } from "@jini-ai/cms/publish/trust/provisioning";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { PublishContentRouteDeps, PublishContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { registerPublishContentPeerPushRoutes } from "#src/server/inbound/admin-http/routes/publish-content/peer-transport";
import { knownPeerActionRefusal } from "@jini-ai/cms/admin-http/routes/publish-content/peer-transport";

/**
 * @file K1 (RT-K1-adm-publish-content, transport half): the publish-content peer CRUD and
 * zero-setup destination routes are Jini route specs (`@jini-ai/cms/admin-http/routes/publish-content/*`)
 * mounted behind the admin ports. `PublishContentRouteDeps` is read only here: each mount builds
 * that route's small deps, binding the host's peer store, sealer/keyring, publishing-trust handshake,
 * grant file and typed errors as collaborators read per request. Both families authorized through
 * `authorizeOrRespond` (`"guarded"`: a publishing credential answers from its grant).
 */

/** The two port fields every mount passes; `authorize` read per request, as the hand-written routes did. */
function transportPortDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  // The hand-written routes never named an entity to `deps.authorize`; the spec's `entityType` (core's
  // port requires one) is dropped so RBAC sees the same params as before (as `modules/plugins.ts` does).
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, entityId: _entityId, ...params }) => deps.authorize(params) };
}

/** `guarded` + the unexpected-failure copy key the hand-written route used for its redacted 500. */
function guardedMount({ operation }: { operation: string }, _optional: Record<string, never> = {}) {
  return { authorization: "guarded" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

const PEER_ERRORS: PublishPeerErrorClasses = {
  validation: PublishContentPeerValidationError,
  duplicateLabel: PublishContentPeerDuplicateLabelError,
  notFound: PublishContentPeerNotFoundError,
  secretStoreUnconfigured: PublishContentPeerSecretStoreUnconfiguredError,
};

/** The write-side dependency bag, assembled per call so a later reassignment of a repo is honoured. */
function peerWriteDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}) {
  return { repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
}

/** Peer CRUD (list/create/update/delete), same order as before. An unmapped failure keeps the copy
 *  key the shared `mappedErrorResponse` used (`routes/publish-content/route-helpers`). */
export const registerPublishContentPeerRoutes: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const base = { ...transportPortDeps({ deps }), peerErrors: PEER_ERRORS };
  const mount = guardedMount({ operation: "routes/publish-content/route-helpers" });
  const listPeers = (input: { workspaceId: string }, _o: Record<string, never> = {}) => listPublishContentPeers({ deps: { repo: deps.publishContentPeerRepo }, input });
  mountAdminJsonRoute({ app, spec: peerListRoute, deps: { ...base, listPeers } }, mount);
  const createPeer = (input: Parameters<typeof createPublishContentPeer>[0]["input"], _o: Record<string, never> = {}) =>
    createPublishContentPeer({ deps: peerWriteDeps({ deps }), input });
  mountAdminJsonRoute({ app, spec: peerCreateRoute, deps: { ...base, createPeer } }, mount);
  const updatePeer = (input: Parameters<typeof updatePublishContentPeer>[0]["input"], _o: Record<string, never> = {}) =>
    updatePublishContentPeer({ deps: peerWriteDeps({ deps }), input });
  mountAdminJsonRoute({ app, spec: peerUpdateRoute, deps: { ...base, updatePeer } }, mount);
  const deletePeer = (input: { workspaceId: string; id: string }, _o: Record<string, never> = {}) => deletePublishContentPeer({ deps: { repo: deps.publishContentPeerRepo }, input });
  mountAdminJsonRoute({ app, spec: peerDeleteRoute, deps: { ...base, deletePeer } }, mount);
};

/** The destination routes' host-only collaborators: the grant file and the deploy-config candidate. */
export interface PublishDestinationDeps {
  readonly provisioning: PublishTrustProvisioningPort;
  /** The address to offer, from the repo's committed deploy config. */
  readonly findCandidate: () => Promise<string | null>;
}

/** Connect: the publishing-trust handshake writes the grant, then the peer row is recorded. */
function connectWith({ deps, own }: { deps: PublishContentRouteDeps; own: PublishDestinationDeps }, _optional: Record<string, never> = {}) {
  return ({ workspaceId, baseUrl, entityTypes }: { workspaceId: string; baseUrl: string; entityTypes: string[] }, _o: Record<string, never> = {}) => {
    const trustDeps = { httpClient: deps.publishContentPeerHttpClient, protocol: PUBLISH_TRUST_WIRE, keyring: deps.siteAssistantSecretKeyring, provisioning: own.provisioning, clock: deps.clock, nowIso, workspaceId };
    return connectAndRecordDestination({
      deps: {
        repo: deps.publishContentPeerRepo, clock: deps.clock, idGen: deps.idGen,
        connectGrant: (input, _options: Record<string, never> = {}) => connectDestination({ deps: trustDeps, input }),
        reverseGrant: () => disconnectDestination({ deps: trustDeps }),
      },
      input: { workspaceId, baseUrl, entityTypes },
    });
  };
}

/** Disconnect: forget the peer row and reverse this computer's grant. */
function disconnectWith({ deps, own }: { deps: PublishContentRouteDeps; own: PublishDestinationDeps }, _optional: Record<string, never> = {}) {
  return ({ workspaceId }: { workspaceId: string }, _o: Record<string, never> = {}) => disconnectAndForgetDestination({
    deps: {
      repo: deps.publishContentPeerRepo, clock: deps.clock, idGen: deps.idGen,
      reverseGrant: () => disconnectDestination({ deps: { keyring: deps.siteAssistantSecretKeyring, provisioning: own.provisioning, workspaceId } }),
    },
    input: { workspaceId },
  });
}

/**
 * Registers `GET`, `POST /connect` and `POST /disconnect` under
 * `/api/admin/v1/workspaces/:workspaceId/publish-content/destination`, same order as before.
 * @complexity O(1) per request beyond each handler's own cost.
 */
export function registerPublishContentDestinationRoutes(
  { app, deps, own }: { app: Express; deps: PublishContentRouteDeps; own: PublishDestinationDeps }, _options: Record<string, never> = {},
): void {
  const base = {
    ...transportPortDeps({ deps }),
    destinationErrors: { handshake: PublishTrustHandshakeError, notSaved: PublishTrustConnectError },
    findCandidate: () => own.findCandidate(),
  };
  const mount = guardedMount({ operation: "routes/publish-content/destination" });
  const findConnectedPeer = async ({ workspaceId }: { workspaceId: string }, _o: Record<string, never> = {}) =>
    selectConnectedDestination({ rows: await deps.publishContentPeerRepo.listByWorkspace({ workspaceId }) }) ?? null;
  mountAdminJsonRoute({ app, spec: destinationReadRoute, deps: { ...base, findConnectedPeer } }, mount);
  const listPublishableTypes = () => listPublishContentContributors().map((contributor) => contributor.entityType);
  mountAdminJsonRoute({ app, spec: destinationConnectRoute, deps: { ...base, listPublishableTypes, connectDestination: connectWith({ deps, own }) } }, mount);
  mountAdminJsonRoute({ app, spec: destinationDisconnectRoute, deps: { ...base, disconnectDestination: disconnectWith({ deps, own }) } }, mount);
}

/**
 * The peer transport under `.../publish-content/peers/:peerId`, same order as before: the three
 * hand-written push routes (`routes/publish-content/peer-transport.ts`), then `POST .../pull` as the Jini
 * spec. Pull's failures answer through `knownPeerActionRefusal`, else the redacted 500 under the copy
 * key `respondWithError` used (`routes/publish-content/route-helpers`).
 */
export const registerPublishContentPeerTransportRoutes: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  registerPublishContentPeerPushRoutes({ app, deps });
  const pullAndStage = ({ peerId, principalId }: { peerId: string; principalId: string }) => pullAndStageFromPeer({ deps, input: { peerId, principalId } });
  mountAdminJsonRoute({ app, spec: peerPullRoute, deps: { ...transportPortDeps({ deps }), peerActionRefusal: ({ error }) => knownPeerActionRefusal({ err: error }), pullAndStage } },
    { authorization: "guarded", failure: { operation: "routes/publish-content/route-helpers" } });
};
