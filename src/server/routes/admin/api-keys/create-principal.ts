import { createApiKeyPrincipal } from "#src/features/identity/api-key-service";
import { toApiKeyPrincipalResponse } from "#src/server/http/admin/api-keys";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import {
  apiKeyServiceDepsFrom,
  rejectApiKeyCredential,
  sendApiKeyError,
  type ApiKeysRouteRegistrar,
} from "./deps.js";

/**
 * POST api-keys/principals — `APIKEY_PRINCIPAL_CREATE` (api.spec §1, 0.7.0). Mints the grantless
 * `kind='api_key'` principal `APIKEY_ISSUE` is required to bind to; before this endpoint existed
 * there was no HTTP path that could produce one, which made issuance unreachable in practice.
 *
 * Not workspace-scoped in its path: the workspace is the caller's own, resolved from the
 * credential, so there is no caller-supplied workspace field and no cross-workspace mint.
 *
 * Gated by `apikey.manage`, enforced inside `createApiKeyPrincipal` rather than here — same
 * placement (and same reason) as `users/create.ts`'s gate living in `grant-service.ts`.
 */
export const registerAdminApiKeyPrincipalCreateRoute: ApiKeysRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/api-keys/principals", async (req, res) => {
    try {
      // Inside the try: requireAdminSession always sets res.locals before this route runs, but
      // Express 4 doesn't catch a synchronous throw from an async handler outside try/catch (the
      // request would otherwise hang instead of 500ing).
      if (!rejectApiKeyCredential(res)) return;
      const caller = getAuthedPrincipal(res);

      const { principal } = await createApiKeyPrincipal({
        deps: apiKeyServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          displayName: req.body?.displayName,
          kind: req.body?.kind,
        },
      });

      res.status(201).json({ principal: toApiKeyPrincipalResponse(principal) });
    } catch (err) {
      sendApiKeyError(res, err);
    }
  });
};
