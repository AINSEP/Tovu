import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { createFormsApi } from "@jini-ai/admin/screens/forms/api/forms-api";

/**
 * @file The admin's forms bindings: `@jini-ai/admin`'s forms API client bound once to this host's
 * authenticated request and workspace. Every forms caller (and the request-shape suites that spy on
 * it) reads this singleton; nothing else builds it.
 */

/** The admin API calls of the forms feature, over this host's authenticated request. */
export const formsApi = createFormsApi({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
