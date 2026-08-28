import { getMediaProviderCredentials } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { MediaProviderRouteRegistrar } from "./deps.js";

/**
 * GET the workspace's media-generation vendor credentials, as markers only — never key material.
 * Answers `MediaProvidersPort.fetchMediaProviders` in `@jini-ai/ui`.
 *
 * Gated by `media.read`, the same permission the rest of this module's read routes use: this is
 * media configuration for the workspace, and an operator who may list assets may see which vendors
 * are wired up (that a key exists and its last 4 characters — not the key).
 *
 * Returns a bare map rather than a `{ data }` envelope, because the port's `fetchMediaProviders`
 * resolves the `MediaProviderMap` directly and `{}` is a meaningful answer ("reached, manages
 * nothing") that must stay distinguishable from the unreachable case the client models as `null`.
 */
export const registerAdminMediaGetProvidersRoute: MediaProviderRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media/providers", async (req, res) => {
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

      const providers = await getMediaProviderCredentials(
        { repo: deps.mediaProviderCredentialRepo },
        { workspaceId: deps.workspaceId }
      );
      res.json(providers);
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
