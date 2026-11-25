import { apiKeyRevokeRoute } from "@jini-ai/user-management/admin-http/routes/api-keys/revoke";
import { revokeApiKey } from "@jini-ai/user-management/identity/api-key-service";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { API_KEY_MOUNT_OPTIONS, apiKeyMountDeps, type ApiKeysRouteRegistrar } from "./deps.js";

/** POST api-keys/:id/revoke — `APIKEY_REVOKE`; the spec (and its rationale) lives in Jini.
 * Host binding only: the service and the per-request deps bag are injected here. */
export const registerAdminApiKeyRevokeRoute: ApiKeysRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: apiKeyRevokeRoute, deps: { ...apiKeyMountDeps({ deps }), revokeApiKey } }, API_KEY_MOUNT_OPTIONS);
};
