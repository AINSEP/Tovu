import { createScreenshotCleanupClient } from "@jini-ai/admin/screens/storage/api/screenshot-cleanup-api";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";

/** The live client over this admin's `request` and workspace. */
export const screenshotCleanupClient = createScreenshotCleanupClient({ request: request as Parameters<typeof createScreenshotCleanupClient>[0]["request"], workspaceId: WORKSPACE_ID, path: ({ workspaceId }) => `/workspaces/${workspaceId}/storage/screenshots` }, {});
