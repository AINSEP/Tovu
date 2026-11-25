import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createPagesApi } from "@jini-ai/admin/pages/api/pages-api";

/** The admin API calls of the pages feature, over this host's `request`. */
export const pagesApi = createPagesApi({ request, workspaceId: WORKSPACE_ID });
