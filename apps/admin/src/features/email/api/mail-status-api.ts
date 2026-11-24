import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createMailStatusApi } from "@jini-ai/admin/screens/email/api/mail-status-api";

/** The admin API calls of the mail-status feature, over this host's `request`. */
export const mailStatusApi = createMailStatusApi({ request, workspaceId: WORKSPACE_ID });
