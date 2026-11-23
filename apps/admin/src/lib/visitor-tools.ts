import { authenticatedAdminRequest } from "./admin-http/request";
import { WORKSPACE_ID } from "./admin-http/config";
import type { VisitorToolsPort, VisitorToolsView } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";

/** HTTP 409 code: someone else saved first; reload, never auto-retry. */
export const VISITOR_TOOLS_CONFLICT_CODE = "VISITOR_TOOLS_REVISION_CONFLICT";
/** Settings-ledger namespace the policy is stored under; the shared settings feed names it on change. */
export const VISITOR_TOOLS_NAMESPACE = "site.assistant";

const path = `/workspaces/${WORKSPACE_ID}/assistant/visitor-tools`;
/** Thin host adapter over the shared authenticated request (session, error and reconnect boundary). */
export const visitorToolsPort: VisitorToolsPort = {
  list: async () => (await authenticatedAdminRequest<{ data: VisitorToolsView }>({ path, method: "GET" })).data,
  configure: async (body, _optional = {}) => (await authenticatedAdminRequest<{ data: VisitorToolsView }>({ path, method: "PUT", body })).data,
};
