import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createUsersApi } from "@jini-ai/user-management/react/users/api/users-api";

/** The admin API calls of the users feature, over this host's `request`. */
export const usersApi = createUsersApi({ request, workspaceId: WORKSPACE_ID });
