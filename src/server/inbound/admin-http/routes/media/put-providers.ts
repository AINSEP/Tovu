import {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  saveMediaProviderCredentials,
} from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { MediaProviderRouteRegistrar } from "./deps.js";

/**
 * PUT the workspace's media-generation vendor credentials as a WHOLE SET. Answers
 * `MediaProvidersPort.saveMediaProviders` in `@jini-ai/ui`.
 *
 * Body is the provider map itself (`{ "openai": { apiKey?, baseUrl?, model? }, … }`), not a wrapped
 * envelope — matching the port's signature. A provider absent from the body is DELETED: the tab
 * sends its entire local map and expresses a cleared credential as an omission, so treating absence
 * as "leave alone" would make Clear silently do nothing.
 *
 * Gated by `admin.integrations.manage`, the same permission every other vendor-credential route in
 * this codebase uses (connectors, commerce, external-mcp, and the webhook-subscription routes in
 * `015-integrations.yaml`) — not `media.write`, which is deprecated and no longer granted to fresh
 * admin roles, so it would silently lock new admins out of a feature legacy admins can still reach.
 *
 * The response never echoes key material — it is the same markers-only map GET returns. Three
 * failure outcomes, mirroring `put-site-credential.ts`'s split: 400 validation (unknown provider
 * id, wrong field type, oversized field), 503 `SECRET_STORE_UNCONFIGURED` (missing
 * `TOVU_INTEGRATIONS_ROOT_KEY`, detected before any write lands), 500 everything else.
 */
export const registerAdminMediaPutProvidersRoute: MediaProviderRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/media/providers", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "media",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      const providers = await saveMediaProviderCredentials(
        {
          repo: deps.mediaProviderCredentialRepo,
          sealer: deps.siteAssistantSecretSealer,
          keyring: deps.siteAssistantSecretKeyring,
          clock: deps.clock,
        },
        { workspaceId: deps.workspaceId, providers: (req.body ?? {}) as Record<string, never> }
      );
      res.json(providers);
    } catch (err) {
      if (err instanceof MediaProviderCredentialValidationError) {
        res.status(400).json({ error: err.message, code: "MEDIA_PROVIDER_CREDENTIAL_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof MediaProviderCredentialSecretStoreUnconfiguredError) {
        res.status(503).json({
          error:
            "the media provider credential store is not configured — set TOVU_INTEGRATIONS_ROOT_KEY (a hex-encoded root key) in the server environment",
          code: "SECRET_STORE_UNCONFIGURED",
        });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
