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
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteRegistrar } from "./deps.js";

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
 *  error the operator can fix by retyping the same value.
 *  @complexity O(1). */
function statusFor(err: unknown): { status: number; code: string } {
  if (err instanceof PublishContentPeerValidationError) return { status: 400, code: "VALIDATION_ERROR" };
  if (err instanceof PublishContentPeerDuplicateLabelError) return { status: 409, code: "DUPLICATE_LABEL" };
  if (err instanceof PublishContentPeerNotFoundError) return { status: 404, code: "PEER_NOT_FOUND" };
  // The root key is unset/misconfigured. Operator-actionable and NOT a leak: the message names the
  // configuration failure, never the plaintext that failed to seal.
  if (err instanceof PublishContentPeerSecretStoreUnconfiguredError) return { status: 503, code: "SECRET_STORE_UNCONFIGURED" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

/** Sends the mapped error body. `message` comes from a typed store error only — a raw driver error
 *  falls through to the generic 500 text rather than being echoed.
 *  @complexity O(1). */
function respondWithError(res: { status(code: number): { json(body: unknown): void } }, err: unknown): void {
  const { status, code } = statusFor(err);
  const message = status === 500 ? "internal error" : err instanceof Error ? err.message : "internal error";
  res.status(status).json({ error: message, code });
}

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

export const registerPublishContentPeerRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content/peers";

  app.get(base, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const peers = await listPublishContentPeers({ repo: deps.publishContentPeerRepo }, { workspaceId: deps.workspaceId });
      res.json({ peers });
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(base, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.apply",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const peer = await createPublishContentPeer(toWriteDeps(deps), {
        workspaceId: deps.workspaceId,
        label: body.label,
        baseUrl: body.baseUrl,
        remoteWorkspaceId: body.remoteWorkspaceId,
        apiKey: body.apiKey,
      });
      res.status(201).json({ peer });
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.patch(`${base}/:peerId`, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.apply",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      // Keys are forwarded only when PRESENT — an absent key means "leave this field alone", which
      // is what lets the UI rename a peer without re-collecting its credential. Spreading
      // `undefined` in instead would make every PATCH a full replace.
      const peer = await updatePublishContentPeer(toWriteDeps(deps), {
        workspaceId: deps.workspaceId,
        id: String(req.params.peerId ?? ""),
        ...("label" in body ? { label: body.label } : {}),
        ...("baseUrl" in body ? { baseUrl: body.baseUrl } : {}),
        ...("remoteWorkspaceId" in body ? { remoteWorkspaceId: body.remoteWorkspaceId } : {}),
        ...("apiKey" in body ? { apiKey: body.apiKey } : {}),
      });
      res.json({ peer });
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.delete(`${base}/:peerId`, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.apply",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      // Idempotent 204, matching this codebase's other credential DELETE routes: deleting an
      // already-absent peer is a success, not a 404.
      await deletePublishContentPeer({ repo: deps.publishContentPeerRepo }, {
        workspaceId: deps.workspaceId,
        id: String(req.params.peerId ?? ""),
      });
      res.status(204).end();
    } catch (err) {
      respondWithError(res, err);
    }
  });
};
