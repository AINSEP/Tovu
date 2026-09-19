import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { isValidSha256Hex } from "#src/features/publish-content/blob-staging";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/features/media/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteRegistrar } from "./deps.js";

/**
 * `GET /api/admin/v1/workspaces/:workspaceId/publish-content/blobs/:sha` — the DOWNLOAD half of the
 * blob channel, added 2026-09-19 to close a live gap: the push direction could upload bytes
 * (`blob-put.ts`) and ask what was missing (`blobs-probe.ts`), but nothing could fetch bytes back,
 * so a PULLED media entity always failed closed as `blocked` (`features/publish-content/
 * peer-transport.ts`'s own "KNOWN GAP" note). This route is that missing verb, and nothing else —
 * it is deliberately additive, and the pull architecture around it is untouched.
 *
 * ## Authorization: `publish_content.read`, and why that is not weaker than the upload path
 *
 * `blob-put.ts` gates on `publish_content.apply`; this route gates on `publish_content.read`. That
 * is a deliberate direction call, not a relaxation:
 *
 * - **Same holder set today.** `features/publish-content/permissions.ts` grants BOTH permissions to
 *   exactly one built-in role (`admin`), plus the seeded owner's `*` wildcard. No principal can
 *   reach this route that could not already reach `blob-put.ts`, and `editor`/`viewer` reach
 *   neither.
 * - **Same exposure as the route that reveals the shas.** `export.ts` gates on
 *   `publish_content.read` and hands out `blobManifest` — the list of shas — to exactly this holder
 *   set. Gating the bytes on the same permission means the bytes are never reachable by a principal
 *   who could not have learned the sha in the first place.
 * - **`apply` here would be a real privilege escalation.** A pull-only peer credential calls
 *   `GET .../export` and then this route. If the download demanded `apply`, every pull-only key
 *   would have to hold the permission that lets it WRITE content into the source instance. Demanding
 *   a write permission for a read is stricter on paper and strictly worse in practice.
 *
 * ## The threat this route must not become
 *
 * Content-addressed storage means a leaked or guessed sha is a read capability IF knowing the hash
 * is sufficient. It is not sufficient here. Three things close it, in order:
 *
 * 1. The mount-path workspace guard — the same `!== deps.workspaceId` 404 every route in this
 *    directory opens with.
 * 2. A real permission check against the AUTHENTICATED principal (above). Knowing a sha — even
 *    having uploaded those very bytes under `publish_content.apply` — grants nothing;
 *    `__tests__/../publish-content-blob-get.test.ts` pins that case directly.
 * 3. The storage key is DERIVED, never accepted: `computeBlobStorageKey({workspaceId, sha256})`
 *    with this composition's own `workspaceId`. A caller supplies 64 hex characters and nothing
 *    else, so there is no path/traversal surface and no way to address another workspace's bytes.
 *
 * ## Why the response is base64 JSON rather than octet-stream, and why it buffers
 *
 * The only consumer is `peer-transport.ts`'s driver, which speaks through ADR-038's
 * `HttpClientPort` — a fully-materialized `{status, headers, bodyText}` response, not a stream. A
 * JSON body mirrors `blob-put.ts`'s own `dataBase64` request shape exactly, so the two directions
 * agree. Buffering is not a choice this route can avoid either: `BlobStorePort.get()` returns
 * `Promise<Uint8Array>` — the port exposes no streaming read, and every existing consumer
 * (`routes/media/original.ts`, `public-http/.../media-rendition.ts`) buffers the same way. Memory is
 * therefore bounded by {@link TOVU_MAX_UPLOAD_BYTES} per request, enforced below, which also keeps
 * the base64 body (≈4/3 of 35 MiB) under the peer policy's 64 MiB `maxResponseBytes` cap.
 *
 * ## Why this does not re-hash the bytes before sending
 *
 * The receiver does, and the receiver's check is the one that matters: `pullBlobsFromPeer` hashes
 * what arrived and refuses to store a mismatch. That covers a poisoned store, a corrupted transfer
 * AND a hostile peer, which a server-side check cannot. Hashing here too would double the CPU per
 * download to re-prove a property the only trust boundary already enforces.
 */
export const registerPublishContentBlobGetRoute: PublishContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/publish-content/blobs/:sha", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const sha256 = String(req.params.sha ?? "");
    if (!isValidSha256Hex(sha256)) {
      res.status(400).json({ error: "sha must be a lowercase 64-character hex sha256 digest" });
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

      const storageKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 });
      if (!(await deps.blobStore.exists({ storageKey }))) {
        res.status(404).json({ error: "blob was not found", code: "BLOB_NOT_FOUND" });
        return;
      }

      const bytes = await deps.blobStore.get({ storageKey });
      if (bytes.byteLength > TOVU_MAX_UPLOAD_BYTES) {
        // Unreachable for anything this instance accepted (both `blob-put.ts` and the media upload
        // route enforce the same ceiling), so this is a bound on a store written by some other
        // means — never a silent 47 MB+ base64 response.
        res.status(413).json({ error: `blob exceeds the ${TOVU_MAX_UPLOAD_BYTES}-byte transfer limit`, code: "PAYLOAD_TOO_LARGE" });
        return;
      }

      res.status(200).json({ sha256, dataBase64: Buffer.from(bytes).toString("base64") });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
