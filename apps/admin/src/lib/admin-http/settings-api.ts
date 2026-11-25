import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "./request";
import { createSettingsApi } from "@jini-ai/admin/shell/lib/admin-http/settings-api";

/** The admin API calls of the settings feature, over this host's `authenticatedAdminRequest`. */
export const settingsApi = createSettingsApi({ authenticatedAdminRequest, workspaceId: WORKSPACE_ID });
