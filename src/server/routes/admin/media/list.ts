import { listMedia } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { toAdminMediaListResponse } from "#src/server/http/admin/media";
import { resolveContentTypes } from "./content-type.js";
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
        input: { workspaceId: deps.workspaceId },
      });
      res.json(toAdminMediaListResponse(media, await resolveContentTypes(deps, media)));
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
