import { bytesMatchSha256, isValidSha256Hex } from "#src/features/content-transport/blob-staging";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/features/media/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { ContentTransportRouteRegistrar } from "./deps.js";

/**
 * @file Task 6 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 6.
 *
 * `PUT /api/admin/v1/workspaces/:workspaceId/content-transport/blobs/:sha` — uploads one blob's
 * bytes, deduplicated via the SAME real `BlobStorePort.putIfAbsent` every media upload already uses
 * (dispatching brief: "media is the easy half of this feature ... reuse it, do not write a second
 * dedupe path"). Request body is JSON with base64-encoded bytes (`dataBase64`), mirroring
 * `routes/media/upload.ts`'s own documented simplification (no multipart-parsing dependency in this
 * repo yet).
 *
 * ## The refusal this route exists to enforce
 *
 * `putIfAbsent` (`@jini-ai/cms/media`'s `blob-store.fs.ts`/`blob-store.memory.ts`) does NOT verify
 * that the bytes it receives actually hash to the `sha256` it is given — it only uses that string to
 * derive a storage key and writes a create-only object there (see `blob-staging.ts`'s own header for
 * the full trace). The sha IS the identity everywhere else in this feature (baselines,
 * `PackedEntity.requiredBlobs`, a bundle's `blobManifest`), so this route calls
 * {@link bytesMatchSha256} and returns `422` on a mismatch BEFORE ever calling `putIfAbsent` —
 * accepting mismatched bytes here would let a caller poison content-addressed storage.
 */

/** Decodes base64 upload bytes, or `null` if `dataBase64` is missing, not a string, or not valid
 *  base64 — mirrors `routes/media/upload.ts`'s own `decodeUploadBytes`.
 *  @complexity O(n) in the encoded payload length. */
function decodeBlobBytes(rawBody: unknown): Uint8Array | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const dataBase64 = body.dataBase64;
  if (typeof dataBase64 !== "string" || !dataBase64) return null;
  try {
    return new Uint8Array(Buffer.from(dataBase64, "base64"));
  } catch {
    return null;
  }
}

export const registerContentTransportBlobPutRoute: ContentTransportRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/content-transport/blobs/:sha", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const claimedSha256 = String(req.params.sha ?? "");
    if (!isValidSha256Hex(claimedSha256)) {
      res.status(400).json({ error: "sha must be a lowercase 64-character hex sha256 digest" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "content.transport.apply",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const bytes = decodeBlobBytes(req.body);
      if (!bytes) {
        res.status(400).json({ error: "dataBase64 is required and must be valid base64" });
        return;
      }
      if (bytes.length > TOVU_MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: `blob exceeds the ${TOVU_MAX_UPLOAD_BYTES}-byte upload limit`, code: "PAYLOAD_TOO_LARGE" });
        return;
      }

      // The security property this route exists to hold — see this file's own header.
      // `putIfAbsent` trusts `claimedSha256` unconditionally; this check MUST run before it.
      if (!bytesMatchSha256({ bytes, claimedSha256 })) {
        res.status(422).json({ error: "the uploaded bytes do not hash to the claimed sha256", code: "SHA256_MISMATCH" });
        return;
      }

      const { written } = await deps.blobStore.putIfAbsent({ workspaceId: deps.workspaceId, sha256: claimedSha256, bytes });
      res.status(200).json({ sha256: claimedSha256, written });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
