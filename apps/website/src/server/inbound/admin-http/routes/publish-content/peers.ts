import {
  createPublishContentPeer,
  deletePublishContentPeer,
  listPublishContentPeers,
  PublishContentPeerDuplicateLabelError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  PublishContentPeerValidationError,
  updatePublishContentPeer,
} from "#src/features/publish-content/peers";
import type { PublishContentRouteRegistrar } from "./deps.js";
import {
  authorizedPrincipalId,
  bodyRecord,
  mappedErrorResponse,
  rejectForeignWorkspace,
  routeParam,
  sendRefusal,
  type MappedErrorClass,
} from "./route-helpers.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * CRUD for `publish_content_peers` under
 * `/api/admin/v1/workspaces/:workspaceId/publish-content/peers`.
 *
 * ## FROZEN CONTRACT (Task 10's dispatch — the admin UI is built against it)
 *
 * `GET .../peers` answers `{peers: [{id, label, baseUrl, remoteWorkspaceId, masked, hasCredential}]}`.
 * `masked` and `hasCredential` are the ONLY credential-shaped fields that ever leave the server —
 * no `sealedCiphertext`, `sealedNonce`, `sealedKeyId` or `sealedAlg` in any response body, log line
 * or error message, ever. That is enforced by construction rather than by review: every body below
 * is built from `PublishContentPeerSummary` (`features/publish-content/peers.ts`), a type with no
 * field capable of carrying sealed material, and this file never touches a
 * `PublishContentPeerRecord`.
 *
 * ## Permissions
 *
 * `publish_content.read` to list; `publish_content.apply` to create, update or delete. Deliberately
 * NOT `content.read`/`content.write`: those are a broader pre-existing pair, and reusing them here
 * would silently widen who can point this workspace's content at an external URL.
 */

/** Maps this feature's typed store errors to HTTP. Every case is a specific status — a validation
 *  refusal must never read as a server fault, and a duplicate label must never read as a validation
 *  error the operator can fix by retyping the same value. A raw driver error falls through to the
 *  generic 500 text rather than being echoed (`mappedErrorResponse`). */
const PEER_ERRORS: readonly MappedErrorClass[] = [
  [PublishContentPeerValidationError, 400, "VALIDATION_ERROR"],
  [PublishContentPeerDuplicateLabelError, 409, "DUPLICATE_LABEL"],
  [PublishContentPeerNotFoundError, 404, "PEER_NOT_FOUND"],
  // The site key is unset/misconfigured. Operator-actionable and NOT a leak: the message names the
  // configuration failure, never the plaintext that failed to seal.
  [PublishContentPeerSecretStoreUnconfiguredError, 503, "SECRET_STORE_UNCONFIGURED"],
];

/** The write-side dependency bag, assembled once per handler from this module's route deps.
 *  @complexity O(1). */
function toWriteDeps(deps: Parameters<PublishContentRouteRegistrar>[1]) {
  return {
    repo: deps.publishContentPeerRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };
}

const PEER_FIELDS = ["label", "baseUrl", "remoteWorkspaceId", "apiKey"] as const;

/** Keys are forwarded only when PRESENT — an absent key means "leave this field alone", which
 *  is what lets the UI rename a peer without re-collecting its credential. Spreading
 *  `undefined` in instead would make every PATCH a full replace.
 *  @complexity O(1) — four fixed fields. */
function presentPeerFields(body: Record<string, unknown>): Partial<Record<(typeof PEER_FIELDS)[number], unknown>> {
  return Object.fromEntries(PEER_FIELDS.filter((field) => field in body).map((field) => [field, body[field]]));
}

export const registerPublishContentPeerRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content/peers";

  app.get(base, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if ((await authorizedPrincipalId(res, deps, "publish_content.read")) === null) return;
      const peers = await listPublishContentPeers({ repo: deps.publishContentPeerRepo }, { workspaceId: deps.workspaceId });
      res.json({ peers });
    } catch (err) {
      sendRefusal(res, mappedErrorResponse(err, PEER_ERRORS));
    }
  });

  app.post(base, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if ((await authorizedPrincipalId(res, deps, "publish_content.apply")) === null) return;
      const body = bodyRecord(req.body);
      const peer = await createPublishContentPeer(toWriteDeps(deps), {
        workspaceId: deps.workspaceId,
        label: body.label,
        baseUrl: body.baseUrl,
        remoteWorkspaceId: body.remoteWorkspaceId,
        apiKey: body.apiKey,
      });
      res.status(201).json({ peer });
    } catch (err) {
      sendRefusal(res, mappedErrorResponse(err, PEER_ERRORS));
    }
  });

  app.patch(`${base}/:peerId`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if ((await authorizedPrincipalId(res, deps, "publish_content.apply")) === null) return;
      const peer = await updatePublishContentPeer(toWriteDeps(deps), {
        workspaceId: deps.workspaceId,
        id: routeParam(req, "peerId"),
        ...presentPeerFields(bodyRecord(req.body)),
      });
      res.json({ peer });
    } catch (err) {
      sendRefusal(res, mappedErrorResponse(err, PEER_ERRORS));
    }
  });

  app.delete(`${base}/:peerId`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if ((await authorizedPrincipalId(res, deps, "publish_content.apply")) === null) return;
      // Idempotent 204, matching this codebase's other credential DELETE routes: deleting an
      // already-absent peer is a success, not a 404.
      await deletePublishContentPeer({ repo: deps.publishContentPeerRepo }, {
        workspaceId: deps.workspaceId,
        id: routeParam(req, "peerId"),
      });
      res.status(204).end();
    } catch (err) {
      sendRefusal(res, mappedErrorResponse(err, PEER_ERRORS));
    }
  });
};
