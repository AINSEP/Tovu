import { apiKeyIssueRoute } from "@jini-ai/user-management/admin-http/routes/api-keys/issue";
import { issueApiKey } from "#src/features/identity/api-key-binding";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { API_KEY_MOUNT_OPTIONS, apiKeyMountDeps, type ApiKeysRouteRegistrar } from "./deps.js";

/** POST api-keys — `APIKEY_ISSUE`; the spec (and its rationale) lives in Jini. Host binding only:
 * `issueApiKey` is the host's key-format-bound transition. Nothing here logs the response body. */
export const registerAdminApiKeyIssueRoute: ApiKeysRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: apiKeyIssueRoute, deps: { ...apiKeyMountDeps({ deps }), issueApiKey } }, API_KEY_MOUNT_OPTIONS);
};
