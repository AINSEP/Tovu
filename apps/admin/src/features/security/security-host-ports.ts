import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest, request } from "@/lib/admin-http/request";
import { createSecurityApi } from "@jini-ai/admin/security/api/security-api";

/**
 * @file The admin's security bindings: `@jini-ai/admin`'s security API client, bound once to this
 * host's authenticated requests and its workspace. Every security caller and the `lib/__tests__`
 * request-shape suites read this singleton; nothing else builds it.
 */

/** The admin API calls of the access-token and credential-copy features, over this host's requests. */
export const securityApi = createSecurityApi({ request, authenticatedRequest: authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
