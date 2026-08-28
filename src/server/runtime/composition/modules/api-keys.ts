import { registerAdminApiKeyPrincipalCreateRoute } from "../../../inbound/admin-http/routes/api-keys/create-principal.js";
import { registerAdminApiKeyIssueRoute } from "../../../inbound/admin-http/routes/api-keys/issue.js";
import { registerAdminApiKeyRevokeRoute } from "../../../inbound/admin-http/routes/api-keys/revoke.js";
import type { ApiKeysRouteDeps } from "../../../inbound/admin-http/routes/api-keys/deps.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `api-keys` server module (SPEC-006 REQ-08) — the three api-key admin routes
 * (`APIKEY_PRINCIPAL_CREATE`, `APIKEY_ISSUE`, `APIKEY_REVOKE`).
 *
 * Split from the `users` module rather than folded into it: this family is the one with a
 * credential-kind restriction of its own (an api_key-authenticated caller is refused, see
 * `routes/admin/api-keys/deps.ts`'s `rejectApiKeyCredential`), and `ApiKeysRouteDeps` needs two
 * fields `UsersRouteDeps` does not (`apiKeyRepo`, `apiKeySecretHasher`).
 *
 * Every route here registers under `/api/admin`, so all three sit behind the session gate
 * `createCoreModule` mounts — this module must be mounted after it.
 */
export function createApiKeysModule(deps: ApiKeysRouteDeps): ServerModuleHandle {
  return {
    name: "api-keys",
    registerRoutes: (app) => {
      registerAdminApiKeyPrincipalCreateRoute(app, deps);
      registerAdminApiKeyIssueRoute(app, deps);
      registerAdminApiKeyRevokeRoute(app, deps);
    },
  };
}
