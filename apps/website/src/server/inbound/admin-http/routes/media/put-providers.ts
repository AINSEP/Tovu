import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  saveMediaProviderCredentials,
} from "#src/features/media/index";
// Deep import: `features/media/index.ts` is being edited on another branch; fold this into that
// barrel import once both land.
import { mergeMediaProviderCredentials } from "#src/features/media/provider-credential-store";
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
 * `?mode=merge` (B135/B136) switches to the PARTIAL save: only the providers the body names are
 * written, an absent provider is left untouched, and `null` deletes exactly that provider (plugin
 * vendors included). A screen that holds a possibly stale copy of the map must use it — the
 * whole-set default would delete a key someone else saved after that copy was read. A query flag,
 * not a new method, so existing whole-set callers keep working unchanged.
 *
 * The response never echoes key material — it is the same markers-only map GET returns. Three
 * failure outcomes, mirroring `put-site-credential.ts`'s split: 400 validation (unknown provider
 * id, wrong field type, oversized field), 503 `SECRET_STORE_UNCONFIGURED` (missing
 * `TOVU_SITE_KEY`, detected before any write lands), 500 everything else.
 */
export const registerAdminMediaPutProvidersRoute: MediaProviderRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/media/providers", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.integrations.manage", workspaceId: deps.workspaceId, entityType: "media" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const merge = isMergeMode({ mode: req.query?.mode });
      const writeDeps = {
        repo: deps.mediaProviderCredentialRepo,
        sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring,
        clock: deps.clock,
        providerCatalog: deps.mediaProviderRegistry,
      };
      const input = { workspaceId: deps.workspaceId, providers: (req.body ?? {}) as Record<string, never> };
      const providers = merge ? await mergeMediaProviderCredentials(writeDeps, input) : await saveMediaProviderCredentials(writeDeps, input);
      res.json(providers);
    } catch (err) {
      if (err instanceof MediaProviderCredentialValidationError) {
        res.status(400).json({ error: err.message, code: "MEDIA_PROVIDER_CREDENTIAL_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof MediaProviderCredentialSecretStoreUnconfiguredError) {
        res.status(503).json({
          error:
            "the media provider credential store is not configured — set TOVU_SITE_KEY (a hex-encoded site key) in the server environment",
          code: "SECRET_STORE_UNCONFIGURED",
        });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/media/put-providers", code: "INTERNAL_ERROR" });
    }
  });
};

/** Absent `mode` keeps the whole-set save; `merge` is the partial one. Anything else is refused
 *  before any write rather than guessed at, since guessing "whole set" would delete providers. */
function isMergeMode({ mode }: { mode: unknown }, _optional: Record<string, never> = {}): boolean {
  if (mode === undefined) return false;
  if (mode === "merge") return true;
  throw new MediaProviderCredentialValidationError('mode must be "merge" or left out');
}
