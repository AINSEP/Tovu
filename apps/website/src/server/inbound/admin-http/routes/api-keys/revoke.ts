import { revokeApiKey } from "#src/features/identity/api-key-service";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import {
  apiKeyServiceDepsFrom,
  rejectApiKeyCredential,
  sendApiKeyError,
  type ApiKeysRouteRegistrar,
} from "./deps.js";

/**
 * POST api-keys/:id/revoke — `APIKEY_REVOKE` (api.spec §1, state.spec §3 `REVOKE_API_KEY`).
 * Revocation takes effect immediately: `authenticateApiKey` reads `revokedAt` on every request, so
 * the next request presenting the key is rejected with no cache to wait out.
 *
 * Idempotent by design — re-revoking an already-revoked key is a 204, not a 409, so a client that
 * retries a timed-out revoke never has to distinguish "it worked" from "it already had".
 *
 * 204 with no body (api.spec §3), mirroring `users/reset-password.ts`.
 */
export const registerAdminApiKeyRevokeRoute: ApiKeysRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/api-keys/:id/revoke", async (req, res) => {
    try {
      if (!rejectApiKeyCredential(res)) return;
      const caller = getAuthedPrincipal(res);

      await revokeApiKey({
        deps: apiKeyServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          keyId: String(req.params.id ?? ""),
        },
      });

      res.status(204).end();
    } catch (err) {
      sendApiKeyError(res, err);
    }
  });
};
