import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createPluginsApi } from "@jini-ai/admin/screens/plugins/api/plugins-api";

/**
 * @file The admin's plugins bindings: `@jini-ai/admin`'s plugins API client, bound once to this
 * host's authenticated `request` and its workspace. The plugins port and the `lib/__tests__`
 * request-shape suites read this singleton; nothing else builds it.
 */

/** The admin API calls of the plugins feature, over this host's `request`. */
export const pluginsApi = createPluginsApi({ request, workspaceId: WORKSPACE_ID });
