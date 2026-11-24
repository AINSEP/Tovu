import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { createTrashApi } from "@jini-ai/admin/screens/trash/api/trash-api";

/** The admin API calls of the trash feature, over this host's `authenticatedAdminRequest`. */
export const trashApi = createTrashApi({ authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
