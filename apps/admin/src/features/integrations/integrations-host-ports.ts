import { WORKSPACE_ID } from "@/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createIntegrationsApi } from "@jini-ai/admin/screens/integrations/api/integrations-api";

/**
 * @file The admin's integrations bindings: `@jini-ai/admin`'s integrations API client (webhook
 * subscriptions, external MCP servers, Agent Plugins), bound once to this host's authenticated `request`
 * and its workspace. Every integrations caller and the `lib/__tests__` request-shape suites read this
 * singleton; nothing else builds it.
 */

/** The admin API calls of the integrations feature, over this host's `request`. */
export const integrationsApi = createIntegrationsApi({ request, workspaceId: WORKSPACE_ID });
