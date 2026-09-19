import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { CONTENT_TRANSPORT_BLOB_PROBE_MAX_SHAS, isValidSha256Hex } from "#src/features/content-transport/blob-staging";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";

import type { ContentTransportRouteRegistrar } from "./deps.js";

/**
 * @file Task 6 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 6.
 *
 * `POST /api/admin/v1/workspaces/:workspaceId/content-transport/blobs/probe` — "which of these shas
 * do you already have?" so a peer pushing a bundle only uploads what this instance is actually
 * missing (plan §4 task 6's own description). Read-only against the blob store (`exists()` only,
 * never `put*`); gated by `content.transport.apply` per the dispatching brief — this is part of the
 * write flow (a peer preparing to push), not the export/read side's `content.transport.read`.
 *
 * Request: `{ shas: string[] }`, each a lowercase 64-hex-char sha256 digest
 * (`blob-staging.ts`'s `isValidSha256Hex`). Response: `{ missing: string[] }` — the subset of
 * `shas` this instance does NOT already hold, in the order they were requested minus any removed as
 * duplicates-of-a-hit; the client uploads exactly this list via `PUT .../blobs/:sha`.
 */

/** Body-shape validation extracted from the handler for a single early-return gate: `shas` must be
 *  a non-empty array, within the resource-bounds cap, of strings that each look like a sha256 hex
 *  digest. Returns the validated array, or a human-readable error string to send as a 400.
 *  @complexity O(n) in the array length. */
function validateProbeShas(rawBody: unknown): { shas: string[] } | { error: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const shas = body.shas;
  if (!Array.isArray(shas) || shas.length === 0) {
    return { error: "shas must be a non-empty array of sha256 hex digests" };
  }
  if (shas.length > CONTENT_TRANSPORT_BLOB_PROBE_MAX_SHAS) {
    return { error: `at most ${CONTENT_TRANSPORT_BLOB_PROBE_MAX_SHAS} shas are allowed per request` };
  }
  for (const sha of shas) {
    if (typeof sha !== "string" || !isValidSha256Hex(sha)) {
      return { error: `'${String(sha)}' is not a valid lowercase sha256 hex digest` };
    }
  }
  return { shas: shas as string[] };
}

export const registerContentTransportBlobsProbeRoute: ContentTransportRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/content-transport/blobs/probe",
    rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }),
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
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

        const validated = validateProbeShas(req.body);
        if ("error" in validated) {
          res.status(400).json({ error: validated.error });
          return;
        }

        const missing: string[] = [];
        for (const sha256 of validated.shas) {
          const storageKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 });
          const present = await deps.blobStore.exists({ storageKey });
          if (!present) missing.push(sha256);
        }

        res.status(200).json({ missing });
      } catch {
        res.status(500).json({ error: "internal error" });
      }
    }
  );
};
