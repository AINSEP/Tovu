import { planPublishToPeer } from "#src/features/publish-content/push-plan";
import type { Response } from "express";

import { respondWithPeerActionError, createPeerCallResolver, registerPublishContentPeerPushRoutes as registerPushRoutes } from "@jini-ai/cms/admin-http/routes/publish-content/peer-transport";
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

import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";
import { failureReporterOf, adminFailureResponse } from "#src/server/inbound/shared/admin-failure";

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

export function respondWithError({ res, err }: { res: Response; err: unknown }, { message }: { message?: string } = {}): void {
  return respondWithPeerActionError({ err,
    json: (body, status) => { res.status(status).json(body); },
    incident: (error, facts) => adminFailureResponse({ error, reporter: failureReporterOf({ res }) }, facts),
    operation: "routes/publish-content/route-helpers",
    method: res.req?.method,
    route: typeof res.req?.route?.path === "string" ? res.req.route.path : undefined,
    discloseDetails: !res.req || !!res.locals?.principal,
  }, { message });
}

/** The three push routes, in their registered order; the pull spec follows them
 *  (`modules/publish-content-transport.ts`'s `registerPublishContentPeerTransportRoutes`). */
export const registerPublishContentPeerPushRoutes: PublishContentRouteRegistrar = ({ app, deps, errors }, _options = {}) => registerPushRoutes({
  mount: route => mountAdminJsonRoute({ app, errors, spec: route.spec,
    depsForRequest: ({ res }) => ({ workspaceId: deps.workspaceId, authorize: deps.authorize,
      ...route.requestDeps({ requireOverwriteSession: () => refuseUnlessSessionCredential({ res, gate: { message: "'overwriteEntityKeys' can only be sent from a signed-in admin session", permission: "publish_content.apply" } }) } as Parameters<typeof route.requestDeps>[0]),
    }),
  }, { preflight: route.preflight, failureWriter: ({ res, error }) => route.failure({ err: error,
    json: (body, status) => { res.status(status).json(body); },
    incident: (error, facts) => adminFailureResponse({ error, reporter: errors.reporter }, facts),
    method: res.req?.method,
    route: typeof res.req?.route?.path === "string" ? res.req.route.path : undefined,
    discloseDetails: !res.req || !!res.locals?.principal,
  }) }),
  openPeer: createPeerCallResolver({
    workspaceId: deps.workspaceId,
    resolveCredential: input => resolvePublishDestinationCredential({
      deps: { repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient }, input,
    }),
    httpClient: deps.publishContentPeerHttpClient,
    publishHistory: { store: deps.publishHistoryStore, clock: deps.clock },
  }),
  plan: ({ peer, principalId, scope, selectedEntityKeys, overwriteEntityKeys }) => planPublishToPeer({ deps: { ...deps, publishContentDeps: toPublishContentDeps(deps) }, peer, principalId }, { scope, selectedEntityKeys, overwriteEntityKeys }),
  confirm: ({ peer, planId, planHash }) => confirmPeerImport({ deps: peer, required: { planId, planHash } }),
  execute: ({ peer, ...required }) => executePeerImport({ deps: peer, required }),
  canPublishToLive: () => canPublishToLive({ resolveRuntimeMode }),
  liveSiteRefusal: { status: 403, body: { error: PUBLISH_FROM_LIVE_SITE_ERROR, code: PUBLISH_FROM_LIVE_SITE_CODE } },
  operation: "routes/publish-content/route-helpers",
});
