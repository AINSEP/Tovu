import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { createWidgetsApi } from "@jini-ai/admin/screens/widgets/api/widgets-api";

/**
 * @file The admin's widgets bindings: `@jini-ai/admin`'s widgets API client bound once to this host's
 * authenticated request and workspace. Every widgets caller (and the request-shape suites that spy on
 * it) reads this singleton; nothing else builds it.
 */

/** The admin API calls of the widgets feature, over this host's authenticated request. */
export const widgetsApi = createWidgetsApi({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
