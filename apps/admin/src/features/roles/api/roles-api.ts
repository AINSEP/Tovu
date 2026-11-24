import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { createRolesApi } from "@jini-ai/user-management/react/roles/api/roles-api";

/** The admin API calls of the roles feature, over this host's `authenticatedAdminRequest`. */
export const rolesApi = createRolesApi({ authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
