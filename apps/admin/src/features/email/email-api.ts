import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { createEmailApi } from "@jini-ai/admin/screens/email/email-api";

/** The Email page's API port, over this host's `authenticatedAdminRequest`: one object a test replaces wholesale. */
export const emailApi = createEmailApi({ authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
