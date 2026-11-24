import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createProvidersApi } from "@jini-ai/admin/screens/providers/api/providers-api";

/**
 * @file The admin's providers bindings: `@jini-ai/admin`'s providers API client, bound once to this
 * host's authenticated `request` and its workspace. Every providers caller and the `lib/__tests__`
 * request-shape suites read this singleton; nothing else builds it.
 */

/** The admin API calls of the providers feature, over this host's `request`. */
export const providersApi = createProvidersApi({ request, workspaceId: WORKSPACE_ID });
