import { type PeerCallDeps } from "@jini-ai/cms/publish/content/peer-transport";
import { planPublishToPeer } from "#src/features/publish-content/push-plan";
import type { Response } from "express";

import { peerPushPlanRoute, peerPushConfirmRoute, peerPushExecuteRoute, knownPeerActionRefusal, PEER_ACTION_ERRORS } from "@jini-ai/cms/admin-http/routes/publish-content/peer-transport";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { refuseUnlessSessionCredential } from "../../admin-request-facts.js";
import { confirmPeerImport, executePeerImport } from "#src/features/publish-content/peer-transport-binding";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import {
  canPublishToLive,
  PUBLISH_FROM_LIVE_SITE_CODE,
  PUBLISH_FROM_LIVE_SITE_ERROR,
} from "@jini-ai/cms/publish/content/live-site-policy";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "./deps.js";
import {
  mappedErrorResponse,
  sendRefusal,
} from "./route-helpers.js";
import { readRouteParam, rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.6/§4 task 10.
 *
 * The operator-facing half of the outbound leg, under
 * `/api/admin/v1/workspaces/:workspaceId/publish-content/peers/:peerId/...`:
 *
 * - `POST .../push/plan` → build a bundle here, upload the blobs the peer lacks, stage it there,
 *   return the PEER's gated plan.
 * - `POST .../push/confirm` → relay the operator's confirmation to the peer.
 * - `POST .../push/execute` → relay the redemption; the peer applies.
 * - `POST .../pull` → fetch the peer's export and stage it HERE, returning a local `bundleId` that
 *   this instance's own `/import/plan|confirm|execute` then drives. One importer, two directions.
 *   That route is the Jini spec `@jini-ai/cms/admin-http/routes/publish-content/peer-transport`,
 *   mounted by `runtime/composition/modules/publish-content-transport.ts` after the three below.
 *
 * ## FROZEN CONTRACT: every route here takes a `peerId`
 *
 * Never a raw URL and never a credential from the client. The URL comes from the
 * `publish_content_peers` row, and the credential is resolved from that row for the lifetime of one
 * request (see the next section). A client that could supply a URL would turn these routes into an SSRF primitive
 * wearing an authorization check; a client that could supply a credential would make the sealed
 * column pointless.
 *
 * ## Where the safety properties live
 *
 * On a PUSH, they live on the DESTINATION: the peer runs its own `gated-mutations` gateway, so
 * `PLAN_STALE`, single-redemption tokens, `AGENT_CANNOT_CONFIRM` and the restore point are enforced
 * by the code that owns the data being written. This file only relays — it cannot assert a principal
 * kind over the wire, so it cannot weaken the agent-confirm guard even in principle.
 *
 * On a PULL, they live HERE, in the existing `/import/*` ceremony — which is exactly why this pull
 * route stops at staging rather than planning: adding a second entry point into `planImport` would
 * be a second place the gate could be forgotten.
 *
 * ## Two kinds of destination, resolved in one place
 *
 * `openPeer` no longer calls `resolvePeerCredential` directly. `destination-credential.ts` decides
 * whether this destination is an explicitly-configured peer (a sealed key, opened per request) or
 * one this install is CONNECTED to (nothing stored; a session token minted by proving possession of
 * the site key). Both arrive as the same `ResolvedPeerCredential`, so every route below is
 * unchanged and cannot tell them apart.
 *
 * ## The credential never appears in a response
 *
 * Nothing in this file reads `credential.apiKey`; it is passed straight into the transport driver,
 * which puts it in one `Authorization` header. Every error body below is built from a typed error
 * whose message is derived from the PEER's response, never from the request.
 */

/** Answers a peer action's failure. Manual publishing (`backstop.ts`) reuses it, so a live-site
 *  failure reaches the owner there as the same actionable answer; `message` names its private 500.
 *  @complexity O(1). */
export function respondWithError({ res, err }: { res: Response; err: unknown }, { message }: { message?: string } = {}): void {
  const known = knownPeerActionRefusal({ err });
  if (known) { sendRefusal({ res, refusal: known }); return; }
  // The mapper needs the registered template to distinguish preparation from an uncertain send.
  // Concrete request paths and mounted base URLs can contain private IDs and never enter copy.
  sendRefusal({ res, refusal: mappedErrorResponse({ err, table: PEER_ACTION_ERRORS }, {
    tracker: res.locals?.adminFailureTracker, reporter: res.locals?.failureReporter, message, method: res.req?.method,
    route: typeof res.req?.route?.path === "string" ? res.req.route.path : undefined,
    discloseDetails: !res.req || !!res.locals?.principal,
  }) });
}

/** The per-request transport bag: the guarded client plus the opened credential.
 *  @complexity O(1) plus one repo read and one AEAD open. */
async function openPeer({ deps, peerId }: { deps: PublishContentRouteDeps; peerId: string }, _options: Record<string, never> = {}): Promise<PeerCallDeps> {
  const credential = await resolvePublishDestinationCredential({
    deps: {
      repo: deps.publishContentPeerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      httpClient: deps.publishContentPeerHttpClient,
    },
    input: { workspaceId: deps.workspaceId, id: peerId },
  });
  return { credential, httpClient: deps.publishContentPeerHttpClient,
    publishHistory: { store: deps.publishHistoryStore, workspaceId: deps.workspaceId, clock: deps.clock } };
}

function registerPushPlanRoute({ app, deps }: Parameters<PublishContentRouteRegistrar>[0]): void {
  mountAdminJsonRoute({ app, spec: peerPushPlanRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    requireOverwriteSession: (): void => { throw new Error("bound per request"); },
    openPeer: ({ peerId }) => openPeer({ deps, peerId }),
    plan: ({ peer, principalId, scope, selectedEntityKeys, overwriteEntityKeys }) => planPublishToPeer({ deps: { ...deps, publishContentDeps: toPublishContentDeps(deps) }, peer, principalId }, { scope, selectedEntityKeys, overwriteEntityKeys }),
  } }, {
    preflight: { readHeaders: [], check: () => canPublishToLive({ resolveRuntimeMode }) ? undefined : { status: 403, body: { error: PUBLISH_FROM_LIVE_SITE_ERROR, code: PUBLISH_FROM_LIVE_SITE_CODE } } },
    requestDeps: ({ res, deps: base }) => ({ ...base, requireOverwriteSession: () => refuseUnlessSessionCredential({ res, gate: { message: "'overwriteEntityKeys' can only be sent from a signed-in admin session", permission: "publish_content.apply" } }) }),
    failureWriter: ({ res, error }) => respondWithError({ res, err: error }),
  });
}

function registerPushConfirmRoute({ app, deps }: Parameters<PublishContentRouteRegistrar>[0]): void {
  mountAdminJsonRoute({ app, spec: peerPushConfirmRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    openPeer: ({ peerId }) => openPeer({ deps, peerId }),
    confirm: ({ peer, planId, planHash }) => confirmPeerImport({ deps: peer, required: { planId, planHash } }),
  } }, {
    preflight: { readHeaders: [], check: () => canPublishToLive({ resolveRuntimeMode }) ? undefined : { status: 403, body: { error: PUBLISH_FROM_LIVE_SITE_ERROR, code: PUBLISH_FROM_LIVE_SITE_CODE } } },
    failureWriter: ({ res, error }) => respondWithError({ res, err: error }),
  });
}

function registerPushExecuteRoute({ app, deps }: Parameters<PublishContentRouteRegistrar>[0]): void {
  mountAdminJsonRoute({ app, spec: peerPushExecuteRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    openPeer: ({ peerId }) => openPeer({ deps, peerId }),
    requireOverwriteSession: (): void => { throw new Error("bound per request"); },
    execute: ({ peer, ...required }) => executePeerImport({ deps: peer, required }),
  } }, {
    preflight: { readHeaders: [], check: () => canPublishToLive({ resolveRuntimeMode }) ? undefined : { status: 403, body: { error: PUBLISH_FROM_LIVE_SITE_ERROR, code: PUBLISH_FROM_LIVE_SITE_CODE } } },
    requestDeps: ({ res, deps: base }) => ({ ...base, requireOverwriteSession: () => refuseUnlessSessionCredential({ res, gate: { message: "'overwriteEntityKeys' can only be sent from a signed-in admin session", permission: "publish_content.apply" } }) }),
    failureWriter: ({ res, error }) => respondWithError({ res, err: error }),
  });
}

/** The three push routes, in their registered order; the pull spec follows them
 *  (`modules/publish-content-transport.ts`'s `registerPublishContentPeerTransportRoutes`). */
export const registerPublishContentPeerPushRoutes: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  registerPushPlanRoute({ app, deps });
  registerPushConfirmRoute({ app, deps });
  registerPushExecuteRoute({ app, deps });
};
