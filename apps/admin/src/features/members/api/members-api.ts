import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createMembersApi } from "@jini-ai/user-management/react/members/api/members-api";

/** The admin API calls of the members feature, over this host's `request`. */
export const membersApi = createMembersApi({ request, workspaceId: WORKSPACE_ID });
