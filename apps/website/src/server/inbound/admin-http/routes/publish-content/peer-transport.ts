import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { stageBundle } from "#src/features/publish-content/bundle-staging";
import { buildExportBundle, selectBundleEntities } from "#src/features/publish-content/export-bundle";
import {
  confirmPeerImport,
  executePeerImport,
  pullBlobsFromPeer,
  pullBundleFromPeer,
  pushBundleToPeer,
  PublishContentPeerTransportError,
} from "#src/features/publish-content/peer-transport";
import { labelPeerPlanRows } from "#src/features/publish-content/report-labels";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import {
  PublishContentPeerCredentialMissingError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  type ResolvedPeerCredential,
} from "#src/features/publish-content/peers";
import { PublishTrustHandshakeError } from "#src/features/publish-trust/handshake-client";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "./deps.js";

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
 * the Site Token). Both arrive as the same `ResolvedPeerCredential`, so every route below is
 * unchanged and cannot tell them apart.
 *
 * ## The credential never appears in a response
 *
 * Nothing in this file reads `credential.apiKey`; it is passed straight into the transport driver,
 * which puts it in one `Authorization` header. Every error body below is built from a typed error
 * whose message is derived from the PEER's response, never from the request.
 */

/** @complexity O(1). */
function statusFor(err: unknown): { status: number; code: string } {
  if (err instanceof PublishContentPeerNotFoundError) return { status: 404, code: "PEER_NOT_FOUND" };
  // A connected destination's handshake. 502 for the same reason a transport error is: this
  // instance is fine and the request was well-formed — the far side (or the path to it) is what
  // failed, and the message is already the sentence the owner needs to act on.
  if (err instanceof PublishTrustHandshakeError) return { status: 502, code: "PUBLISH_TRUST_HANDSHAKE_FAILED" };
  if (err instanceof PublishContentPeerCredentialMissingError) return { status: 409, code: "PEER_CREDENTIAL_MISSING" };
  if (err instanceof PublishContentPeerSecretStoreUnconfiguredError) return { status: 503, code: "SECRET_STORE_UNCONFIGURED" };
  if (err instanceof PublishContentPeerTransportError) {
    // 502: this instance is fine and the request was well-formed; the PEER (or the path to it) is
    // what failed. A 500 here would send an operator looking in the wrong server's logs — and for
    // `EGRESS_REFUSED` specifically, the message is the `devHostAllowlist` diagnosis, which is only
    // actionable if it reaches them intact.
    return { status: 502, code: err.code };
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}

/** @complexity O(1). */
function respondWithError(res: { status(code: number): { json(body: unknown): void } }, err: unknown): void {
  const { status, code } = statusFor(err);
  const message = status === 500 ? "internal error" : err instanceof Error ? err.message : "internal error";
  res.status(status).json({ error: message, code });
}

/** The per-request transport bag: the guarded client plus the opened credential.
 *  @complexity O(1) plus one repo read and one AEAD open. */
async function openPeer(deps: PublishContentRouteDeps, peerId: string): Promise<{ credential: ResolvedPeerCredential; httpClient: PublishContentRouteDeps["publishContentPeerHttpClient"] }> {
  const credential = await resolvePublishDestinationCredential(
    {
      repo: deps.publishContentPeerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      httpClient: deps.publishContentPeerHttpClient,
    },
    { workspaceId: deps.workspaceId, id: peerId }
  );
  return { credential, httpClient: deps.publishContentPeerHttpClient };
}

/** Distinguishes "the body carried a malformed selection" (a 400) from "the body carried none"
 *  (`null`, publish everything) — two outcomes a bare `null` return could not tell apart. */
const INVALID_SELECTION = Symbol("invalid-selection");

/**
 * Reads `push/plan`'s optional per-row selection: the `entityKey` strings
 * (`planner.ts`'s `${entityType}:${entityId}`) the operator left checked in the dialog.
 *
 * Absent means "publish everything", which is what every caller before the checkbox column sent and
 * what the dialog still sends when nothing was unchecked — the common path stays a bodyless POST.
 * An empty ARRAY is a real, different answer ("the operator unchecked everything") and is honoured
 * as such: it stages an empty bundle and plans to zero rows rather than quietly publishing the lot.
 *
 * @complexity O(n) in the submitted key count.
 */
function readSelectedEntityKeys(body: unknown): readonly string[] | null | typeof INVALID_SELECTION {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.selectedEntityKeys === undefined || raw.selectedEntityKeys === null) return null;
  if (!Array.isArray(raw.selectedEntityKeys)) return INVALID_SELECTION;
  if (!raw.selectedEntityKeys.every((key): key is string => typeof key === "string")) return INVALID_SELECTION;
  return raw.selectedEntityKeys;
}

export const registerPublishContentPeerTransportRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content/peers/:peerId";

  /** Every route here shares the same preamble: mount-path 404, authenticated principal, and the
   *  `publish_content.apply` gate. Factored so a new peer action cannot accidentally ship without
   *  one of the three. Returns the principal id, or `null` when a response has already been sent. */
  const guard = async (req: { params: Record<string, string | undefined> }, res: Parameters<Parameters<typeof app.post>[1]>[1]): Promise<string | null> => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return null;
    }
    const principal = getAuthedPrincipal(res);
    const allowed = await authorizeOrRespond(res, deps.authorize, {
      principalId: principal.id,
      permission: "publish_content.apply",
      workspaceId: deps.workspaceId,
    });
    return allowed ? principal.id : null;
  };

  app.post(`${base}/push/plan`, async (req, res) => {
    try {
      const principalId = await guard(req, res);
      if (principalId === null) return;

      const selectedEntityKeys = readSelectedEntityKeys(req.body);
      if (selectedEntityKeys === INVALID_SELECTION) {
        res.status(400).json({ error: "'selectedEntityKeys' must be an array of strings", code: "VALIDATION_ERROR" });
        return;
      }

      const peer = await openPeer(deps, String(req.params.peerId ?? ""));
      const workspace = await deps.workspaceRepo.findById(deps.workspaceId);
      const fullBundle = await buildExportBundle({
        workspaceId: deps.workspaceId,
        principalId,
        authorize: deps.authorize,
        publishContentDeps: toPublishContentDeps(deps),
        sourceLabel: workspace?.name ?? deps.workspaceId,
      });
      // A selection narrows what is STAGED, before the peer plans it — so a deselected entity is
      // never uploaded, never planned and never applied, rather than being filtered out by some
      // later step that could forget. See `export-bundle.ts`'s `selectBundleEntities`.
      const bundle =
        selectedEntityKeys === null ? fullBundle : selectBundleEntities(fullBundle, new Set(selectedEntityKeys));

      const result = await pushBundleToPeer(
        {
          ...peer,
          blobSource: deps.blobStore,
          computeStorageKey: (sha256) => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }),
        },
        { bundle }
      );

      // The peer's gated plan is SPREAD at the top level, not nested under a `plan` key: this route
      // answers with the same `{domain, planId, planHash, details}` shape the LOCAL `/import/plan`
      // route does, so a client renders one plan shape regardless of direction (Task 11 binds
      // `details` as its `PublishContentReport`). The push-only fields sit alongside it.
      //
      // `bundleId` is load-bearing, not informational: the peer's `/import/execute` requires the
      // same bundle it planned, so a client MUST carry this value from here into `push/execute`.
      // Holding it server-side instead would mean remembering per-operator state between two
      // requests, which is exactly the kind of implicit session the gated ceremony avoids.
      res.json({
        peerId: peer.credential.id,
        peerLabel: peer.credential.label,
        bundleId: result.bundleId,
        entityCount: bundle.entities.length,
        blobsUploaded: result.blobsUploaded,
        blobsUnavailable: result.blobsUnavailable,
        // The peer's plan, with each row named from the bundle we just sent it — a live site
        // deployed before `entityLabel` existed answers rows with no label, and this side can name
        // its own content regardless. See `features/publish-content/report-labels.ts`.
        ...labelPeerPlanRows(result.plan, bundle.entities),
      });
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/push/confirm`, async (req, res) => {
    try {
      const principalId = await guard(req, res);
      if (principalId === null) return;

      const { planId, planHash } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const peer = await openPeer(deps, String(req.params.peerId ?? ""));
      res.json(await confirmPeerImport(peer, { planId, planHash }));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/push/execute`, async (req, res) => {
    try {
      const principalId = await guard(req, res);
      if (principalId === null) return;

      const { bundleId, confirmationToken } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof bundleId !== "string" || typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const peer = await openPeer(deps, String(req.params.peerId ?? ""));
      res.json(await executePeerImport(peer, { bundleId, confirmationToken }));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/pull`, async (req, res) => {
    try {
      const principalId = await guard(req, res);
      if (principalId === null) return;

      const peer = await openPeer(deps, String(req.params.peerId ?? ""));
      const envelope = await pullBundleFromPeer(peer);

      // Blobs BEFORE staging, for the same reason the push driver uploads before it stages: this
      // instance's own `planImport` marks an entity `blocked` when a required blob is absent HERE,
      // so bytes that arrive after the plan would produce a plan that is wrong the moment it is
      // acted on. Bytes are verified against the sha that was requested before they are stored —
      // see `pullBlobsFromPeer`'s own doc; a peer serving mismatched bytes aborts the pull and
      // stages nothing.
      const blobs = await pullBlobsFromPeer(
        {
          ...peer,
          blobSink: deps.blobStore,
          // THIS instance's workspace id: the bytes are being stored locally. The peer's id appears
          // only in the request path, which `peerRoute` builds from the credential.
          workspaceId: deps.workspaceId,
          computeStorageKey: (sha256) => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }),
        },
        { blobManifest: envelope.blobManifest }
      );

      // Staged through the SAME `stageBundle` a pushed bundle arrives by, so `expiresAt` is
      // server-computed and `sourcePrincipalId` is this request's AUTHENTICATED principal — never a
      // peer-declared identity (plan §1.6 / §5 risk #9: baselines key on the authenticated
      // principal, and a pulled bundle must not be able to claim someone else's sync memory).
      const { bundleId, expiresAt } = await stageBundle(
        {
          workspaceId: deps.workspaceId,
          sourcePrincipalId: principalId,
          artifactFormatVersion: envelope.artifactFormatVersion,
          hashVersion: envelope.hashVersion,
          sourceLabel: envelope.sourceLabel,
          entities: envelope.entities as unknown[],
          blobManifest: envelope.blobManifest as string[],
        },
        { repo: deps.publishContentBundleRepo, clock: deps.clock, idGen: deps.idGen }
      );

      res.status(201).json({
        peerId: peer.credential.id,
        peerLabel: peer.credential.label,
        bundleId,
        expiresAt,
        entityCount: envelope.entities.length,
        blobManifest: envelope.blobManifest,
        blobsDownloaded: blobs.downloaded,
        blobsAlreadyPresent: blobs.alreadyPresent,
        // Reported, not thrown: the peer no longer holds these bytes, so whatever entity requires
        // one will be `blocked` by this instance's own plan — the fail-closed outcome, and the
        // mirror of `push/plan`'s `blobsUnavailable`.
        blobsUnavailable: blobs.unavailable,
        // Beyond one pull's blob cap. Nothing is lost — pull again and these are fetched next
        // (`PUBLISH_CONTENT_PULL_MAX_BLOBS`).
        blobsDeferred: blobs.deferredOverCap,
      });
    } catch (err) {
      respondWithError(res, err);
    }
  });
};
