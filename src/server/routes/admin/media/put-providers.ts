import {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  saveMediaProviderCredentials,
} from "#src/media/provider-credential-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { MediaProviderRouteRegistrar } from "./deps";

/**
 * PUT the workspace's media-generation vendor credentials as a WHOLE SET. Answers
 * `MediaProvidersPort.saveMediaProviders` in `@jini-ai/ui`.
 *
 * Body is the provider map itself (`{ "openai": { apiKey?, baseUrl?, model? }, … }`), not a wrapped
 * envelope — matching the port's signature. A provider absent from the body is DELETED: the tab
 * sends its entire local map and expresses a cleared credential as an omission, so treating absence
 * as "leave alone" would make Clear silently do nothing.
 *
 * Gated by `media.write`, one step above the GET's `media.read`: this stores vendor API keys that
 * can spend real money, so it needs the same permission as mutating the asset library rather than
 * merely reading it.
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
        permission: "media.write",
        workspaceId: deps.workspaceId,
        entityType: "media",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.write' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.write", reason: authResult.reason },
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
