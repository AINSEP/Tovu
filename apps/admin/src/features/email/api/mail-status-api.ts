import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminMailStatus } from "./mail-status-api.types";

/** The admin API calls of the email feature. */
export const mailStatusApi = {
  /** Whether outbound email really sends — the form editor greys out its notify settings when not. */
  getMailStatus: () => request<AdminMailStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/mail-status` }),
};
