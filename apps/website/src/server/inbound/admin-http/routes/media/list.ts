import { listMedia } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/tool-registrations";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaListResponse } from "#src/server/inbound/admin-http/http/media";
import { resolveContentTypes } from "./content-type.js";
import { resolveMediaByteSizes } from "./byte-size.js";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * GET all media in the workspace (all statuses — active + trashed; mirrors `listAdminPosts`).
 * Gated by `media.read` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 */
export const registerAdminMediaListRoute: MediaRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const kind = req.query.kind ?? "media";
    if (kind !== "media" && kind !== "document") { res.status(400).json({ error: "invalid media kind" }); return; }
    if (kind === "document") res.set("Cache-Control", "private, no-store");
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "media.read",
        workspaceId: deps.workspaceId,
        entityType: "media",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.read", reason: authResult.reason },
        });
        return;
      }

      const { media } = await listMedia({
        deps: { mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, kind },
      });
      const visible = kind === "document" ? media.filter(row => row.status === "active") : media;
      const [contentTypes, publicUrls, byteSizes] = await Promise.all([
        resolveContentTypes(deps, visible),
        resolveMediaPublicUrls(deps, visible),
        resolveMediaByteSizes({ deps, media: visible }),
      ]);
      res.json(toAdminMediaListResponse({ media: visible, contentTypesBySha256: contentTypes, publicUrlsById: publicUrls, byteSizesBySha256: byteSizes }));
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
