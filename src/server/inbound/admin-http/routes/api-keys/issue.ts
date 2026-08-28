import { issueApiKey } from "#src/features/identity/api-key-service";
import { toApiKeyIssueResponse } from "#src/server/inbound/admin-http/http/api-keys";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import {
  apiKeyServiceDepsFrom,
  rejectApiKeyCredential,
  sendApiKeyError,
  type ApiKeysRouteRegistrar,
} from "./deps.js";

/**
 * POST api-keys — `APIKEY_ISSUE` (api.spec §1, state.spec §3 `ISSUE_API_KEY`). Issues a key bound
 * to a grantless `kind='api_key'` principal, snapshotting the requested policies into a frozen,
 * machine-owned policy that a later `WRITE_POLICY_PERMISSION` can never widen (F-054-01).
 *
 * **This is the only response in the admin API that contains a live secret.** `rawKey` is produced
 * by `issueApiKey` in memory and returned once; the row it writes holds a scrypt digest of the
 * secret half only, so no subsequent read of any table can reproduce it (INV-05). Nothing in this
 * handler logs the response body.
 *
 * Gated by `apikey.manage` plus the INV-07 issuance clamp, both enforced inside `issueApiKey`.
 */
export const registerAdminApiKeyIssueRoute: ApiKeysRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/api-keys", async (req, res) => {
    try {
      if (!rejectApiKeyCredential(res)) return;
      const caller = getAuthedPrincipal(res);

      const { apiKey, rawKey } = await issueApiKey({
        deps: apiKeyServiceDepsFrom(deps),
        input: {
          workspaceId: deps.workspaceId,
          callerPrincipalId: caller.id,
          principalId: req.body?.principalId,
          label: req.body?.label,
          policyIds: req.body?.policyIds,
          expiresAt: req.body?.expiresAt,
        },
      });

      res.status(201).json({ apiKey: toApiKeyIssueResponse({ apiKey, rawKey }) });
    } catch (err) {
      sendApiKeyError(res, err);
    }
  });
};
