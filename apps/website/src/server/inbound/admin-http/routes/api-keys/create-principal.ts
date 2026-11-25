import { apiKeyPrincipalCreateRoute } from "@jini-ai/user-management/admin-http/routes/api-keys/create-principal";
import { createApiKeyPrincipal } from "@jini-ai/user-management/identity/api-key-service";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { API_KEY_MOUNT_OPTIONS, apiKeyMountDeps, type ApiKeysRouteRegistrar } from "./deps.js";

/** POST api-keys/principals — `APIKEY_PRINCIPAL_CREATE`; the spec (and its rationale) lives in Jini.
 * Host binding only: the service and the per-request deps bag are injected here. */
export const registerAdminApiKeyPrincipalCreateRoute: ApiKeysRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: apiKeyPrincipalCreateRoute, deps: { ...apiKeyMountDeps({ deps }), createApiKeyPrincipal } }, API_KEY_MOUNT_OPTIONS);
};
